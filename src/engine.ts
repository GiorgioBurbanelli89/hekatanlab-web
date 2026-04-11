import * as math from 'mathjs';
import { PlotCommand } from './plotter';
import { ViewCommand } from './viewer3d';
import { k_truss2d, k_frame2d, k_frame3d, T2d, T3d, assemble, k_cst, k_q4, k_plate_q4, k_plate_mitc4, k_shell6, space_frame_ke, space_frame_mass } from './fem';
import { femMatlabLibrary } from './fem-matlab';
import { getMesh as triangleMeshAsync, isTriangleReady } from './wasm/triangleMesh';
import { deformHybrid } from './fem/deformHybrid';
import { analyze } from './fem/analyze';
import { getLocalStiffnessMatrix } from './fem/utils/getLocalStiffnessMatrix';
import { eigenSolver } from './wasm/eigenSolver';
import type { Node, Element, NodeInputs, ElementInputs } from './fem/data-model';

// Pre-load Eigen WASM
eigenSolver.init().then(() => console.log('[Eigen WASM] ready')).catch(() => {});
// @ts-ignore
import nerdamer from 'nerdamer';
// @ts-ignore
import 'nerdamer/Algebra.js';
// @ts-ignore
import 'nerdamer/Calculus.js';
// @ts-ignore
import 'nerdamer/Solve.js';

export interface EvalResult {
  line: number;
  input: string;
  type: 'comment' | 'blank' | 'assign' | 'expr' | 'error' | 'separator' | 'heading' | 'funcdef' | 'plot' | 'disp';
  varName?: string;
  value?: any;
  formatted?: string;
  error?: string;
}

// Marker class for disp() — always shows output even inside loops
export class DispCommand {
  constructor(public value: any) {}
}

// ── Function Library (localStorage) ──
export interface StoredFunction {
  name: string;
  params: string[];
  body: string;
  description?: string;
  outputs?: string[];
}

const STORAGE_KEY = 'hekatanlab-functions';

export function loadFunctions(): StoredFunction[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function saveFunctions(fns: StoredFunction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fns));
}

export function addFunction(fn: StoredFunction) {
  const fns = loadFunctions().filter(f => f.name !== fn.name);
  fns.push(fn);
  saveFunctions(fns);
}

export function removeFunction(name: string) {
  saveFunctions(loadFunctions().filter(f => f.name !== name));
}

// ── MATLAB Function Parser ──
// Parses: function [out] = name(params) ... end
// Or:     function out = name(params) ... end
function parseMatlabFunctions(code: string): { functions: Map<string, StoredFunction>; cleanCode: string } {
  const functions = new Map<string, StoredFunction>();
  const lines = code.split('\n');
  const cleanLines: string[] = [];
  let inFunc = false;
  let currentFunc: { name: string; params: string[]; outVar: string; bodyLines: string[]; outputs: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Detect function definition: function [a,b] = name(params) or function a = name(params)
    const funcMatch = trimmed.match(/^function\s+(?:\[([^\]]+)\]\s*=\s*|(\w+)\s*=\s*)?(\w+)\s*\(([^)]*)\)/);
    if (funcMatch && !inFunc) {
      inFunc = true;
      const outputStr = funcMatch[1] || funcMatch[2] || 'ans';
      const outputs = outputStr.split(',').map((s: string) => s.trim()).filter((s: string) => s);
      currentFunc = {
        outVar: outputs[0],
        name: funcMatch[3],
        params: funcMatch[4].split(',').map((p: string) => p.trim()).filter((p: string) => p),
        bodyLines: [],
        outputs,
      };
      cleanLines.push(`% function ${currentFunc.name}(${currentFunc.params.join(', ')}) defined`);
      continue;
    }

    // Detect end of function
    if (inFunc && (trimmed === 'end' || trimmed === 'endfunction')) {
      if (currentFunc) {
        functions.set(currentFunc.name, {
          name: currentFunc.name,
          params: currentFunc.params,
          body: currentFunc.bodyLines.join('\n'),
          description: `Returns ${currentFunc.outputs ? currentFunc.outputs.join(', ') : currentFunc.outVar}`,
          outputs: currentFunc.outputs || [currentFunc.outVar],
        });
      }
      inFunc = false;
      currentFunc = null;
      continue;
    }

    if (inFunc && currentFunc) {
      currentFunc.bodyLines.push(lines[i]);
    } else {
      cleanLines.push(lines[i]);
    }
  }

  return { functions, cleanCode: cleanLines.join('\n') };
}

