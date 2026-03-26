import * as math from 'mathjs';

export interface EvalResult {
  line: number;
  input: string;
  type: 'comment' | 'blank' | 'assign' | 'expr' | 'error' | 'separator' | 'heading' | 'funcdef';
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
      const nerdamer = (window as any).nerdamer;
      if (!nerdamer) return;
      const symFuncs: Record<string, (...args: any[]) => string> = {
        sdiff: (expr: string, v: string) => nerdamer.diff(nerdamer(expr), v).toString(),
        sdiff2: (expr: string, v: string) => nerdamer.diff(nerdamer.diff(nerdamer(expr), v), v).toString(),
        sint: (expr: string, v: string) => nerdamer.integrate(nerdamer(expr), v).toString(),
        sdefint: (expr: string, v: string, a: number, b: number) => {
          const F = nerdamer.integrate(nerdamer(expr), v);
          const Fb = nerdamer(F.toString()).evaluate({ [v]: b });
          const Fa = nerdamer(F.toString()).evaluate({ [v]: a });
          return nerdamer.subtract(Fb, Fa).text('decimals');
        },
        ssolve: (expr: string, v: string) => nerdamer.solve(expr, v).toString(),
        sexpand: (expr: string) => nerdamer(expr).expand().toString(),
        sfactor: (expr: string) => nerdamer.factor(nerdamer(expr)).toString(),
        ssimplify: (expr: string) => nerdamer(expr).toString(),
      };
      for (const [name, fn] of Object.entries(symFuncs)) {
        p.set(name, fn);
      }
    } catch {}
  }

  function evaluate(code: string): EvalResult[] {
    // 1. Parse function definitions
    const { functions: codeFunctions, cleanCode } = parseMatlabFunctions(code);

    // 2. Reset parser
    parser = math.parser();
    loadNerdamer(parser);

    // 3. Register all functions (from code + localStorage)
    userFunctions = new Map([...codeFunctions]);
    const storedFns = loadFunctions();
    for (const sf of storedFns) {
      if (!userFunctions.has(sf.name)) userFunctions.set(sf.name, sf);
    }
    for (const [, fn] of userFunctions) {
      registerFunction(fn, parser);
    }

    // 4. Evaluate clean code line by line
    const lines = cleanCode.split('\n');
    const results: EvalResult[] = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (trimmed === '') {
        results.push({ line: i + 1, input: raw, type: 'blank' });
        continue;
      }

      if (trimmed.startsWith('%')) {
        if (trimmed.startsWith('% ═') || trimmed.startsWith('% ───') || trimmed.startsWith('% ---')) {
          results.push({ line: i + 1, input: raw, type: 'separator' });
        } else if (trimmed.includes('function') && trimmed.includes('defined')) {
          results.push({ line: i + 1, input: raw, type: 'funcdef', formatted: trimmed.substring(2) });
        } else {
          results.push({ line: i + 1, input: raw, type: 'comment', formatted: trimmed.substring(1).trim() });
        }
        continue;
      }

      let expr = trimmed;
      const suppress = expr.endsWith(';');
      if (suppress) expr = expr.slice(0, -1).trim();

      // Skip 'end' keyword (leftover from functions)
      if (expr === 'end' || expr === 'endfunction' || expr === 'clc' || expr === 'clear' || expr === 'clear all') {
        results.push({ line: i + 1, input: raw, type: 'comment', formatted: expr });
        continue;
      }

      // MATLAB → math.js compatibility
      // A' → transpose(A)
      expr = expr.replace(/(\w+)'/g, 'transpose($1)');
      // A \ b → inv(A) * b  (basic)
      expr = expr.replace(/(\w+)\s*\\\s*(\w+)/g, 'inv($1) * $2');

      try {
        const result = parser.evaluate(expr);
        const assignMatch = expr.match(/^([a-zA-Z_]\w*)\s*=/);
        if (assignMatch) {
          results.push({
            line: i + 1, input: raw, type: 'assign',
            varName: assignMatch[1], value: result,
            formatted: suppress ? undefined : formatValue(result),
          });
        } else {
          results.push({
            line: i + 1, input: raw, type: 'expr',
            value: result,
            formatted: suppress ? undefined : formatValue(result),
          });
        }
      } catch (e: any) {
        results.push({ line: i + 1, input: raw, type: 'error', error: e.message });
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
