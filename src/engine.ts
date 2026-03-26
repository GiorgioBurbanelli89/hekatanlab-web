import * as math from 'mathjs';
import { PlotCommand } from './plotter';
import { ViewCommand } from './viewer3d';
import { k_truss2d, k_frame2d, k_frame3d, T2d, T3d, assemble, k_cst, k_q4 } from './fem';
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
  type: 'comment' | 'blank' | 'assign' | 'expr' | 'error' | 'separator' | 'heading' | 'funcdef' | 'plot';
  varName?: string;
  value?: any;
  formatted?: string;
  error?: string;
}

// ── Function Library (localStorage) ──
export interface StoredFunction {
  name: string;
  params: string[];
  body: string;
  description?: string;
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
  let currentFunc: { name: string; params: string[]; outVar: string; bodyLines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Detect function definition
    const funcMatch = trimmed.match(/^function\s+(?:\[?(\w+)\]?\s*=\s*)?(\w+)\s*\(([^)]*)\)/);
    if (funcMatch && !inFunc) {
      inFunc = true;
      currentFunc = {
        outVar: funcMatch[1] || 'ans',
        name: funcMatch[2],
        params: funcMatch[3].split(',').map(p => p.trim()).filter(p => p),
        bodyLines: [],
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
          description: `Returns ${currentFunc.outVar}`,
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
    // Create a JS function that evaluates the body with params bound
    const func = (...args: any[]) => {
      // Create a sub-parser with params bound
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
      // Evaluate body lines
      let result: any = undefined;
      const bodyLines = fn.body.split('\n');
      for (const line of bodyLines) {
        const t = line.trim();
        if (!t || t.startsWith('%')) continue;
        try {
          result = subParser.evaluate(t);
        } catch {}
      }
      return result;
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

    // submat(K, dofs) — extract submatrix at given DOF indices (1-based)
    p.set('submat', (M: any, dofs: any) => {
      let d = dofs;
      if (d && typeof d.toArray === 'function') d = d.toArray();
      if (Array.isArray(d) && Array.isArray(d[0])) d = d.flat();
      d = d.map(Number);
      const m = (typeof M.toArray === 'function') ? M.toArray() : M;
      const n = d.length;
      const sub: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row: number[] = [];
        for (let j = 0; j < n; j++) {
          row.push(m[d[i]-1][d[j]-1]);
        }
        sub.push(row);
      }
      return math.matrix(sub);
    });

    // subvec(F, dofs) — extract subvector at given DOF indices (1-based)
    p.set('subvec', (V: any, dofs: any) => {
      let d = dofs;
      if (d && typeof d.toArray === 'function') d = d.toArray();
      if (Array.isArray(d) && Array.isArray(d[0])) d = d.flat();
      d = d.map(Number);
      const v = (typeof V.toArray === 'function') ? V.toArray().flat() : Array.isArray(V) ? V.flat() : V;
      return math.matrix(d.map((i: number) => [v[i-1]]));
    });

    // fullvec(Ur, free_dofs, n_total) — expand reduced solution to full vector
    p.set('fullvec', (Ur: any, freeDofs: any, nTotal: number) => {
      let d = freeDofs;
      if (d && typeof d.toArray === 'function') d = d.toArray();
      if (Array.isArray(d) && Array.isArray(d[0])) d = d.flat();
      d = d.map(Number);
      const ur = (typeof Ur.toArray === 'function') ? Ur.toArray().flat() : Array.isArray(Ur) ? Ur.flat() : [];
      const full = new Array(nTotal).fill(0);
      for (let i = 0; i < d.length; i++) full[d[i]-1] = ur[i];
      return math.matrix(full.map(v => [v]));
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

  function evaluate(code: string): EvalResult[] {
    // 1. Parse function definitions
    const { functions: codeFunctions, cleanCode } = parseMatlabFunctions(code);

    // 2. Reset parser
    parser = math.parser();
    loadNerdamer(parser);
    loadPlotFunctions(parser);
    loadFemFunctions(parser);

    // 3. Register all functions (from code + localStorage)
    userFunctions = new Map([...codeFunctions]);
    const storedFns = loadFunctions();
    for (const sf of storedFns) {
      if (!userFunctions.has(sf.name)) userFunctions.set(sf.name, sf);
    }
    for (const [, fn] of userFunctions) {
      registerFunction(fn, parser);
    }

    // 4. Pre-process: join multi-line matrices (lines with unmatched [ ... ])
    const rawLines = cleanCode.split('\n');
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

    // 5. Track known variables for indexing disambiguation
    const knownVars = new Set<string>();
    // Built-in math.js functions that should NOT be treated as indexing
    const builtinFuncs = new Set([
      'sin','cos','tan','asin','acos','atan','atan2','sqrt','abs','exp','log','log2','log10',
      'ceil','floor','round','sign','min','max','mean','sum','prod','std','variance',
      'inv','det','transpose','trace','eigs','norm','cross','dot','diag','size','length',
      'zeros','ones','identity','eye','range','linspace','reshape','flatten','squeeze',
      'subset','index','concat','sort','resize','kron',
      'sdiff','sdiff2','sint','sdefint','ssolve','sexpand','sfactor','ssimplify',
      'plot','scatter','bar','stem','hist','plot3','surf','fplot','meshz',
      'k_truss2d','k_frame2d','k_frame3d','k_cst','k_q4','T2d','T3d','assemble',
      'show3d','show_deformed','show_contour','submat','subvec','fullvec',
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
    ]);

    // 5. Evaluate joined lines
    const results: EvalResult[] = [];

    for (const { text: rawText, startLine } of joined) {
      const trimmed = rawText.trim();

      if (trimmed === '') {
        results.push({ line: startLine + 1, input: rawText, type: 'blank' });
        continue;
      }

      if (trimmed.startsWith('%')) {
        if (trimmed.startsWith('% ═') || trimmed.startsWith('% ───') || trimmed.startsWith('% ---')) {
          results.push({ line: startLine + 1, input: rawText, type: 'separator' });
        } else if (trimmed.includes('function') && trimmed.includes('defined')) {
          results.push({ line: startLine + 1, input: rawText, type: 'funcdef', formatted: trimmed.substring(2) });
        } else {
          results.push({ line: startLine + 1, input: rawText, type: 'comment', formatted: trimmed.substring(1).trim() });
        }
        continue;
      }

      let expr = trimmed;
      const suppress = expr.endsWith(';');
      if (suppress) expr = expr.slice(0, -1).trim();

      // Skip 'end' keyword (leftover from functions)
      if (expr === 'end' || expr === 'endfunction' || expr === 'clc' || expr === 'clear' || expr === 'clear all') {
        results.push({ line: startLine + 1, input: rawText, type: 'comment', formatted: expr });
        continue;
      }

      // MATLAB → math.js compatibility
      // Convert single-quoted strings to double-quoted for math.js: 'text' → "text"
      expr = expr.replace(/'([^']*?)'/g, '"$1"');
      // A' → transpose(A) — but NOT inside strings
      expr = expr.replace(/(\w+)'/g, 'transpose($1)');
      // A \ b → inv(A) * b  (basic)
      expr = expr.replace(/(\w+)\s*\\\s*(\w+)/g, 'inv($1) * $2');

      // MATLAB indexing: M(i,j) → subset(M, index(i-1,j-1)), v(i) → subset(v, index(i-1))
      // Only for known variables, not built-in functions
      expr = expr.replace(/\b([a-zA-Z_]\w*)\s*\(([^)]+)\)/g, (match, name, args) => {
        if (builtinFuncs.has(name)) return match;
        if (userFunctions.has(name)) return match;
        if (!knownVars.has(name)) return match;
        // It's a known variable — convert to subset indexing (1-based → 0-based)
        const indices = args.split(',').map((a: string) => `(${a.trim()})-1`);
        return `subset(${name}, index(${indices.join(', ')}))`;
      });

      try {
        const result = parser.evaluate(expr);

        // Check if result is a PlotCommand or ViewCommand
        if (result instanceof PlotCommand) {
          results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result.data });
          continue;
        }
        if (result instanceof ViewCommand) {
          results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result });
          continue;
        }

        const assignMatch = expr.match(/^([a-zA-Z_]\w*)\s*=/);
        if (assignMatch) {
          knownVars.add(assignMatch[1]);
          // Check if assigned value is a PlotCommand or ViewCommand
          if (result instanceof PlotCommand) {
            results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result.data });
          } else if (result instanceof ViewCommand) {
            results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result });
          } else {
            results.push({
              line: startLine + 1, input: rawText, type: 'assign',
              varName: assignMatch[1], value: result,
              formatted: suppress ? undefined : formatValue(result),
            });
          }
        } else {
          results.push({
            line: startLine + 1, input: rawText, type: 'expr',
            value: result,
            formatted: suppress ? undefined : formatValue(result),
          });
        }
      } catch (e: any) {
        results.push({ line: startLine + 1, input: rawText, type: 'error', error: e.message });
      }
    }

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

  return { evaluate, reset, loadFunctions, addFunction: addFunction, removeFunction };
}