// ── Engine ──
export function createEngine() {
  let parser = math.parser();
  let userFunctions = new Map<string, StoredFunction>();

  // ── Numeric format control (MATLAB-style) ──
  // format short  → 4 digits (default MATLAB)
  // format long   → 15 digits
  // format shortE → 4 digits scientific
  // format longE  → 15 digits scientific
  // format(n)     → n decimal places fixed
  let numFormat: { type: 'short'|'long'|'shortE'|'longE'|'fixed'; digits: number } = { type: 'short', digits: 4 };

  function registerFunction(fn: StoredFunction, p: any) {
    const func = (...args: any[]) => {
      const subParser = math.parser();
      // Register builtins FIRST (_idx, _setidx, assemble, size, length, etc.)
      loadFemFunctions(subParser);
      // Copy current scope (variables + functions from parent)
      const currentScope = p.getAll();
      for (const [k, v] of Object.entries(currentScope)) {
        try { subParser.set(k, v); } catch {}
      }
      // Register other user functions in sub-parser
      for (const [name, f] of userFunctions) {
        if (name !== fn.name) {
          try { registerFunction(f, subParser); } catch {}
        }
      }
      // Bind params LAST (overrides any conflicts with builtins like 'e', 's', etc.)
      for (let i = 0; i < fn.params.length; i++) {
        subParser.set(fn.params[i], args[i]);
      }
      // Copy function-type values from parent parser scope
      try {
        const parentScope = p.getAll();
        for (const [k, v] of Object.entries(parentScope)) {
          if (typeof v === 'function') {
            try { subParser.set(k, v); } catch {}
          }
        }
      } catch {}

      // Parse body as blocks (supports for/while/if)
      const bodyLines = fn.body.split('\n').map((t: string, i: number) => ({ text: t, startLine: i }));

      // Join multi-line matrices
      const joined: { text: string; startLine: number }[] = [];
      let accum = '';
      let accumStart = 0;
      let bracketDepth = 0;
      for (let i = 0; i < bodyLines.length; i++) {
        const trimmed = bodyLines[i].text.trim();
        if (bracketDepth === 0 && (trimmed === '' || trimmed.startsWith('%'))) { joined.push(bodyLines[i]); continue; }
        if (bracketDepth === 0) { accum = trimmed; accumStart = i; } else { accum += ' ' + trimmed; }
        for (const ch of trimmed) { if (ch === '[') bracketDepth++; else if (ch === ']') bracketDepth--; }
        if (bracketDepth <= 0) { bracketDepth = 0; joined.push({ text: accum, startLine: accumStart }); accum = ''; }
      }
      if (accum) joined.push({ text: accum, startLine: bodyLines.length - 1 });

      // Split lines by semicolons (but not inside brackets)
      const expanded: { text: string; startLine: number }[] = [];
      for (const line of joined) {
        const t = line.text.trim();
        if (!t || t.startsWith('%') || t.startsWith('for ') || t.startsWith('while ') || t.startsWith('if ') || t === 'end' || t === 'else') {
          expanded.push(line);
          continue;
        }
        // Split by ; only outside brackets
        let depth = 0;
        let parts: string[] = [];
        let cur = '';
        for (const ch of t) {
          if (ch === '[' || ch === '(') depth++;
          else if (ch === ']' || ch === ')') depth--;
          if (ch === ';' && depth === 0) {
            if (cur.trim()) parts.push(cur.trim());
            cur = '';
          } else {
            cur += ch;
          }
        }
        if (cur.trim()) parts.push(cur.trim());
        for (const p of parts) {
          expanded.push({ text: p, startLine: line.startLine });
        }
      }

      // Track known vars for _idx
      const funcKnownVars = new Set<string>(fn.params);
      for (const [k, v] of Object.entries(currentScope)) {
        if (typeof v !== 'function') funcKnownVars.add(k);
      }

      // Balanced paren matching for indexed assignment inside functions
      function fnMatchIdxAssign(expr: string): { name: string; args: string; rhs: string } | null {
        const m = expr.match(/^([a-zA-Z_]\w*)\s*\(/);
        if (!m) return null;
        let depth = 0, i = m[0].length - 1;
        for (; i < expr.length; i++) {
          if (expr[i] === '(') depth++;
          else if (expr[i] === ')') { depth--; if (depth === 0) break; }
        }
        if (depth !== 0) return null;
        const args = expr.substring(m[0].length, i);
        const rest = expr.substring(i + 1).trim();
        if (!rest.startsWith('=') || rest.startsWith('==')) return null;
        const rhs = rest.substring(1).trim();
        if (!rhs) return null;
        return { name: m[1], args, rhs };
      }

      function fnReplaceIdx(expr: string, known: Set<string>): string {
        let result = '';
        let i = 0;
        while (i < expr.length) {
          const idMatch = expr.substring(i).match(/^([a-zA-Z_]\w*)\s*\(/);
          if (idMatch) {
            const name = idMatch[1];
            const ps = i + idMatch[0].length - 1;
            let depth = 0, j = ps;
            for (; j < expr.length; j++) {
              if (expr[j] === '(') depth++;
              else if (expr[j] === ')') { depth--; if (depth === 0) break; }
            }
            if (depth === 0 && known.has(name)) {
              const args = expr.substring(ps + 1, j);
              result += `_idx(${name}, ${fnReplaceIdx(args, known)})`;
              i = j + 1;
            } else if (depth === 0) {
              const args = expr.substring(ps + 1, j);
              result += name + '(' + fnReplaceIdx(args, known) + ')';
              i = j + 1;
            } else { result += expr[i]; i++; }
          } else { result += expr[i]; i++; }
        }
        return result;
      }

      // Execute body with for/while/if support
      const MAX_ITER_FN = 10000;
      function execFnBody(lines: { text: string; startLine: number }[]) {
        let i = 0;
        while (i < lines.length) {
          const t = lines[i].text.trim();
          if (!t || t.startsWith('%')) { i++; continue; }

          let kw = t;
          const pci = kw.indexOf('%');
          if (pci > 0) kw = kw.substring(0, pci).trim();
          if (kw === 'end' || kw === 'endfunction') { i++; continue; }

          // for var = range
          const forMatch = kw.match(/^for\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/);
          if (forMatch) {
            i++;
            const body: typeof lines = [];
            let depth = 1;
            while (i < lines.length) {
              const kt = lines[i].text.trim().replace(/%.*$/, '').trim();
              if (/^(for|while|if)\s+/.test(kt)) depth++;
              if (kt === 'end') { depth--; if (depth === 0) { i++; break; } }
              body.push(lines[i]); i++;
            }
            // Evaluate range (use balanced paren replacement)
            let rangeExpr = fnReplaceIdx(forMatch[2], funcKnownVars);
            try {
              const rangeVal = subParser.evaluate(rangeExpr);
              let values: number[];
              if (typeof rangeVal === 'number') values = [rangeVal];
              else if (rangeVal && typeof rangeVal.toArray === 'function') values = rangeVal.toArray().flat();
              else if (Array.isArray(rangeVal)) values = rangeVal.flat();
              else values = [Number(rangeVal)];
              let iter = 0;
              for (const v of values) {
                if (++iter > MAX_ITER_FN) break;
                subParser.set(forMatch[1], v);
                funcKnownVars.add(forMatch[1]);
                execFnBody(body);
              }
            } catch (e: any) { console.warn('fn for error:', e.message); }
            continue;
          }

          // Regular line
          let expr = t.replace(/;$/, '');
          // Handle indexed assignment with balanced parens: M(nested_args) = val
          const fnIdxA = fnMatchIdxAssign(expr);
          if (fnIdxA && funcKnownVars.has(fnIdxA.name)) {
            const indices = fnIdxA.args.split(',').map((a: string) => a.trim());
            const rhs = fnReplaceIdx(fnIdxA.rhs, funcKnownVars);
            expr = `${fnIdxA.name} = _setidx(${fnIdxA.name}, ${indices.map(a => fnReplaceIdx(a, funcKnownVars)).join(', ')}, ${rhs})`;
            funcKnownVars.add(fnIdxA.name);
          } else {
            // Check for array concat: fixed = [fixed, a, b]
            const concatM = expr.match(/^([a-zA-Z_]\w*)\s*=\s*\[\s*\1\s*,\s*(.+)\]$/);
            if (concatM && funcKnownVars.has(concatM[1])) {
              expr = `${concatM[1]} = concat(${concatM[1]}, [${concatM[2]}])`;
            }
            // Regular _idx replacement with balanced parens
            const assignMatch2 = expr.match(/^([a-zA-Z_]\w*)\s*=/);
            if (assignMatch2) funcKnownVars.add(assignMatch2[1]);
            expr = fnReplaceIdx(expr, funcKnownVars);
          }
          try {
            const res = subParser.evaluate(expr);
            // Track result for return
            if (res !== undefined && !(res instanceof Function)) {
              // nothing - just let subParser track it
            }
          } catch (e: any) { console.warn(`fn eval error [${fn.name}]: ${e.message} in: ${expr}`); }
          i++;
        }
      }

      execFnBody(expanded);

      // Return output variables
      if (fn.outputs && fn.outputs.length > 0) {
        if (fn.outputs.length === 1) {
          try { return subParser.evaluate(fn.outputs[0]); } catch { return undefined; }
        }
        // Multiple outputs: return array
        return fn.outputs.map((o: string) => { try { return subParser.evaluate(o); } catch { return undefined; } });
      }
      // Fallback: infer return from last assignment in body
      const bodyLines2 = fn.body.split('\n');
      for (let bi = bodyLines2.length - 1; bi >= 0; bi--) {
        const bt = bodyLines2[bi].trim();
        if (!bt || bt.startsWith('%') || bt === 'end') continue;
        const am = bt.match(/^([a-zA-Z_]\w*)\s*=/);
        if (am) {
          try { return subParser.evaluate(am[1]); } catch { return undefined; }
        }
        break;
      }
      // Last resort: try to get 'ans' or scope
      try { return subParser.evaluate('ans'); } catch { return undefined; }
    };
    p.set(fn.name, func);
  }

  function loadNerdamer(p: any) {
    try {
      const nerd = nerdamer || (window as any).nerdamer;
      if (!nerd) { console.warn('nerdamer not loaded'); return; }
      const symFuncs: Record<string, (...args: any[]) => string> = {
        sdiff: (expr: string, v: string) => nerd.diff(nerd(expr), v).toString(),
        sdiff2: (expr: string, v: string) => nerd.diff(nerd.diff(nerd(expr), v), v).toString(),
        sint: (expr: string, v: string) => nerd.integrate(nerd(expr), v).toString(),
        sdefint: (expr: string, v: string, a: number, b: number) => {
          const F = nerd.integrate(nerd(expr), v);
          const Fb = nerd(F.toString()).evaluate({ [v]: b });
          const Fa = nerd(F.toString()).evaluate({ [v]: a });
          // nerdamer.subtract may not exist in all versions; use nerd('Fb - Fa')
          try {
            return nerd.subtract(Fb, Fa).text('decimals');
          } catch {
            return nerd(`(${Fb.text('decimals')})-(${Fa.text('decimals')})`).evaluate().text('decimals');
          }
        },
        ssolve: (expr: string, v: string) => nerd.solve(expr, v).toString(),
        sexpand: (expr: string) => nerd(expr).expand().toString(),
        sfactor: (expr: string) => nerd.factor(nerd(expr)).toString(),
        ssimplify: (expr: string) => nerd(expr).toString(),
      };
      for (const [name, fn] of Object.entries(symFuncs)) {
        p.set(name, fn);
      }
    } catch (e) { console.warn('nerdamer registration failed:', e); }
  }

  function toNumArray(v: any): number[] {
    if (Array.isArray(v)) return v.flat(Infinity).map(Number);
    if (v && typeof v.toArray === 'function') return v.toArray().flat(Infinity).map(Number);
    if (v && v._data) return v._data.flat(Infinity).map(Number);
    return [];
  }

  function loadPlotFunctions(p: any) {
    // plot(x, y) or plot(y) — line chart
    p.set('plot', (...args: any[]) => {
      if (args.length >= 2) {
        return new PlotCommand({ type: 'line', x: toNumArray(args[0]), y: toNumArray(args[1]),
          title: args[2] as string || undefined });
      }
      const y = toNumArray(args[0]);
      return new PlotCommand({ type: 'line', x: y.map((_, i) => i + 1), y, title: args[1] as string || undefined });
    });

    // scatter(x, y)
    p.set('scatter', (...args: any[]) => {
      if (args.length >= 2) {
        return new PlotCommand({ type: 'scatter', x: toNumArray(args[0]), y: toNumArray(args[1]),
          title: args[2] as string || undefined });
      }
      const y = toNumArray(args[0]);
      return new PlotCommand({ type: 'scatter', x: y.map((_, i) => i + 1), y, title: args[1] as string || undefined });
    });

    // bar(x, y) or bar(y)
    p.set('bar', (...args: any[]) => {
      if (args.length >= 2) {
        return new PlotCommand({ type: 'bar', x: toNumArray(args[0]), y: toNumArray(args[1]),
          title: args[2] as string || undefined });
      }
      const y = toNumArray(args[0]);
      return new PlotCommand({ type: 'bar', x: y.map((_, i) => i + 1), y, title: args[1] as string || undefined });
    });

    // stem(x, y)
    p.set('stem', (...args: any[]) => {
      if (args.length >= 2) {
        return new PlotCommand({ type: 'stem', x: toNumArray(args[0]), y: toNumArray(args[1]),
          title: args[2] as string || undefined });
      }
      const y = toNumArray(args[0]);
      return new PlotCommand({ type: 'stem', x: y.map((_, i) => i + 1), y, title: args[1] as string || undefined });
    });

    // hist(data, nBins)
    p.set('hist', (...args: any[]) => {
      const data = toNumArray(args[0]);
      const nBins = (typeof args[1] === 'number') ? args[1] : 10;
      const mn = Math.min(...data), mx = Math.max(...data);
      const binW = (mx - mn) / nBins || 1;
      const edges: number[] = [];
      const counts: number[] = [];
      for (let i = 0; i <= nBins; i++) edges.push(mn + i * binW);
      for (let i = 0; i < nBins; i++) counts.push(0);
      for (const v of data) {
        let bin = Math.floor((v - mn) / binW);
        if (bin >= nBins) bin = nBins - 1;
        if (bin < 0) bin = 0;
        counts[bin]++;
      }
      return new PlotCommand({ type: 'hist', x: edges, y: counts,
        title: args[2] as string || undefined });
    });

    // plot3(x, y, z) — 3D line
    p.set('plot3', (...args: any[]) => {
      return new PlotCommand({ type: 'line3d',
        x: toNumArray(args[0]), y: toNumArray(args[1]), z: toNumArray(args[2]),
        title: args[3] as string || undefined });
    });

    // surf(X, Y, Z) — surface plot (Z is matrix)
    p.set('surf', (...args: any[]) => {
      const xg = toNumArray(args[0]);
      const yg = toNumArray(args[1]);
      // Z is a matrix (2D array)
      let zArr: any = args[2];
      let zGrid: number[][] = [];
      if (zArr && typeof zArr.toArray === 'function') zArr = zArr.toArray();
      if (zArr && zArr._data) zArr = zArr._data;
      if (Array.isArray(zArr) && Array.isArray(zArr[0])) {
        zGrid = zArr.map((row: any[]) => row.map(Number));
      }
      return new PlotCommand({ type: 'surf', x: [], y: [],
        xGrid: xg, yGrid: yg, zGrid,
        title: args[3] as string || undefined });
    });

    // meshz(xg, yg, expr) — generate Z grid for surf: expr uses x,y
    p.set('meshz', (...args: any[]) => {
      const xg = toNumArray(args[0]);
      const yg = toNumArray(args[1]);
      const expr = String(args[2]);
      const Z: number[][] = [];
      for (let i = 0; i < xg.length; i++) {
        const row: number[] = [];
        for (let j = 0; j < yg.length; j++) {
          try {
            row.push(math.evaluate(expr, { x: xg[i], y: yg[j] }));
          } catch { row.push(0); }
        }
        Z.push(row);
      }
      return Z;
    });

    // fplot(fn, [a, b]) — plot a math expression string over a range
    p.set('fplot', (...args: any[]) => {
      const expr = String(args[0]);
      let a = -10, b = 10;
      if (args[1]) {
        const range = toNumArray(args[1]);
        if (range.length >= 2) { a = range[0]; b = range[1]; }
      }
      const n = 200;
      const xs: number[] = [], ys: number[] = [];
      for (let i = 0; i <= n; i++) {
        const xv = a + (b - a) * i / n;
        xs.push(xv);
        try {
          ys.push(math.evaluate(expr, { x: xv }));
        } catch { ys.push(NaN); }
      }
      return new PlotCommand({ type: 'line', x: xs, y: ys,
        title: args[2] as string || expr, xlabel: 'x' });
    });
  }

  function loadFemFunctions(p: any) {
    // Stiffness matrices
    p.set('k_truss2d', (E: number, A: number, L: number) => k_truss2d(E, A, L));
    p.set('k_frame2d', (E: number, A: number, I: number, L: number) => k_frame2d(E, A, I, L));
    p.set('k_frame3d', (E: number, G: number, A: number, Iy: number, Iz: number, J: number, L: number) =>
      k_frame3d(E, G, A, Iy, Iz, J, L));
    p.set('k_cst', (E: number, nu: number, t: number,
      x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
      k_cst(E, nu, t, x1, y1, x2, y2, x3, y3));
    p.set('k_q4', (E: number, nu: number, t: number, coords: any) => {
      let c = coords;
      if (c && typeof c.toArray === 'function') c = c.toArray();
      return k_q4(E, nu, t, c);
    });
    p.set('k_plate_q4', (E: number, nu: number, t: number, kappa: number, coords: any) => {
      let c = coords;
      if (c && typeof c.toArray === 'function') c = c.toArray();
      return k_plate_q4(E, nu, t, kappa, c);
    });
    p.set('k_plate_mitc4', (E: number, nu: number, t: number, kappa: number, coords: any) => {
      let c = coords;
      if (c && typeof c.toArray === 'function') c = c.toArray();
      return k_plate_mitc4(E, nu, t, kappa, c);
    });
    p.set('k_shell6', (E: number, nu: number, t: number, kappa: number, coords: any, alpha?: number) => {
      let c = coords;
      if (c && typeof c.toArray === 'function') c = c.toArray();
      return k_shell6(E, nu, t, kappa, c, alpha ?? 0.01);
    });

    // SpaceFrameElement — K global 12×12 with 3-node orientation (Logan)
    p.set('SpaceFrameElement', (E: number, G: number, Iz: number, Iy: number,
      J: number, A: number, coord: any) => {
      let c = coord;
      if (c && typeof c.toArray === 'function') c = c.toArray();
      return space_frame_ke(E, G, Iz, Iy, J, A, c);
    });

    // SpaceFrameConsMass — M global 12×12 consistent mass (Logan)
    p.set('SpaceFrameConsMass', (m_bar: number, I0: number, A: number, coord: any) => {
      let c = coord;
      if (c && typeof c.toArray === 'function') c = c.toArray();
      return space_frame_mass(m_bar, I0, A, c);
    });

    // Shell tri 18x18 — JS builtin wrapping awatif TS (fast, MATLAB version shown in panel)
    p.set('k_shell_tri', (E: number, nu: number, t: number,
      x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
      const shellNodes: Node[] = [[x1, y1, 0], [x2, y2, 0], [x3, y3, 0]];
      const G = E / (2 * (1 + nu));
      const ei: ElementInputs = {
        elasticities: new Map([[0, E]]),
        poissonsRatios: new Map([[0, nu]]),
        thicknesses: new Map([[0, t]]),
        shearModuli: new Map([[0, G]]),
      };
      return math.matrix(getLocalStiffnessMatrix(shellNodes, ei, 0));
    });

    // Transformation matrices
    p.set('T2d', (theta: number) => T2d(theta));
    p.set('T3d', (dx: number, dy: number, dz: number, vx: number, vy: number, vz: number) =>
      T3d(dx, dy, dz, vx || 0, vy || 0, vz || 1));

    // Assembly
    p.set('assemble', (Kg: any, Ke: any, dofs: any) => {
      let d = dofs;
      if (d && typeof d.toArray === 'function') d = d.toArray();
      if (Array.isArray(d) && Array.isArray(d[0])) d = d.flat();
      return assemble(Kg, Ke, d.map(Number));
    });

    // Solver utilities (builtin JS for reliability)
    p.set('freedofs', (nDof: any, fixed: any) => {
      const n = typeof nDof === 'number' ? nDof : Number(nDof);
      let f = fixed;
      if (f && typeof f.toArray === 'function') f = f.toArray();
      if (Array.isArray(f) && Array.isArray(f[0])) f = f.flat();
      const fixSet = new Set((f as number[]).map(x => Math.round(Number(x))));
      const free: number[] = [];
      for (let i = 1; i <= n; i++) { if (!fixSet.has(i)) free.push(i); }
      return math.matrix([free]);
    });

    p.set('submat', (K: any, dofs: any) => {
      const kg = K.toArray ? K.toArray() : K;
      let d = dofs;
      if (d && typeof d.toArray === 'function') d = d.toArray();
      if (Array.isArray(d) && Array.isArray(d[0])) d = d.flat();
      const dd = (d as number[]).map(x => Math.round(Number(x)) - 1);
      const n = dd.length;
      const sub: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row: number[] = [];
        for (let j = 0; j < n; j++) { row.push(kg[dd[i]][dd[j]]); }
        sub.push(row);
      }
      return math.matrix(sub);
    });

    p.set('subvec', (F: any, dofs: any) => {
      const fv = F.toArray ? F.toArray() : F;
      let d = dofs;
      if (d && typeof d.toArray === 'function') d = d.toArray();
      if (Array.isArray(d) && Array.isArray(d[0])) d = d.flat();
      const dd = (d as number[]).map(x => Math.round(Number(x)) - 1);
      const sub: number[][] = [];
      for (const idx of dd) {
        const val = Array.isArray(fv[idx]) ? fv[idx][0] : fv[idx];
        sub.push([Number(val) || 0]);
      }
      return math.matrix(sub);
    });

    p.set('fullvec', (Ur: any, free: any, nTotal: any) => {
      const ur = Ur.toArray ? Ur.toArray() : Ur;
      let f = free;
      if (f && typeof f.toArray === 'function') f = f.toArray();
      if (Array.isArray(f) && Array.isArray(f[0])) f = f.flat();
      const ff = (f as number[]).map(x => Math.round(Number(x)) - 1);
      const n = typeof nTotal === 'number' ? nTotal : Number(nTotal);
      const full: number[][] = [];
      for (let i = 0; i < n; i++) full.push([0]);
      for (let i = 0; i < ff.length; i++) {
        const val = Array.isArray(ur[i]) ? ur[i][0] : ur[i];
        full[ff[i]][0] = Number(val) || 0;
      }
      return math.matrix(full);
    });

    // Mesh generators (builtin JS — MATLAB version has for loops which registerFunction can't handle)
    p.set('meshRect_nodes', (Lx: any, Ly: any, nx: any, ny: any) => {
      const lx = Number(Lx), ly = Number(Ly), nxx = Number(nx), nyy = Number(ny);
      const dx = lx / nxx, dy = ly / nyy;
      const rows: number[][] = [];
      for (let j = 0; j <= nyy; j++) {
        for (let i = 0; i <= nxx; i++) {
          rows.push([i * dx, j * dy, 0]);
        }
      }
      return math.matrix(rows);
    });

    p.set('meshRect_cst', (nx: any, ny: any) => {
      const nxx = Number(nx), nyy = Number(ny);
      const rows: number[][] = [];
      for (let j = 0; j < nyy; j++) {
        for (let i = 0; i < nxx; i++) {
          const n1 = j * (nxx + 1) + i + 1;
          const n2 = n1 + 1;
          const n3 = n1 + (nxx + 1) + 1;
          const n4 = n1 + (nxx + 1);
          rows.push([n1, n2, n3]);
          rows.push([n1, n3, n4]);
        }
      }
      return math.matrix(rows);
    });

    p.set('fixed_left_edge', (nx: any, ny: any) => {
      const nxx = Number(nx), nyy = Number(ny);
      const dofs: number[] = [];
      for (let j = 0; j <= nyy; j++) {
        const n = j * (nxx + 1) + 1; // left edge node (1-based)
        dofs.push(2 * n - 1, 2 * n); // ux, uy
      }
      return math.matrix([dofs]);
    });

    p.set('solve_fem', (Kg: any, Fv: any, fixed: any) => {
      const nDof = (Kg.toArray ? Kg.toArray() : Kg).length;
      const free = p.get('freedofs')(nDof, fixed);
      const Kr = p.get('submat')(Kg, free);
      const Fr = p.get('subvec')(Fv, free);

      const krArr: number[][] = Kr.toArray ? Kr.toArray() : Kr;
      const n = krArr.length;

      // Regularize zero diagonals (prevents singular matrix for truss/bar without rotational stiffness)
      let kMax = 0;
      for (let i = 0; i < n; i++) kMax = Math.max(kMax, Math.abs(krArr[i][i]));
      const eps = kMax * 1e-10;
      for (let i = 0; i < n; i++) {
        if (Math.abs(krArr[i][i]) < eps) krArr[i][i] = eps;
      }

      const frFlat = (Fr.toArray ? Fr.toArray() : Fr).flat().map(Number);

      // Eigen WASM solver — always use when ready (faster than math.js lusolve)
      if (eigenSolver.ready) {
        const x = eigenSolver.denseSolveSync(krArr, frFlat);
        if (x) {
          const Ur = math.matrix(x.map((v: number) => [v]));
          return p.get('fullvec')(Ur, free, nDof);
        }
      }

      // Fallback: math.js lusolve
      const Ur = math.lusolve(krArr, frFlat);
      return p.get('fullvec')(Ur, free, nDof);
    });

    // System(K, M, F, fixedDofs) — extract free DOF submatrices (Logan convention)
    // fixedDofs: 1-based array of fixed DOFs
    // Returns [Kf, Mf, Rf] where Kf=subK, Mf=subM, Rf=subF
    p.set('System', (K: any, M: any, F: any, fixed: any) => {
      const kg = K.toArray ? K.toArray() : K;
      const mg = M.toArray ? M.toArray() : M;
      const fv = F.toArray ? F.toArray() : F;
      let fix = fixed;
      if (fix && typeof fix.toArray === 'function') fix = fix.toArray();
      if (Array.isArray(fix) && Array.isArray(fix[0])) fix = fix.flat();
      const fixSet = new Set((fix as number[]).map((x: number) => Math.round(Number(x)) - 1));
      const n = kg.length;
      const freeDofs: number[] = [];
      for (let ii = 0; ii < n; ii++) { if (!fixSet.has(ii)) freeDofs.push(ii); }
      const nf = freeDofs.length;
      const Kf: number[][] = [], Mf: number[][] = [], Rf: number[] = [];
      for (let ii = 0; ii < nf; ii++) {
        const kr: number[] = [], mr: number[] = [];
        for (let jj = 0; jj < nf; jj++) {
          kr.push(kg[freeDofs[ii]][freeDofs[jj]]);
          mr.push(mg[freeDofs[ii]][freeDofs[jj]]);
        }
        Kf.push(kr); Mf.push(mr);
        const val = Array.isArray(fv[freeDofs[ii]]) ? fv[freeDofs[ii]][0] : fv[freeDofs[ii]];
        Rf.push(Number(val) || 0);
      }
      return [math.matrix(Kf), math.matrix(Mf), math.matrix(Rf.map(v => [v]))];
    });

    // Visualization
    p.set('show3d', (...args: any[]) => {
      const nodes = toArray2DArg(args[0]);
      const elements = toArray2DArg(args[1]);
      return new ViewCommand({
        type: 'mesh', nodes, elements,
        title: args[2] as string || undefined,
        supports: args[3] ? toNumArray(args[3]).map(Math.round) : undefined,
        loads: args[4] ? toArray2DArg(args[4]) : undefined
      });
    });

    // show_deformed(nds, els, U, scale, dofPerNode, title, supports, loads)
    p.set('show_deformed', (...args: any[]) => {
      const nodes = toArray2DArg(args[0]);
      const elements = toArray2DArg(args[1]);
      const U = toNumArray(args[2]);
      const scale = typeof args[3] === 'number' ? args[3] : 1;
      const dofPerNode = typeof args[4] === 'number' ? args[4] : 3;
      const title = typeof args[5] === 'string' ? args[5] : 'Deformed shape';
      const supports = args[6] ? toNumArray(args[6]).map(Math.round) : undefined;
      const loads = args[7] ? toArray2DArg(args[7]) : undefined;
      return new ViewCommand({
        type: 'deformed', nodes, elements, U, scale, dofPerNode, title, supports, loads
      });
    });

    p.set('show_contour', (...args: any[]) => {
      const nodes = toArray2DArg(args[0]);
      const elements = toArray2DArg(args[1]);
      const values = toNumArray(args[2]);
      return new ViewCommand({
        type: 'contour', nodes, elements, values,
        title: args[3] as string || 'Contour'
      });
    });

    // show_deformed_contour(nodes, els, U, values, scale, dofPerNode, title, supports, loads)
    p.set('show_deformed_contour', (...args: any[]) => {
      const nodes = toArray2DArg(args[0]);
      const elements = toArray2DArg(args[1]);
      const U = toNumArray(args[2]);
      const values = toNumArray(args[3]);
      const scale = typeof args[4] === 'number' ? args[4] : 1;
      const dofPerNode = typeof args[5] === 'number' ? args[5] : 3;
      const title = typeof args[6] === 'string' ? args[6] : 'Deformed + Contour';
      const supports = args[7] ? toNumArray(args[7]).map(Math.round) : undefined;
      const loads = args[8] ? toArray2DArg(args[8]) : undefined;
      return new ViewCommand({
        type: 'deformed_contour', nodes, elements, U, values, scale, dofPerNode, title, supports, loads
      });
    });

    // show_diagram(nodes, elements, elemForces, type, title)
    // elemForces: matrix [nElem x 2] with [fi, fj] per element
    // type: "constant" (N, V) or "linear" (M)
    p.set('show_diagram', (...args: any[]) => {
      const nodes = toArray2DArg(args[0]);
      const elements = toArray2DArg(args[1]);
      const ef = toArray2DArg(args[2]); // [[fi,fj], ...]
      const dtype = (typeof args[3] === 'string') ? args[3] : 'linear';
      const title = (typeof args[4] === 'string') ? args[4] : (dtype === 'linear' ? 'Bending Moment' : 'Forces');
      return new ViewCommand({
        type: 'diagram', nodes, elements,
        title,
        diagram: {
          elemForces: ef,
          type: dtype === 'constant' ? 'constant' : 'linear',
          label: dtype === 'constant' ? 'N' : 'M'
        }
      });
    });

    // frame_forces(Ke_local, T, Ue_global) — compute internal forces for a frame element
    // Returns local force vector: [N1, V1, M1, N2, V2, M2] for 2D frame (6 DOF)
    p.set('frame_forces', (Ke: any, T: any, Ue: any) => {
      const ke = (typeof Ke.toArray === 'function') ? math.matrix(Ke) : Ke;
      const t = (typeof T.toArray === 'function') ? math.matrix(T) : T;
      const ue = (typeof Ue.toArray === 'function') ? math.matrix(Ue) : Ue;
      // f_local = Ke * T * ue
      const uLocal = math.multiply(t, ue);
      const fLocal = math.multiply(ke, uLocal);
      return fLocal;
    });

    // extract_NVM(fLocal, nElem) — extract N, V, M from force vectors for all elements
    // fLocal: matrix [nElem x 6] each row = [N1,V1,M1,N2,V2,M2]
    // Returns: {N: [nElem x 2], V: [nElem x 2], M: [nElem x 2]}
    p.set('extract_NVM', (fLocal: any) => {
      const fl = toArray2DArg(fLocal);
      const N: number[][] = [], V: number[][] = [], M: number[][] = [];
      for (const row of fl) {
        // Convention: [N1,V1,M1,N2,V2,M2]
        N.push([-row[0], row[3]]);     // axial (tension positive)
        V.push([row[1], -row[4]]);     // shear
        M.push([-row[2], row[5]]);     // moment
      }
      return { N: math.matrix(N), V: math.matrix(V), M: math.matrix(M) };
    });

    // fem_deform(nodes, elements, supports, loads, props)
    // Uses awatif deformHybrid: TS for K local/T/assembly, WASM for large solve
    // nodes: Nx3, elements: Mx2 or Mx3 (0-based indices)
    // supports: map of node→[bool x6], loads: map of node→[fx,fy,fz,mx,my,mz]
    // props: {E, nu, t, A, Iz, Iy, G, J}
    // Returns: {deformations, reactions} maps
    // fem_deform(nds, els, sups, loads, E, nu, t, A, Iz, Iy, G, J)
    // A,Iz,Iy,G,J optional — needed for frame/truss elements
    p.set('fem_deform', (...args: any[]) => {
      const nds = toArray2DArg(args[0]);
      const elsRaw = toArray2DArg(args[1]);
      // Fix single-element case: [1,2] → [[1],[2]] (column) should be [[1,2]] (single element row)
      const elsParsed = (elsRaw.length > 0 && elsRaw[0].length === 1 && elsRaw.length <= 3)
        ? [elsRaw.map(r => r[0])]  // reshape column vector to single row
        : elsRaw;
      // Filter out zero rows (from pre-allocated but unused elements: zeros(nMax, 2))
      const elsFiltered = elsParsed.filter(r => r.some(v => Math.round(v) !== 0));
      const els = elsFiltered.map(r => r.map(v => Math.round(v) - 1)); // 1-based → 0-based
      // Supports/loads: if single row came as column vector, re-wrap as row
      const supArr = toRowArray(toArray2DArg(args[2]), 7);
      const loadArr = toRowArray(toArray2DArg(args[3]), 7);
      const E = typeof args[4] === 'number' ? args[4] : 100;
      const nu = typeof args[5] === 'number' ? args[5] : 0.3;
      const t = typeof args[6] === 'number' ? args[6] : 1;
      const A = typeof args[7] === 'number' ? args[7] : 0;
      const Iz = typeof args[8] === 'number' ? args[8] : 0;
      const Iy = typeof args[9] === 'number' ? args[9] : 0;
      const G = typeof args[10] === 'number' ? args[10] : E / (2 * (1 + nu));
      const J = typeof args[11] === 'number' ? args[11] : 0;

      const nodes: Node[] = nds.map(n => [n[0], n[1], n[2] || 0]);
      const elements: Element[] = els;

      const supports: NodeInputs['supports'] = new Map();
      for (const s of supArr) {
        const ni = Math.round(s[0]) - 1;
        supports.set(ni, [!!s[1], !!s[2], !!s[3], !!s[4], !!s[5], !!s[6]]);
      }

      const loads: NodeInputs['loads'] = new Map();
      for (const l of loadArr) {
        const ni = Math.round(l[0]) - 1;
        loads.set(ni, [l[1]||0, l[2]||0, l[3]||0, l[4]||0, l[5]||0, l[6]||0]);
      }

      const nodeInputs: NodeInputs = { supports, loads };
      const elementInputs: ElementInputs = {
        elasticities: new Map(elements.map((_, i) => [i, E])),
        thicknesses: new Map(elements.map((_, i) => [i, t])),
        poissonsRatios: new Map(elements.map((_, i) => [i, nu])),
        shearModuli: new Map(elements.map((_, i) => [i, G])),
        ...(A > 0 ? { areas: new Map(elements.map((_, i) => [i, A])) } : {}),
        ...(Iz > 0 ? { momentsOfInertiaZ: new Map(elements.map((_, i) => [i, Iz])) } : {}),
        ...(Iy > 0 ? { momentsOfInertiaY: new Map(elements.map((_, i) => [i, Iy])) } : {}),
        ...(J > 0 ? { torsionalConstants: new Map(elements.map((_, i) => [i, J])) } : {}),
      };

      const result = deformHybrid(nodes, elements, nodeInputs, elementInputs);
      if (!result) { console.warn('[fem_deform] deformHybrid returned null/undefined'); return math.matrix([[0]]); }
      if (!result.deformations) { console.warn('[fem_deform] no deformations in result', Object.keys(result)); return math.matrix([[0]]); }

      const nDof = nodes.length * 6;
      const Uf = new Array(nDof).fill(0);
      result.deformations.forEach((def, ni) => {
        for (let d = 0; d < 6; d++) Uf[ni * 6 + d] = def[d];
      });

      // ─── fem_check: validate results and emit warnings ───
      const hasNaN = Uf.some(v => isNaN(v));
      const hasInf = Uf.some(v => !isFinite(v));
      const maxU = Math.max(...Uf.map(Math.abs));
      const hasLoads = loadArr.length > 0 && loadArr.some(l => l.slice(1).some(v => Math.abs(v) > 1e-12));
      const hasSups = supArr.length > 0;

      if (hasNaN || hasInf) {
        (p as any)._femWarnings = (p as any)._femWarnings || [];
        (p as any)._femWarnings.push('⛔ ERROR: Sistema singular (NaN/Inf) — revisar apoyos y conectividad');
      } else if (!hasSups) {
        (p as any)._femWarnings = (p as any)._femWarnings || [];
        (p as any)._femWarnings.push('⚠️ WARNING: Sin apoyos definidos');
      } else if (!hasLoads) {
        (p as any)._femWarnings = (p as any)._femWarnings || [];
        (p as any)._femWarnings.push('⚠️ WARNING: Sin cargas aplicadas — desplazamientos serán cero');
      } else if (maxU > 1e6) {
        (p as any)._femWarnings = (p as any)._femWarnings || [];
        (p as any)._femWarnings.push('⚠️ WARNING: Desplazamientos excesivos (>' + maxU.toExponential(2) + ') — revisar unidades o rigidez');
      } else if (maxU < 1e-20 && hasLoads) {
        (p as any)._femWarnings = (p as any)._femWarnings || [];
        (p as any)._femWarnings.push('⚠️ WARNING: Sin deformación detectada — estructura puede estar sobre-restringida');
      }

      return math.matrix(Uf.map(v => [v])); // column vector
    });

    // fem_check — validate FEM results, returns warning string or "OK"
    p.set('fem_check', (...args: any[]) => {
      const Uf = toNumArray(args[0]);
      const hasNaN = Uf.some(v => isNaN(v));
      const hasInf = Uf.some(v => !isFinite(v));
      const maxU = Math.max(...Uf.map(Math.abs));
      if (hasNaN || hasInf) return '⛔ ERROR: Sistema singular (NaN/Inf) — revisar apoyos y conectividad';
      if (maxU > 1e6) return '⚠️ WARNING: Desplazamientos excesivos (' + maxU.toExponential(2) + ') — revisar unidades';
      if (maxU < 1e-20) return '⚠️ WARNING: Sin deformación — estructura sobre-restringida o sin cargas';
      return '✅ OK — max desplazamiento: ' + maxU.toExponential(3);
    });

    // fem_analyze — post-process after deform
    p.set('fem_analyze', (...args: any[]) => {
      // TODO: connect analyze.ts
      return math.matrix([[0]]);
    });

    // freedofs(ndof, fixed_array) — returns complement DOF indices (1-based)
    p.set('freedofs', (ndof: number, fixed: any) => {
      let f: number[];
      if (fixed && typeof fixed.toArray === 'function') f = fixed.toArray().flat().map(Number);
      else if (Array.isArray(fixed)) f = fixed.flat().map(Number);
      else f = [Number(fixed)];
      const result: number[] = [];
      for (let i = 1; i <= ndof; i++) {
        if (!f.includes(i)) result.push(i);
      }
      return result;
    });

    // geneig(K, G, nModes) — generalized eigenvalue: K*phi = lambda*G*phi
    // Returns sorted critical loads (ascending) using Cholesky transformation
    p.set('geneig', (...args: any[]) => {
      const K = args[0], G = args[1];
      const nModes = (typeof args[2] === 'number') ? args[2] : 5;
      let km: number[][] = K.toArray ? K.toArray() : K;
      let gm: number[][] = G.toArray ? G.toArray() : G;
      const sz = km.length;

      // Cholesky: K = L * L'
      const L: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let i = 0; i < sz; i++) {
        for (let j = 0; j <= i; j++) {
          let s = 0;
          for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
          L[i][j] = (i === j) ? Math.sqrt(Math.max(km[i][i] - s, 1e-30)) : (km[i][j] - s) / L[j][j];
        }
      }
      // Linv (lower triangular inverse)
      const Li: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let i = 0; i < sz; i++) {
        Li[i][i] = 1 / L[i][i];
        for (let j = i + 1; j < sz; j++) {
          let s = 0;
          for (let k = i; k < j; k++) s += L[j][k] * Li[k][i];
          Li[j][i] = -s / L[j][j];
        }
      }
      // B = Linv * G * Linv' (symmetric)
      const tmp: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let i = 0; i < sz; i++)
        for (let j = 0; j < sz; j++) {
          let s = 0;
          for (let k = 0; k < sz; k++) s += gm[i][k] * Li[j][k];
          tmp[i][j] = s;
        }
      const B: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let i = 0; i < sz; i++)
        for (let j = 0; j < sz; j++) {
          let s = 0;
          for (let k = 0; k < sz; k++) s += Li[i][k] * tmp[k][j];
          B[i][j] = s;
        }
      // Force symmetry
      for (let i = 0; i < sz; i++)
        for (let j = i + 1; j < sz; j++) {
          const avg = (B[i][j] + B[j][i]) / 2;
          B[i][j] = avg; B[j][i] = avg;
        }

      // eigs(B) → eigenvalues = 1/Ncr
      const result = math.eigs(math.matrix(B));
      let ev: number[];
      const vals = result.values;
      if (vals && typeof vals.toArray === 'function') ev = vals.toArray().flat().map(Number);
      else if (Array.isArray(vals)) ev = vals.map(Number);
      else ev = [Number(vals)];

      const ncrs = ev.filter(v => v > 1e-12).map(v => 1/v)
        .filter(v => isFinite(v) && !isNaN(v) && v > 0).sort((a, b) => a - b);
      return math.matrix(ncrs.slice(0, Math.min(nModes, ncrs.length)));
    });

    // buckling_plot(Kr, Gr, free, nn, L, mode_num) — plot buckling mode shape
    // Uses inverse iteration (shift-invert) to get eigenvector reliably
    p.set('buckling_plot', (...args: any[]) => {
      const Km = args[0], Gm = args[1];
      let freeArr: number[];
      const fa = args[2];
      if (fa && typeof fa.toArray === 'function') freeArr = fa.toArray().flat().map(Number);
      else if (Array.isArray(fa)) freeArr = fa.flat().map(Number);
      else throw new Error('free must be an array');
      const nn = Math.round(Number(args[3]));
      const Lc = Number(args[4]);
      const modeNum = (typeof args[5] === 'number') ? Math.round(args[5]) : 1;

      // Get Ncr values first (reuse geneig logic via parser)
      let km: number[][] = Km.toArray ? Km.toArray() : Km;
      let gm: number[][] = Gm.toArray ? Gm.toArray() : Gm;
      const sz = km.length;

      // Quick eigenvalue solve via Cholesky (same as geneig)
      const Lch: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let i = 0; i < sz; i++)
        for (let j = 0; j <= i; j++) {
          let s = 0;
          for (let k = 0; k < j; k++) s += Lch[i][k] * Lch[j][k];
          Lch[i][j] = (i === j) ? Math.sqrt(Math.max(km[i][i] - s, 1e-30)) : (km[i][j] - s) / Lch[j][j];
        }
      const Linv: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let i = 0; i < sz; i++) {
        Linv[i][i] = 1 / Lch[i][i];
        for (let j = i + 1; j < sz; j++) {
          let s = 0;
          for (let k = i; k < j; k++) s += Lch[j][k] * Linv[k][i];
          Linv[j][i] = -s / Lch[j][j];
        }
      }
      const tmp2: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let i = 0; i < sz; i++)
        for (let j = 0; j < sz; j++) {
          let s = 0; for (let k = 0; k < sz; k++) s += gm[i][k] * Linv[j][k];
          tmp2[i][j] = s;
        }
      const B2: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let i = 0; i < sz; i++)
        for (let j = 0; j < sz; j++) {
          let s = 0; for (let k = 0; k < sz; k++) s += Linv[i][k] * tmp2[k][j];
          B2[i][j] = s;
        }
      for (let i = 0; i < sz; i++)
        for (let j = i + 1; j < sz; j++) { const a = (B2[i][j]+B2[j][i])/2; B2[i][j]=a; B2[j][i]=a; }

      const res = math.eigs(math.matrix(B2));
      let ev: number[];
      const vls = res.values;
      if (vls && typeof vls.toArray === 'function') ev = vls.toArray().flat().map(Number);
      else ev = Array.from(vls).map(Number);
      const ncrs = ev.filter(v => v > 1e-12).map(v => 1/v)
        .filter(v => isFinite(v) && !isNaN(v) && v > 0).sort((a, b) => a - b);

      if (modeNum < 1 || modeNum > ncrs.length) throw new Error(`Mode ${modeNum} not available`);
      const Ncr_target = ncrs[modeNum - 1];

      // Inverse iteration (shift-invert) for eigenvector
      const sigma = Ncr_target * 0.99999;
      const KsG = math.subtract(math.matrix(km), math.multiply(sigma, math.matrix(gm)));
      const KsG_inv = math.inv(KsG);
      const Gmat = math.matrix(gm);

      // Start with random initial vector
      let phi_vec = math.matrix(Array.from({length: sz}, () => [Math.random() - 0.5]));
      for (let iter = 0; iter < 30; iter++) {
        phi_vec = math.multiply(KsG_inv, math.multiply(Gmat, phi_vec));
        const n2 = Math.sqrt(Number(math.dot(math.flatten(phi_vec), math.flatten(phi_vec))));
        if (n2 > 1e-30) phi_vec = math.divide(phi_vec, n2);
      }

      // Extract to flat array
      const phi_r: number[] = math.flatten(phi_vec).toArray().map(Number);

      // Map to full DOFs
      const ndof = 2 * nn;
      const phi_full: number[] = Array(ndof).fill(0);
      for (let i = 0; i < freeArr.length && i < phi_r.length; i++) {
        phi_full[freeArr[i] - 1] = phi_r[i];
      }

      // Extract lateral displacements (DOF 1,3,5,...,2nn-1 → index 0,2,4,...)
      const xp: number[] = [];
      const dp: number[] = [];
      for (let i = 0; i < nn; i++) {
        xp.push(i * Lc / (nn - 1));
        dp.push(phi_full[2 * i]);
      }
      const maxD = Math.max(...dp.map(Math.abs));
      const norm = maxD > 1e-15 ? dp.map(v => v / maxD) : dp;

      return new PlotCommand({ type: 'line', x: xp, y: norm,
        title: `Buckling Mode ${modeNum} (Ncr = ${Ncr_target.toFixed(2)} kN)` });
    });

    // ═══════════════════════════════════════════════════════
    // space_frame_ke(E, G, Iz, Iy, J, A, coord3x3)
    // Generates 12x12 global stiffness for space frame element
    // coord: 3x3 matrix [[x1,y1,z1],[x2,y2,z2],[x3,y3,z3]]
    //   node1=start, node2=end, node3=orientation (defines local y)
    // ═══════════════════════════════════════════════════════
    p.set('space_frame_ke', (...args: any[]) => {
      const E = Number(args[0]), G = Number(args[1]);
      const Iz = Number(args[2]), Iy = Number(args[3]);
      const J = Number(args[4]), A = Number(args[5]);
      const coord = toArray2DArg(args[6]); // 3x3
      const n1 = coord[0], n2 = coord[1], n3 = coord[2];
      const dx = n2[0]-n1[0], dy = n2[1]-n1[1], dz = n2[2]-n1[2];
      const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const EIz = E*Iz, EIy = E*Iy, GJ = G*J, EA = E*A;

      // Local axes from 3 nodes
      const ex = [dx/L, dy/L, dz/L];
      const v13 = [n3[0]-n1[0], n3[1]-n1[1], n3[2]-n1[2]];
      const v12 = [n2[0]-n1[0], n2[1]-n1[1], n2[2]-n1[2]];
      // ey = normalize(cross(v13, v12))
      const cr = [
        v13[1]*v12[2] - v13[2]*v12[1],
        v13[2]*v12[0] - v13[0]*v12[2],
        v13[0]*v12[1] - v13[1]*v12[0]
      ];
      const crn = Math.sqrt(cr[0]*cr[0] + cr[1]*cr[1] + cr[2]*cr[2]);
      const ey = [cr[0]/crn, cr[1]/crn, cr[2]/crn];
      // ez = cross(ex, ey)
      const ez = [
        ex[1]*ey[2] - ex[2]*ey[1],
        ex[2]*ey[0] - ex[0]*ey[2],
        ex[0]*ey[1] - ex[1]*ey[0]
      ];

      // Transformation matrix T (12x12 block diagonal of H=[ex;ey;ez])
      const T: number[][] = Array.from({length: 12}, () => Array(12).fill(0));
      for (let b = 0; b < 4; b++) {
        const o = b * 3;
        T[o][o] = ex[0]; T[o][o+1] = ex[1]; T[o][o+2] = ex[2];
        T[o+1][o] = ey[0]; T[o+1][o+1] = ey[1]; T[o+1][o+2] = ey[2];
        T[o+2][o] = ez[0]; T[o+2][o+1] = ez[1]; T[o+2][o+2] = ez[2];
      }

      // Local stiffness ke (12x12 Euler-Bernoulli)
      const L2 = L*L, L3 = L2*L;
      const ke: number[][] = [
        [EA/L, 0, 0, 0, 0, 0, -EA/L, 0, 0, 0, 0, 0],
        [0, 12*EIz/L3, 0, 0, 0, 6*EIz/L2, 0, -12*EIz/L3, 0, 0, 0, 6*EIz/L2],
        [0, 0, 12*EIy/L3, 0, -6*EIy/L2, 0, 0, 0, -12*EIy/L3, 0, -6*EIy/L2, 0],
        [0, 0, 0, GJ/L, 0, 0, 0, 0, 0, -GJ/L, 0, 0],
        [0, 0, -6*EIy/L2, 0, 4*EIy/L, 0, 0, 0, 6*EIy/L2, 0, 2*EIy/L, 0],
        [0, 6*EIz/L2, 0, 0, 0, 4*EIz/L, 0, -6*EIz/L2, 0, 0, 0, 2*EIz/L],
        [-EA/L, 0, 0, 0, 0, 0, EA/L, 0, 0, 0, 0, 0],
        [0, -12*EIz/L3, 0, 0, 0, -6*EIz/L2, 0, 12*EIz/L3, 0, 0, 0, -6*EIz/L2],
        [0, 0, -12*EIy/L3, 0, 6*EIy/L2, 0, 0, 0, 12*EIy/L3, 0, 6*EIy/L2, 0],
        [0, 0, 0, -GJ/L, 0, 0, 0, 0, 0, GJ/L, 0, 0],
        [0, 0, -6*EIy/L2, 0, 2*EIy/L, 0, 0, 0, 6*EIy/L2, 0, 4*EIy/L, 0],
        [0, 6*EIz/L2, 0, 0, 0, 2*EIz/L, 0, -6*EIz/L2, 0, 0, 0, 4*EIz/L]
      ];

      // Ke_global = T' * ke * T
      const Tm = math.matrix(T);
      const Kem = math.matrix(ke);
      return math.multiply(math.transpose(Tm), math.multiply(Kem, Tm));
    });

    // ═══════════════════════════════════════════════════════
    // space_frame_mass(mbar, Ip, A, coord3x3)
    // Consistent mass matrix 12x12 with ROTATIONAL INERTIA
    // mbar = distributed mass (mass/length)
    // Ip = polar moment of inertia of cross section = Iy + Iz
    // A = cross-sectional area
    // coord: 3x3 matrix (same as space_frame_ke)
    // ═══════════════════════════════════════════════════════
    p.set('space_frame_mass', (...args: any[]) => {
      const mbar = Number(args[0]);
      const Ip = Number(args[1]);
      const A_sec = Number(args[2]);
      const coord = toArray2DArg(args[3]); // 3x3
      const n1 = coord[0], n2 = coord[1], n3 = coord[2];
      const dx = n2[0]-n1[0], dy = n2[1]-n1[1], dz = n2[2]-n1[2];
      const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const r = Ip / A_sec; // Ip/A ratio for torsional mass terms

      // Local axes (same as space_frame_ke)
      const ex = [dx/L, dy/L, dz/L];
      const v13 = [n3[0]-n1[0], n3[1]-n1[1], n3[2]-n1[2]];
      const v12 = [n2[0]-n1[0], n2[1]-n1[1], n2[2]-n1[2]];
      const cr = [
        v13[1]*v12[2] - v13[2]*v12[1],
        v13[2]*v12[0] - v13[0]*v12[2],
        v13[0]*v12[1] - v13[1]*v12[0]
      ];
      const crn = Math.sqrt(cr[0]*cr[0] + cr[1]*cr[1] + cr[2]*cr[2]);
      const ey = [cr[0]/crn, cr[1]/crn, cr[2]/crn];
      const ez = [
        ex[1]*ey[2] - ex[2]*ey[1],
        ex[2]*ey[0] - ex[0]*ey[2],
        ex[0]*ey[1] - ex[1]*ey[0]
      ];

      const T: number[][] = Array.from({length: 12}, () => Array(12).fill(0));
      for (let b = 0; b < 4; b++) {
        const o = b * 3;
        T[o][o] = ex[0]; T[o][o+1] = ex[1]; T[o][o+2] = ex[2];
        T[o+1][o] = ey[0]; T[o+1][o+1] = ey[1]; T[o+1][o+2] = ey[2];
        T[o+2][o] = ez[0]; T[o+2][o+1] = ez[1]; T[o+2][o+2] = ez[2];
      }

      // Consistent mass matrix (local) with rotational inertia Ip/A
      const L2 = L * L;
      const c = mbar * L / 420;
      const ml: number[][] = [
        [140, 0, 0, 0, 0, 0, 70, 0, 0, 0, 0, 0],
        [0, 156, 0, 0, 0, 22*L, 0, 54, 0, 0, 0, -13*L],
        [0, 0, 156, 0, -22*L, 0, 0, 0, 54, 0, 13*L, 0],
        [0, 0, 0, 140*r, 0, 0, 0, 0, 0, 70*r, 0, 0],
        [0, 0, -22*L, 0, 4*L2, 0, 0, 0, -13*L, 0, -3*L2, 0],
        [0, 22*L, 0, 0, 0, 4*L2, 0, 13*L, 0, 0, 0, -3*L2],
        [70, 0, 0, 0, 0, 0, 140, 0, 0, 0, 0, 0],
        [0, 54, 0, 0, 0, 13*L, 0, 156, 0, 0, 0, -22*L],
        [0, 0, 54, 0, -13*L, 0, 0, 0, 156, 0, 22*L, 0],
        [0, 0, 0, 70*r, 0, 0, 0, 0, 0, 140*r, 0, 0],
        [0, 0, 13*L, 0, -3*L2, 0, 0, 0, 22*L, 0, 4*L2, 0],
        [0, -13*L, 0, 0, 0, -3*L2, 0, -22*L, 0, 0, 0, 4*L2]
      ];
      // Scale
      for (let ii = 0; ii < 12; ii++)
        for (let jj = 0; jj < 12; jj++)
          ml[ii][jj] *= c;

      // Me_global = T' * ml * T
      const Tm = math.matrix(T);
      const Ml = math.matrix(ml);
      return math.multiply(math.transpose(Tm), math.multiply(Ml, Tm));
    });

    // ═══════════════════════════════════════════════════════
    // modal_solve(Kf, Mf, nModes)
    // Solves generalized eigenvalue problem: K*phi = omega^2 * M * phi
    // Returns: { freqs: [Hz], periods: [s], omegas: [rad/s], modes: matrix }
    // Uses Cholesky decomposition: L*L'=K, B=Linv*M*Linv', eig(B)
    // ═══════════════════════════════════════════════════════
    p.set('modal_solve', (...args: any[]) => {
      const Kf = args[0], Mf = args[1];
      const nModes = (typeof args[2] === 'number') ? args[2] : 6;
      const km: number[][] = Kf.toArray ? Kf.toArray() : Kf;
      const mm: number[][] = Mf.toArray ? Mf.toArray() : Mf;
      const sz = km.length;

      // Cholesky: K = Lc * Lc'
      const Lc: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let ii = 0; ii < sz; ii++) {
        for (let jj = 0; jj <= ii; jj++) {
          let sum = 0;
          for (let kk = 0; kk < jj; kk++) sum += Lc[ii][kk] * Lc[jj][kk];
          Lc[ii][jj] = (ii === jj)
            ? Math.sqrt(Math.max(km[ii][ii] - sum, 1e-30))
            : (km[ii][jj] - sum) / Lc[jj][jj];
        }
      }
      // Linv (lower triangular inverse)
      const Li: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let ii = 0; ii < sz; ii++) {
        Li[ii][ii] = 1 / Lc[ii][ii];
        for (let jj = ii + 1; jj < sz; jj++) {
          let sum = 0;
          for (let kk = ii; kk < jj; kk++) sum += Lc[jj][kk] * Li[kk][ii];
          Li[jj][ii] = -sum / Lc[jj][jj];
        }
      }
      // B = Linv * M * Linv'
      const tmp: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let ii = 0; ii < sz; ii++)
        for (let jj = 0; jj < sz; jj++) {
          let sum = 0;
          for (let kk = 0; kk < sz; kk++) sum += mm[ii][kk] * Li[jj][kk];
          tmp[ii][jj] = sum;
        }
      const B: number[][] = Array.from({length: sz}, () => Array(sz).fill(0));
      for (let ii = 0; ii < sz; ii++)
        for (let jj = 0; jj < sz; jj++) {
          let sum = 0;
          for (let kk = 0; kk < sz; kk++) sum += Li[ii][kk] * tmp[kk][jj];
          B[ii][jj] = sum;
        }
      // Symmetrize
      for (let ii = 0; ii < sz; ii++)
        for (let jj = ii + 1; jj < sz; jj++) {
          const avg = (B[ii][jj] + B[jj][ii]) / 2;
          B[ii][jj] = avg; B[jj][ii] = avg;
        }

      // eig(B) → eigenvalues = 1/omega^2, eigenvectors
      const eigResult = math.eigs(math.matrix(B));
      let ev: {val: number, vec: number[]}[] = [];
      // math.js eigs returns {values: Matrix, eigenvectors: [{value, vector}, ...]}
      const eigenvecs: any[] = (eigResult as any).eigenvectors || [];
      for (const eg of eigenvecs) {
        const lambda = typeof eg.value === 'number' ? eg.value : 0;
        if (lambda > 1e-12) {
          const omega = Math.sqrt(1 / lambda);
          const vec = eg.vector?.toArray?.() || eg.vector || [];
          ev.push({ val: omega, vec: vec.flat().map(Number) });
        }
      }
      ev.sort((a, b) => a.val - b.val);
      const nOut = Math.min(nModes, ev.length);

      const omegas = ev.slice(0, nOut).map(v => v.val);
      const freqs = omegas.map(w => w / (2 * Math.PI));
      const periods = freqs.map(f => f > 0 ? 1 / f : Infinity);
      const modes = ev.slice(0, nOut).map(v => v.vec);

      // Return as object with named fields
      return {
        omegas: math.matrix([omegas]),
        freqs: math.matrix([freqs]),
        periods: math.matrix([periods]),
        modes: math.matrix(modes) // nModes x nDof
      };
    });
  }

  // Fix column vectors that should be rows: [[1],[20],[0],...] → [[1,20,0,...]] when cols match expected
  function toRowArray(arr: number[][], expectedCols: number): number[][] {
    if (arr.length >= expectedCols && arr.every(r => r.length === 1)) {
      // Column vector → single row
      return [arr.map(r => r[0])];
    }
    return arr;
  }

  function toArray2DArg(v: any): number[][] {
    if (!v) return [];
    // Handle ResultSet (from multi-line function returns)
    if (v.entries) v = Array.isArray(v.entries) ? v.entries[v.entries.length - 1] : v;
    if (v && typeof v.valueOf === 'function' && v.constructor?.name === 'ResultSet') {
      const entries = v.valueOf();
      v = Array.isArray(entries) ? entries[entries.length - 1] : v;
    }
    if (v && typeof v.toArray === 'function') v = v.toArray();
    if (v && v._data) v = v._data;
    if (Array.isArray(v)) {
      if (v.length > 0 && Array.isArray(v[0])) {
        // Handle nested arrays [[1],[2]] vs [[1,2],[3,4]]
        if (v[0].length === 1 && Array.isArray(v[0][0])) {
          // Extra nesting: [[[1,2,3]],[[4,5,6]]] → [[1,2,3],[4,5,6]]
          return v.map((r: any) => (Array.isArray(r[0]) ? r[0] : r).map(Number));
        }
        return v.map((r: any) => (Array.isArray(r) ? r : [r]).map(Number));
      }
      return v.map((x: any) => [Number(x)]);
    }
    return [];
  }

  async function evaluate(code: string): Promise<EvalResult[]> {
    // 0. Pre-process async getMesh() calls
    // Find: [nds, els, bnd] = getMesh(points, polygon, maxArea)
    // Execute async, inject results as matrix literals
    let processedCode = code;
    const meshMatch = code.match(/\[(\w+)\s*,\s*(\w+)(?:\s*,\s*(\w+))?\]\s*=\s*getMesh\(([^)]+)\)/);
    if (meshMatch) {
      try {
        // Find variable definitions referenced in getMesh args
        const tmpParser = math.parser();
        tmpParser.set('size', (...a: any[]) => {
          const s = math.size(a[0]);
          const sa = s.toArray ? s.toArray() : (Array.isArray(s) ? s : [s]);
          if (a.length === 1) return math.matrix(sa);
          return sa[Math.round(Number(a[1])) - 1] || 0;
        });
        // Execute ALL non-function, non-getMesh lines to build scope
        const codeLines = code.split('\n');
        // console.log('[getMesh] pre-processing', codeLines.length, 'lines');
        let insideFunction = false;
        for (const line of codeLines) {
          const t = line.trim();
          if (t.includes('getMesh') && !t.startsWith('%')) break;
          if (/^function\s/.test(t)) { insideFunction = true; continue; }
          if (t === 'end' && insideFunction) { insideFunction = false; continue; }
          if (insideFunction) continue;
          if (!t || t.startsWith('%')) continue;
          // Split by semicolons outside brackets (but not inside [])
          let depth = 0; const parts: string[] = []; let cur = '';
          for (const ch of t) {
            if (ch === '[' || ch === '(') depth++;
            else if (ch === ']' || ch === ')') depth--;
            if (ch === ';' && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ''; }
            else cur += ch;
          }
          if (cur.trim()) parts.push(cur.trim());
          for (const part of parts) {
            try { tmpParser.evaluate(part); } catch {}
          }
        }
        // Get the argument values
        const argParts = meshMatch[4].split(',').map((s: string) => s.trim());
        let pts: number[][] = [];
        let poly: number[] = [];
        let maxArea = 3;
        let minAngle = 30;
        try {
          const ptsVal = tmpParser.evaluate(argParts[0]);
          pts = ptsVal.toArray ? ptsVal.toArray() : ptsVal;
          const polyVal = tmpParser.evaluate(argParts[1]);
          poly = (polyVal.toArray ? polyVal.toArray() : polyVal).flat().map(Number);
          if (argParts[2]) maxArea = Number(tmpParser.evaluate(argParts[2]));
          if (argParts[3]) minAngle = Number(tmpParser.evaluate(argParts[3]));
        } catch (e: any) {
          console.warn('getMesh arg error:', e.message, '| argParts:', argParts, '| scope keys:', Object.keys(tmpParser.getAll()).join(','));
        }
        if (pts.length >= 3) {
          const result = await triangleMeshAsync(pts, poly, maxArea, minAngle);
          const ndsName = meshMatch[1];
          const elsName = meshMatch[2];
          const bndName = meshMatch[3];
          const ndsStr = result.nodes.map((r: number[]) => r.join(',')).join('; ');
          const elsStr = result.elements.map((r: number[]) => r.map(x => x + 1).join(',')).join('; ');
          let replacement = `${ndsName} = [${ndsStr}]\n${elsName} = [${elsStr}]`;
          if (bndName) {
            const bndStr = result.boundaryIndices.map((x: number) => x + 1).join(',');
            replacement += `\n${bndName} = [${bndStr}]`;
          }
          processedCode = processedCode.replace(meshMatch[0], replacement);
          console.log(`[getMesh] Generated ${result.nodes.length} nodes, ${result.elements.length} triangles`);
        } else {
          console.warn('[getMesh] pts.length < 3, cannot generate mesh. pts:', pts);
        }
      } catch (e: any) {
        console.warn('getMesh pre-process error:', e.message);
      }
    }

    // 1. Parse function definitions
    const { functions: codeFunctions, cleanCode } = parseMatlabFunctions(processedCode);

    // 2. Reset parser
    parser = math.parser();
    loadNerdamer(parser);
    loadPlotFunctions(parser);
    loadFemFunctions(parser);
    // disp() — always shows output even inside loops (MATLAB behavior)
    parser.set('disp', (...args: any[]) => new DispCommand(args.length === 1 ? args[0] : args));

    // rand(n,m) — MATLAB random matrix
    parser.set('rand', (...args: any[]) => {
      const n = typeof args[0] === 'number' ? args[0] : 1;
      const m = typeof args[1] === 'number' ? args[1] : n;
      const rows: number[][] = [];
      for (let ii = 0; ii < n; ii++) {
        const row: number[] = [];
        for (let jj = 0; jj < m; jj++) row.push(Math.random());
        rows.push(row);
      }
      return math.matrix(rows);
    });

    // tic/toc — MATLAB-style timing
    let ticTime = 0;
    parser.set('tic', () => { ticTime = performance.now(); return new DispCommand('tic...'); });
    parser.set('toc', () => {
      const elapsed = performance.now() - ticTime;
      if (elapsed < 1000) return new DispCommand(`Elapsed time: ${elapsed.toFixed(2)} ms`);
      return new DispCommand(`Elapsed time: ${(elapsed/1000).toFixed(3)} s`);
    });

    // Override lusolve to use Eigen WASM when available
    parser.set('lusolve', (A: any, b: any) => {
      let aArr = A.toArray ? A.toArray() : A;
      let bArr = b.toArray ? b.toArray() : b;
      const bFlat = bArr.flat().map(Number);
      if (eigenSolver.ready) {
        try {
          const x = eigenSolver.denseSolveSync(aArr, bFlat);
          return math.matrix(x.map((v: number) => [v]));
        } catch {}
      }
      return math.lusolve(A, b);
    });

    // Override inv to use Eigen WASM when available
    parser.set('inv', (A: any) => {
      if (eigenSolver.ready) {
        let aArr = A.toArray ? A.toArray() : A;
        if (Array.isArray(aArr) && Array.isArray(aArr[0]) && aArr.length >= 4) {
          const result = eigenSolver.inverseSync(aArr);
          if (result) return math.matrix(result);
        }
      }
      return math.inv(A);
    });

    // Override size() to support size(M, dim) — MATLAB style
    parser.set('size', (...args: any[]) => {
      const M = args[0];
      const s = math.size(M);
      const sArr = s.toArray ? s.toArray() : (Array.isArray(s) ? s : [s]);
      if (args.length === 1) return math.matrix(sArr);
      const dim = Math.round(Number(args[1]));
      return dim >= 1 && dim <= sArr.length ? sArr[dim - 1] : 0;
    });

    // Override length() to return max dimension — MATLAB style
    const origLength = math.typed('length', { 'any': (x: any) => {
      try {
        const s = math.size(x);
        const sArr = s.toArray ? s.toArray() : (Array.isArray(s) ? s : [s]);
        return Math.max(...sArr.map(Number));
      } catch { return 1; }
    }});
    parser.set('length', origLength);

    // Override norm() to handle column vectors (Nx1 matrices)
    const origNorm = math.norm;
    parser.set('norm', (v: any) => {
      try { return origNorm(v); } catch {
        try { return origNorm(math.flatten(v)); } catch {}
        const arr = toNumArray(v);
        return Math.sqrt(arr.reduce((s: number, x: number) => s + x * x, 0));
      }
    });

    // _setidx: MATLAB-style 1-based indexed assignment M(i,j) = val
    parser.set('_setidx', (...args: any[]) => {
      const M = args[0];
      const val = args[args.length - 1];
      if (args.length === 3) {
        // Single index: M(i) = val
        const i = Math.round(Number(args[1])) - 1;
        try { return math.subset(M, math.index(i), val); } catch {}
        try { return math.subset(M, math.index(i, 0), val); } catch {}
        throw new Error(`Cannot set index ${i+1}`);
      }
      if (args.length === 4) {
        // Double index: M(i,j) = val
        const i = Math.round(Number(args[1])) - 1;
        const j = Math.round(Number(args[2])) - 1;
        return math.subset(M, math.index(i, j), val);
      }
      throw new Error('Invalid index assignment');
    });

    // _idx: MATLAB-style 1-based indexing that works for vectors and matrices
    parser.set('_idx', (...args: any[]) => {
      const M = args[0];
      if (args.length === 2) {
        // Single index: v(i) — works for 1D arrays and Nx1/1xN matrices
        const i = Math.round(Number(args[1])) - 1;
        try { return math.subset(M, math.index(i)); } catch {}
        try { return math.subset(M, math.index(i, 0)); } catch {}
        try { return math.subset(M, math.index(0, i)); } catch {}
        // Flat array fallback
        const arr = (typeof M.toArray === 'function') ? M.toArray() : M;
        if (Array.isArray(arr)) {
          const flat = arr.flat(Infinity);
          return flat[i];
        }
        throw new Error(`Cannot index into value`);
      }
      if (args.length === 3) {
        // Two indices: M(i,j)
        const i = Math.round(Number(args[1])) - 1;
        const j = Math.round(Number(args[2])) - 1;
        return math.subset(M, math.index(i, j));
      }
      throw new Error(`_idx requires 1 or 2 indices`);
    });

    // 3. Register all functions (from code + localStorage + FEM MATLAB library)
    userFunctions = new Map([...codeFunctions]);
    // Pre-load FEM MATLAB library (user can see them in 📚 panel)
    // Skip functions that are already registered as JS builtins (faster & more reliable)
    const jsBuiltins = new Set([
      'freedofs','submat','subvec','fullvec','solve_fem','assemble','assemble_k',
      'meshRect_nodes','meshRect_cst','fixed_left_edge',
      // JS builtins that also appear in femMatlabLibrary — JS version is faster & correct
      'k_truss2d','k_frame2d','k_frame3d','k_cst','k_q4','k_plate_q4','k_plate_mitc4','k_shell6','T2d','T3d','k_shell_tri',
      'frame_forces','SpaceFrameElement','SpaceFrameConsMass',
      'space_frame_ke','space_frame_mass','modal_solve',
    ]);
    for (const mf of femMatlabLibrary) {
      if (!userFunctions.has(mf.name) && !jsBuiltins.has(mf.name)) {
        userFunctions.set(mf.name, mf);
      }
    }
    const storedFns = loadFunctions();
    for (const sf of storedFns) {
      if (!userFunctions.has(sf.name)) userFunctions.set(sf.name, sf);
    }
    for (const [, fn] of userFunctions) {
      registerFunction(fn, parser);
    }

    // 4. Pre-process: join multi-line matrices (lines with unmatched [ ... ])
    const rawLines = cleanCode.replace(/\r/g, '').split('\n');
    const joined: { text: string; startLine: number }[] = [];
    let accum = '';
    let accumStart = 0;
    let bracketDepth = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const trimmed = rawLines[i].trim();

      // Pass through comments and blanks even inside accumulation
      if (bracketDepth === 0 && (trimmed === '' || trimmed.startsWith('%'))) {
        joined.push({ text: rawLines[i], startLine: i });
        continue;
      }

      if (bracketDepth === 0) {
        accum = trimmed;
        accumStart = i;
      } else {
        accum += ' ' + trimmed;
      }

      // Count brackets
      for (const ch of trimmed) {
        if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;
      }

      if (bracketDepth <= 0) {
        bracketDepth = 0;
        joined.push({ text: accum, startLine: accumStart });
        accum = '';
      }
    }
    if (accum) joined.push({ text: accum, startLine: rawLines.length - 1 });

    // 5. Parse control flow blocks (for/while/if-elseif-else-end)
    type Stmt = { kind: 'line'; text: string; startLine: number }
      | { kind: 'for'; varName: string; range: string; body: Stmt[]; startLine: number }
      | { kind: 'while'; cond: string; body: Stmt[]; startLine: number }
      | { kind: 'if'; branches: { cond: string; body: Stmt[] }[]; elseBody?: Stmt[]; startLine: number };

    function parseBlocks(lines: { text: string; startLine: number }[]): Stmt[] {
      const stmts: Stmt[] = [];
      let i = 0;
      while (i < lines.length) {
        const trimmed = lines[i].text.trim();
        const startLine = lines[i].startLine;

        // Strip inline comment for keyword detection
        let kw = trimmed;
        const pci = kw.indexOf('%');
        if (pci > 0) kw = kw.substring(0, pci).trim();

        // for var = range
        const forMatch = kw.match(/^for\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/);
        if (forMatch) {
          i++;
          const { body, endIdx } = collectBody(lines, i);
          stmts.push({ kind: 'for', varName: forMatch[1], range: forMatch[2], body: parseBlocks(body), startLine });
          i = endIdx + 1;
          continue;
        }

        // while condition
        const whileMatch = kw.match(/^while\s+(.+)$/);
        if (whileMatch) {
          i++;
          const { body, endIdx } = collectBody(lines, i);
          stmts.push({ kind: 'while', cond: whileMatch[1], body: parseBlocks(body), startLine });
          i = endIdx + 1;
          continue;
        }

        // if condition
        const ifMatch = kw.match(/^if\s+(.+)$/);
        if (ifMatch) {
          i++;
          const { branches, elseBody, endIdx } = collectIfBranches(lines, i, ifMatch[1]);
          stmts.push({ kind: 'if', branches, elseBody, startLine });
          i = endIdx + 1;
          continue;
        }

        stmts.push({ kind: 'line', text: lines[i].text, startLine });
        i++;
      }
      return stmts;
    }

    function collectBody(lines: { text: string; startLine: number }[], start: number): { body: typeof lines; endIdx: number } {
      const body: typeof lines = [];
      let depth = 1;
      let i = start;
      while (i < lines.length) {
        const kw = stripComment(lines[i].text.trim());
        if (/^(for|while|if)\s+/.test(kw)) depth++;
        if (kw === 'end') { depth--; if (depth === 0) return { body, endIdx: i }; }
        body.push(lines[i]);
        i++;
      }
      return { body, endIdx: i - 1 };
    }

    function collectIfBranches(lines: { text: string; startLine: number }[], start: number, firstCond: string) {
      const branches: { cond: string; body: { text: string; startLine: number }[] }[] = [{ cond: firstCond, body: [] }];
      let elseBody: { text: string; startLine: number }[] | undefined;
      let depth = 1;
      let i = start;
      let currentBody = branches[0].body;

      while (i < lines.length) {
        const kw = stripComment(lines[i].text.trim());
        if (/^(for|while|if)\s+/.test(kw)) depth++;
        if (kw === 'end') {
          depth--;
          if (depth === 0) return { branches, elseBody, endIdx: i };
        }
        if (depth === 1) {
          const elseifMatch = kw.match(/^elseif\s+(.+)$/);
          if (elseifMatch) {
            branches.push({ cond: elseifMatch[1], body: [] });
            currentBody = branches[branches.length - 1].body;
            i++;
            continue;
          }
          if (kw === 'else') {
            elseBody = [];
            currentBody = elseBody;
            i++;
            continue;
          }
        }
        currentBody.push(lines[i]);
        i++;
      }
      return { branches, elseBody, endIdx: i - 1 };
    }

    function stripComment(s: string): string {
      const idx = s.indexOf('%');
      return idx > 0 ? s.substring(0, idx).trim() : s;
    }

    const ast = parseBlocks(joined);

    // 6. Track known variables for indexing disambiguation
    const knownVars = new Set<string>();
    // Built-in math.js functions that should NOT be treated as indexing
    const builtinFuncs = new Set([
      'sin','cos','tan','asin','acos','atan','atan2','sqrt','abs','exp','log','log2','log10',
      'ceil','floor','round','sign','min','max','mean','sum','prod','std','variance',
      'inv','det','transpose','trace','eigs','norm','cross','dot','diag','size','length',
      'zeros','ones','identity','eye','range','linspace','reshape','flatten','squeeze',
      'subset','index','concat','sort','resize','kron',
      'freedofs','submat','subvec','fullvec','solve_fem','assemble','assemble_k',
      'sdiff','sdiff2','sint','sdefint','ssolve','sexpand','sfactor','ssimplify',
      'plot','scatter','bar','stem','hist','plot3','surf','fplot','meshz',
      'k_truss2d','k_frame2d','k_frame3d','k_cst','k_q4','k_plate_q4','k_plate_mitc4','k_shell6','T2d','T3d','assemble',
      'T2d_truss','truss2d_Ke','truss3d_Ke',
      'meshRect_nodes','meshRect_cst','gen_truss_nodes','gen_truss_elements',
      'gen_tower_nodes','gen_tower_elements','fixed_left_edge','getMesh','fem_deform','fem_analyze',
      'assemble_k','solve_fem','reactions',
      'buildIsoDb','buildIsoDs','buildIsoQm','shell_bending_B','shell_shear_B','shell_membrane_K9','k_shell_tri',
      'show3d','show_deformed','show_contour','show_deformed_contour','show_diagram','submat','subvec','fullvec','_idx','_setidx','freedofs','geneig','buckling_plot',
      'frame_forces','extract_NVM',
      'random','factorial','permutations','combinations','gcd','lcm',
      'mod','pow','nthRoot','cbrt','square','cube',
      'complex','re','im','conj','arg',
      'format','print','typeof','typeOf','number','string','boolean','bignumber','fraction',
      'matrix','sparse','unit','createUnit',
      'parse','evaluate','compile','simplify','rationalize','derivative',
      'add','subtract','multiply','divide','dotMultiply','dotDivide','dotPow',
      'equal','unequal','smaller','larger','smallerEq','largerEq',
      'and','or','not','xor',
      'map','filter','forEach','partitionSelect',
      'lup','lusolve','lsolve','usolve','qr','slu',
      'disp','fprintf','sprintf',
      'for','while','if','else','elseif','end','break','continue','return',
    ]);

    // 7. Execute AST
    const results: EvalResult[] = [];
    const MAX_ITER = 10000; // safety limit
    let insideLoop = 0; // depth counter: >0 means inside for/while → suppress output (MATLAB behavior)

    // Match indexed assignment with balanced parentheses: name(args_with_nested_parens) = rhs
    function matchIdxAssign(expr: string): { name: string; args: string; rhs: string } | null {
      const m = expr.match(/^([a-zA-Z_]\w*)\s*\(/);
      if (!m) return null;
      let depth = 0, i = m[0].length - 1;
      for (; i < expr.length; i++) {
        if (expr[i] === '(') depth++;
        else if (expr[i] === ')') { depth--; if (depth === 0) break; }
      }
      if (depth !== 0) return null;
      const args = expr.substring(m[0].length, i);
      const rest = expr.substring(i + 1).trim();
      if (!rest.startsWith('=') || rest.startsWith('==')) return null;
      const rhs = rest.substring(1).trim();
      if (!rhs) return null;
      return { name: m[1], args, rhs };
    }

    // Replace var(args) → _idx(var, args) with balanced paren matching
    function replaceIdx(expr: string): string {
      let result = '';
      let i = 0;
      while (i < expr.length) {
        // Try to match identifier followed by (
        const idMatch = expr.substring(i).match(/^([a-zA-Z_]\w*)\s*\(/);
        if (idMatch) {
          const name = idMatch[1];
          const parenStart = i + idMatch[0].length - 1;
          // Find matching closing paren
          let depth = 0, j = parenStart;
          for (; j < expr.length; j++) {
            if (expr[j] === '(') depth++;
            else if (expr[j] === ')') { depth--; if (depth === 0) break; }
          }
          if (depth === 0 && knownVars.has(name) && !builtinFuncs.has(name) && !userFunctions.has(name)) {
            const args = expr.substring(parenStart + 1, j);
            // Recursively replace _idx inside args
            const fixedArgs = replaceIdx(args);
            result += `_idx(${name}, ${fixedArgs})`;
            i = j + 1;
          } else {
            // Not a known var or is a builtin — keep as-is but recurse into args
            if (depth === 0) {
              const args = expr.substring(parenStart + 1, j);
              const fixedArgs = replaceIdx(args);
              result += name + '(' + fixedArgs + ')';
              i = j + 1;
            } else {
              result += expr[i]; i++;
            }
          }
        } else {
          result += expr[i]; i++;
        }
      }
      return result;
    }

    // Transform MATLAB array concat: [varName, a, b] → concat(varName, [a, b]) when varName is a known matrix
    function transformArrayConcat(expr: string): string {
      // Match: varName = [varName, ...rest]
      const m = expr.match(/^([a-zA-Z_]\w*)\s*=\s*\[\s*\1\s*,\s*(.+)\]$/);
      if (m && knownVars.has(m[1])) {
        return `${m[1]} = concat(${m[1]}, [${m[2]}])`;
      }
      return expr;
    }

    function prepExpr(raw: string): { expr: string; suppress: boolean } {
      let expr = raw.trim();
      // Strip inline comments
      const pctIdx = expr.indexOf('%');
      if (pctIdx === 0) return { expr: '', suppress: false }; // whole line is comment
      if (pctIdx > 0) {
        const before = expr.substring(0, pctIdx);
        const dqCount = (before.match(/"/g) || []).length;
        const sqCount = (before.match(/'/g) || []).length;
        if (dqCount % 2 === 0 && sqCount % 2 === 0) expr = expr.substring(0, pctIdx).trim();
      }
      const suppress = expr.endsWith(';');
      if (suppress) expr = expr.slice(0, -1).trim();

      // MATLAB compat
      expr = expr.replace(/'([^']*?)'/g, '"$1"');
      expr = expr.replace(/(\w+)'/g, 'transpose($1)');
      expr = expr.replace(/(\w+)\s*\\\s*(\w+)/g, 'inv($1) * $2');

      // Indexed assignment with balanced parens: M(i,j) = expr → M = _setidx(M, i, j, expr)
      const idxA = matchIdxAssign(expr);
      if (idxA && knownVars.has(idxA.name)) {
        const indices = idxA.args.split(',').map((s: string) => s.trim());
        const rhs = replaceIdx(idxA.rhs);
        expr = `${idxA.name} = _setidx(${idxA.name}, ${indices.map(a => replaceIdx(a)).join(', ')}, ${rhs})`;
        return { expr, suppress };
      }

      // Transform array concat: fixed = [fixed, a, b] → fixed = concat(fixed, [a, b])
      expr = transformArrayConcat(expr);

      // Normal _idx replacement for reads (with balanced parens)
      expr = replaceIdx(expr);
      return { expr, suppress };
    }

    function evalOneLine(rawText: string, startLine: number, suppress: boolean, expr: string) {
      // Inside for/while loops: suppress ALL output (MATLAB behavior)
      // Only disp() or plot commands produce output inside loops
      const loopSuppress = insideLoop > 0;

      try {
        const result = parser.evaluate(expr);
        // disp() always produces output, even inside loops
        if (result instanceof DispCommand) {
          results.push({ line: startLine + 1, input: rawText, type: 'disp', value: result.value, formatted: formatValue(result.value) });
          return;
        }
        if (result instanceof PlotCommand) {
          results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result.data });
          return;
        }
        if (result instanceof ViewCommand) {
          results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result });
          return;
        }
        const assignMatch = expr.match(/^([a-zA-Z_]\w*)\s*=/);
        if (assignMatch) {
          knownVars.add(assignMatch[1]);
          if (result instanceof PlotCommand) {
            results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result.data });
          } else if (result instanceof ViewCommand) {
            results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result });
          } else if (!loopSuppress) {
            results.push({
              line: startLine + 1, input: rawText, type: 'assign',
              varName: assignMatch[1], value: result,
              formatted: suppress ? undefined : formatValue(result),
            });
          }
        } else if (!loopSuppress) {
          results.push({
            line: startLine + 1, input: rawText, type: 'expr',
            value: result, formatted: suppress ? undefined : formatValue(result),
          });
        }
      } catch (e: any) {
        if (!loopSuppress) {
          results.push({ line: startLine + 1, input: rawText, type: 'error', error: e.message });
        }
      }
    }

    function execStmts(stmts: Stmt[]) {
      for (const stmt of stmts) {
        if (stmt.kind === 'line') {
          const trimmed = stmt.text.trim();
          if (trimmed === '') { if (!insideLoop) results.push({ line: stmt.startLine + 1, input: stmt.text, type: 'blank' }); continue; }
          if (trimmed.startsWith('%')) {
            if (!insideLoop) {
              if (trimmed.startsWith('% ═') || trimmed.startsWith('% ───') || trimmed.startsWith('% ---')) {
                results.push({ line: stmt.startLine + 1, input: stmt.text, type: 'separator' });
              } else {
                results.push({ line: stmt.startLine + 1, input: stmt.text, type: 'comment', formatted: trimmed.substring(1).trim() });
              }
            }
            continue;
          }
          const kw = stripComment(trimmed);
          if (kw === 'end' || kw === 'endfunction' || kw === 'clc' || kw === 'clear' || kw === 'clear all') continue;
          // tic/toc without parens — execute as commands
          if (kw === 'tic' || kw === 'toc') {
            const fn = parser.get(kw) as (...args: any[]) => any;
            if (typeof fn === 'function') {
              const result = fn();
              if (result instanceof DispCommand && !insideLoop) {
                results.push({ line: stmt.startLine + 1, input: stmt.text, type: 'disp', value: result.value, formatted: formatValue(result.value) });
              }
            }
            continue;
          }
          // MATLAB format command
          const fmtMatch = kw.match(/^format\s+(\w+)$/);
          if (fmtMatch) {
            const fmt = fmtMatch[1].toLowerCase();
            if (fmt === 'short') numFormat = { type: 'short', digits: 4 };
            else if (fmt === 'long') numFormat = { type: 'long', digits: 15 };
            else if (fmt === 'shorte') numFormat = { type: 'shortE', digits: 4 };
            else if (fmt === 'longe') numFormat = { type: 'longE', digits: 14 };
            if (!insideLoop) results.push({ line: stmt.startLine + 1, input: stmt.text, type: 'comment', formatted: `format ${fmt}` });
            continue;
          }
          // format(n) — fixed decimal places
          const fmtN = kw.match(/^format\((\d+)\)$/);
          if (fmtN) {
            numFormat = { type: 'fixed', digits: parseInt(fmtN[1]) };
            if (!insideLoop) results.push({ line: stmt.startLine + 1, input: stmt.text, type: 'comment', formatted: `format fixed ${fmtN[1]} decimals` });
            continue;
          }
          // Split by ; outside brackets/strings for multi-statement lines
          const subStmts: string[] = [];
          { let depth = 0, inStr = false, cur = '';
            for (const ch of trimmed) {
              if (ch === '"' || ch === "'") inStr = !inStr;
              if (!inStr) { if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; }
              if (ch === ';' && depth === 0 && !inStr) { if (cur.trim()) subStmts.push(cur.trim()); cur = ''; }
              else cur += ch;
            }
            if (cur.trim()) subStmts.push(cur.trim());
          }
          for (const sub of subStmts) {
            const { expr, suppress } = prepExpr(sub);
            if (!expr) continue;
            evalOneLine(sub, stmt.startLine, suppress, expr);
          }

        } else if (stmt.kind === 'for') {
          // for i = start:end or for i = start:step:end or for i = [array]
          // Only show the for header as a comment (no iteration output — MATLAB behavior)
          if (!insideLoop) {
            results.push({ line: stmt.startLine + 1, input: `for ${stmt.varName} = ${stmt.range}`, type: 'comment', formatted: `for ${stmt.varName}` });
          }
          try {
            const { expr: rangeExpr } = prepExpr(stmt.range);
            const rangeVal = parser.evaluate(rangeExpr);
            let values: number[];
            if (typeof rangeVal === 'number') {
              values = [rangeVal];
            } else if (rangeVal && typeof rangeVal.toArray === 'function') {
              values = rangeVal.toArray().flat();
            } else if (Array.isArray(rangeVal)) {
              values = rangeVal.flat();
            } else {
              values = [Number(rangeVal)];
            }
            let iter = 0;
            insideLoop++;
            // console.log('[DBG-FOR] loop var:', stmt.varName, 'values:', values.length);
            for (const v of values) {
              if (++iter > MAX_ITER) { results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: 'Max iterations exceeded' }); break; }
              parser.set(stmt.varName, v);
              knownVars.add(stmt.varName);
              execStmts(stmt.body);
            }
            insideLoop--;
          } catch (e: any) {
            insideLoop = Math.max(0, insideLoop - 1);
            results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: `for: ${e.message}` });
          }

        } else if (stmt.kind === 'while') {
          if (!insideLoop) {
            results.push({ line: stmt.startLine + 1, input: `while ${stmt.cond}`, type: 'comment', formatted: `while ...` });
          }
          let iter = 0;
          try {
            insideLoop++;
            while (true) {
              if (++iter > MAX_ITER) { results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: 'Max iterations exceeded' }); break; }
              const { expr: condExpr } = prepExpr(stmt.cond);
              const condVal = parser.evaluate(condExpr);
              if (!condVal) break;
              execStmts(stmt.body);
            }
            insideLoop--;
          } catch (e: any) {
            insideLoop = Math.max(0, insideLoop - 1);
            results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: `while: ${e.message}` });
          }

        } else if (stmt.kind === 'if') {
          let executed = false;
          for (const branch of stmt.branches) {
            try {
              const { expr: condExpr } = prepExpr(branch.cond);
              const condVal = parser.evaluate(condExpr);
              if (condVal) {
                execStmts(parseBlocks(branch.body));
                executed = true;
                break;
              }
            } catch (e: any) {
              results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: `if: ${e.message}` });
              executed = true;
              break;
            }
          }
          if (!executed && stmt.elseBody) {
            execStmts(parseBlocks(stmt.elseBody));
          }
        }
      }
    }

    execStmts(ast);
    return results;
  }

  function formatValue(val: any): string {
    if (val === undefined || val === null) return '';
    function formatNum(v: number): string {
      switch (numFormat.type) {
        case 'short': return v.toPrecision(numFormat.digits + 1).replace(/\.?0+$/, '');
        case 'long': return v.toPrecision(15).replace(/\.?0+$/, '');
        case 'shortE': return v.toExponential(numFormat.digits);
        case 'longE': return v.toExponential(14);
        case 'fixed': return v.toFixed(numFormat.digits);
      }
    }

    // Unwrap matrix scalar (1x1 or single element)
    if (val && typeof val.toArray === 'function') {
      const arr = val.toArray();
      const flat = Array.isArray(arr) ? arr.flat(Infinity) : [arr];
      if (flat.length === 1) val = Number(flat[0]);
    }
    if (typeof val === 'string') return val;
    if (typeof val === 'function') return '[function]';
    if (typeof val === 'number') {
      if (Number.isInteger(val) && Math.abs(val) < 1e15) return val.toString();
      if (Math.abs(val) < 1e-15) return '0';
      return formatNum(val);
    }
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    const prec = numFormat.type === 'long' || numFormat.type === 'longE' ? 15 : numFormat.digits + 2;
    try {
      const size = math.size(val);
      if (size && (size as any).length >= 2) return math.format(val, { precision: prec });
    } catch {}
    if (Array.isArray(val)) return '[' + val.map(v => formatValue(v)).join(', ') + ']';
    try { return math.format(val, { precision: prec }); } catch { return String(val); }
  }

  function reset() {
    parser = math.parser();
    userFunctions.clear();
  }

  function getScope(): Record<string, any> {
    try { return parser.getAll(); } catch { return {}; }
  }

  return { evaluate, reset, getScope, loadFunctions, addFunction: addFunction, removeFunction };
}
