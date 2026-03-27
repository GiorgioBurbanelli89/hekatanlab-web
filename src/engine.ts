import * as math from 'mathjs';
import { PlotCommand } from './plotter';
import { ViewCommand } from './viewer3d';
import { k_truss2d, k_frame2d, k_frame3d, T2d, T3d, assemble, k_cst, k_q4 } from './fem';
import { femMatlabLibrary } from './fem-matlab';
import { getMesh as triangleMeshAsync, isTriangleReady } from './wasm/triangleMesh';
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

  function registerFunction(fn: StoredFunction, p: any) {
    const func = (...args: any[]) => {
      const subParser = math.parser();
      // Copy current scope
      const currentScope = p.getAll();
      for (const [k, v] of Object.entries(currentScope)) {
        try { subParser.set(k, v); } catch {}
      }
      // Bind params
      for (let i = 0; i < fn.params.length; i++) {
        subParser.set(fn.params[i], args[i]);
      }
      // Register other user functions in sub-parser
      for (const [name, f] of userFunctions) {
        if (name !== fn.name) {
          try { registerFunction(f, subParser); } catch {}
        }
      }
      // Register builtins (_idx, _setidx, assemble, etc.)
      loadFemFunctions(subParser);
      subParser.set('_idx', p.get('_idx'));
      subParser.set('_setidx', p.get('_setidx'));
      try { subParser.set('disp', p.get('disp')); } catch {}

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

      // Track known vars for _idx
      const funcKnownVars = new Set<string>(fn.params);
      for (const [k] of Object.entries(currentScope)) funcKnownVars.add(k);

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
            // Evaluate range
            let rangeExpr = forMatch[2];
            rangeExpr = rangeExpr.replace(/([a-zA-Z_]\w*)\(([^)]+)\)/g, (match: string, name: string, a: string) => {
              if (funcKnownVars.has(name)) return `_idx(${name}, ${a})`;
              return match;
            });
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
          // Handle indexed assignment: M(i,j) = val → M = _setidx(M, i, j, val)
          const idxAssign = expr.match(/^([a-zA-Z_]\w*)\(([^)]+)\)\s*=\s*(.+)$/);
          if (idxAssign) {
            const [, vn, idxStr, rhs] = idxAssign;
            const indices = idxStr.split(',').map((a: string) => a.trim());
            // Replace _idx in rhs
            let rhsFixed = rhs.replace(/([a-zA-Z_]\w*)\(([^)]+)\)/g, (match: string, name: string, a: string) => {
              if (funcKnownVars.has(name)) return `_idx(${name}, ${a})`;
              return match;
            });
            expr = `${vn} = _setidx(${vn}, ${indices.join(', ')}, ${rhsFixed})`;
            funcKnownVars.add(vn);
          } else {
            // Regular _idx replacement
            const assignMatch2 = expr.match(/^([a-zA-Z_]\w*)\s*=/);
            if (assignMatch2) funcKnownVars.add(assignMatch2[1]);
            expr = expr.replace(/([a-zA-Z_]\w*)\(([^)]+)\)/g, (match: string, name: string, a: string) => {
              if (funcKnownVars.has(name)) return `_idx(${name}, ${a})`;
              return match;
            });
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

      execFnBody(joined);

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
      const Ur = math.lusolve(Kr, Fr);
      return p.get('fullvec')(Ur, free, nDof);
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

    p.set('show_deformed', (...args: any[]) => {
      const nodes = toArray2DArg(args[0]);
      const elements = toArray2DArg(args[1]);
      const U = toNumArray(args[2]);
      const scale = typeof args[3] === 'number' ? args[3] : 1;
      const dofPerNode = typeof args[4] === 'number' ? args[4] : 3;
      return new ViewCommand({
        type: 'deformed', nodes, elements, U, scale, dofPerNode,
        title: args[5] as string || 'Deformed shape'
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
  }

  function toArray2DArg(v: any): number[][] {
    if (v && typeof v.toArray === 'function') v = v.toArray();
    if (v && v._data) v = v._data;
    if (Array.isArray(v)) {
      if (v.length > 0 && Array.isArray(v[0])) return v.map((r: any) => r.map(Number));
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
        const args = meshMatch[4].split(';').map(s => s.trim());
        // Parse points from code: e.g. "points" variable or inline [[0,0],[1,0],...]
        // For now, evaluate the args using a temp parser
        const tmpParser = math.parser();
        // Execute all lines up to getMesh to get variable values
        const lines = code.split('\n');
        for (const line of lines) {
          const t = line.trim();
          if (t.includes('getMesh')) break;
          if (!t || t.startsWith('%') || t.startsWith('function')) continue;
          try { tmpParser.evaluate(t.replace(/'/g, '"')); } catch {}
        }
        // Get the argument values
        const argParts = meshMatch[4].split(',').map(s => s.trim());
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
          console.warn('getMesh arg parse error:', e.message);
        }
        if (pts.length >= 3) {
          const result = await triangleMeshAsync(pts, poly, maxArea, minAngle);
          // Inject results: replace getMesh call with matrix assignments
          const ndsName = meshMatch[1];
          const elsName = meshMatch[2];
          const bndName = meshMatch[3];
          const ndsStr = result.nodes.map(r => r.join(',')).join('; ');
          const elsStr = result.elements.map(r => r.map(x => x + 1).join(',')).join('; '); // 0→1 based
          let replacement = `${ndsName} = [${ndsStr}]\n${elsName} = [${elsStr}]`;
          if (bndName) {
            const bndStr = result.boundaryIndices.map(x => x + 1).join(','); // 0→1 based
            replacement += `\n${bndName} = [${bndStr}]`;
          }
          processedCode = processedCode.replace(meshMatch[0], replacement);
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
    const jsBuiltins = new Set(['freedofs','submat','subvec','fullvec','solve_fem','assemble','assemble_k','meshRect_nodes','meshRect_cst','fixed_left_edge']);
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
      'k_truss2d','k_frame2d','k_frame3d','k_cst','k_q4','T2d','T3d','assemble',
      'T2d_truss','truss2d_Ke','truss3d_Ke',
      'meshRect_nodes','meshRect_cst','gen_truss_nodes','gen_truss_elements',
      'gen_tower_nodes','gen_tower_elements','fixed_left_edge','getMesh',
      'assemble_k','solve_fem','reactions',
      'buildIsoDb','buildIsoDs','buildIsoQm','shell_bending_B','shell_shear_B','shell_membrane_K9','k_shell_tri',
      'show3d','show_deformed','show_contour','show_diagram','submat','subvec','fullvec','_idx','_setidx','freedofs','geneig','buckling_plot',
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

    function prepExpr(raw: string): { expr: string; suppress: boolean } {
      let expr = raw.trim();
      // Strip inline comments
      const pctIdx = expr.indexOf('%');
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

      // Indexed assignment: M(i,j) = expr → M = _setidx(M, i, j, expr)
      const idxAssign = expr.match(/^([a-zA-Z_]\w*)\s*\(([^)]+)\)\s*=\s*(.+)$/);
      if (idxAssign && knownVars.has(idxAssign[1])) {
        const vn = idxAssign[1];
        const indices = idxAssign[2].split(',').map((s: string) => s.trim());
        let rhs = idxAssign[3].trim();
        // Apply _idx to RHS (reads only)
        rhs = rhs.replace(/\b([a-zA-Z_]\w*)\s*\(([^)]+)\)/g, (match: string, name: string, args: string) => {
          if (builtinFuncs.has(name) || userFunctions.has(name) || !knownVars.has(name)) return match;
          return `_idx(${name}, ${args.split(',').map((a: string) => a.trim()).join(', ')})`;
        });
        expr = `${vn} = _setidx(${vn}, ${indices.join(', ')}, ${rhs})`;
        return { expr, suppress };
      }

      // Normal _idx replacement for reads
      expr = expr.replace(/\b([a-zA-Z_]\w*)\s*\(([^)]+)\)/g, (match, name, args) => {
        if (builtinFuncs.has(name) || userFunctions.has(name) || !knownVars.has(name)) return match;
        const indices = args.split(',').map((a: string) => a.trim());
        return `_idx(${name}, ${indices.join(', ')})`;
      });
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
          const { expr, suppress } = prepExpr(trimmed);
          if (!expr) continue;
          if (insideLoop) console.log('[DBG-FOR]', trimmed, '→', expr);
          evalOneLine(stmt.text, stmt.startLine, suppress, expr);

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
            console.log('[DBG-FOR] loop var:', stmt.varName, 'values:', values, 'body stmts:', stmt.body.length, stmt.body.map((s:any) => s.kind + ':' + (s.text||'').substring(0,30)));
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
    if (typeof val === 'string') return val;
    if (typeof val === 'function') return '[function]';
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return val.toString();
      if (Math.abs(val) < 1e-10) return '0';
      if (Math.abs(val) > 1e6 || Math.abs(val) < 1e-4) return val.toExponential(4);
      return val.toPrecision(6).replace(/\.?0+$/, '');
    }
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    try {
      const size = math.size(val);
      if (size && (size as any).length >= 2) return math.format(val, { precision: 6 });
    } catch {}
    if (Array.isArray(val)) return '[' + val.map(v => formatValue(v)).join(', ') + ']';
    try { return math.format(val, { precision: 6 }); } catch { return String(val); }
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
