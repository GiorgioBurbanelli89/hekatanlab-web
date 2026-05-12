// Use create(all) instead of namespace import so we get a real math instance with .import().
// (Namespace-import only exposes named exports; no `.import()`, `.expression`, etc.)
import { create, all } from 'mathjs';
const math: any = create(all);
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

// Pre-load Eigen WASM (silenciado — no es necesario verlo en consola normal,
// se sigue pudiendo inspeccionar con `console.debug`)
eigenSolver.init().then(() => console.debug('[Eigen WASM] ready')).catch(() => {});
// @ts-ignore
import nerdamer from 'nerdamer';
// @ts-ignore
import 'nerdamer/Algebra.js';
// @ts-ignore
import 'nerdamer/Calculus.js';
// @ts-ignore
import 'nerdamer/Solve.js';

// ── Global math.js fast-path overrides (Eigen WASM) ──
// Operator '*' calls math.multiply — redirect dense matrix*matrix to WASM when both are large.
// Same idea for det. eig/svd are exposed as plain helpers (eig_wasm / svd_wasm).
const __WASM_DIM_THRESHOLD = 50;
{
  const M: any = math as any;
  const origMultiply: any = M.multiply;
  const origDet: any = M.det;
  const origEigs: any = M.eigs;
  const origSvd: any = M.svd;
  // Indirect access to math.import to avoid Vite/Rollup confusing it with dynamic ES import().
  const mathImport: ((funcs: any, opts?: any) => void) | undefined = M["import"];

  function dimsOf(X: any): [number, number] | null {
    try {
      const s = X?.size?.() ?? (Array.isArray(X) ? [X.length, Array.isArray(X[0]) ? X[0].length : 1] : null);
      if (!s) return null;
      const arr = (s as any).toArray ? (s as any).toArray() : s;
      if (!Array.isArray(arr) || arr.length !== 2) return null;
      return [Number(arr[0]), Number(arr[1])];
    } catch { return null; }
  }

  function asArr2D(X: any): number[][] | null {
    try {
      const a = X?.toArray ? X.toArray() : X;
      if (!Array.isArray(a) || !Array.isArray(a[0])) return null;
      return a as number[][];
    } catch { return null; }
  }

  if (typeof mathImport === "function") {
    let __mulCalls = 0;
    let __mulWasm = 0;
    (window as any).__hekatanMulStats = () => ({ calls: __mulCalls, wasm: __mulWasm });
    mathImport({
      multiply: function (...args: any[]): any {
        __mulCalls++;
        if (args.length === 2 && eigenSolver.ready) {
          const [A, B] = args;
          const dA = dimsOf(A); const dB = dimsOf(B);
          if (dA && dB && dA[1] === dB[0]
              && dA[0] >= __WASM_DIM_THRESHOLD
              && dA[1] >= __WASM_DIM_THRESHOLD
              && dB[1] >= __WASM_DIM_THRESHOLD) {
            const aArr = asArr2D(A); const bArr = asArr2D(B);
            if (aArr && bArr) {
              try {
                const C = eigenSolver.multiplySync(aArr, bArr);
                if (C) { __mulWasm++; return math.matrix(C); }
              } catch {
                // WASM trap — fall back to mathjs multiply
              }
            }
          }
        }
        return origMultiply.apply(this, args);
      },
      det: function (X: any): any {
        if (eigenSolver.ready) {
          const d = dimsOf(X);
          if (d && d[0] === d[1] && d[0] >= __WASM_DIM_THRESHOLD) {
            const aArr = asArr2D(X);
            if (aArr) {
              try {
                const v = eigenSolver.detSync(aArr);
                if (v !== null && v !== undefined) return v;
              } catch {}
            }
          }
        }
        return origDet ? origDet.apply(this, [X]) : null;
      },
    }, { override: true });

    // eig / svd as plain helpers (avoid touching mathjs typed-function for these)
    mathImport({
      eig_wasm: function (X: any): any {
        const aArr = asArr2D(X);
        if (eigenSolver.ready && aArr) {
          try {
            const r = eigenSolver.eigenDecomposeSync(aArr);
            if (r) return { values: math.matrix(r.real), vectors: r.vectors ? math.matrix(r.vectors) : undefined };
          } catch {}
        }
        return origEigs ? origEigs.call(math, X) : null;
      },
      svd_wasm: function (X: any): any {
        const aArr = asArr2D(X);
        if (eigenSolver.ready && aArr) {
          try {
            const r = eigenSolver.svdSync(aArr);
            if (r) return { U: math.matrix(r.U), S: math.matrix(r.S), V: math.matrix(r.V) };
          } catch {}
        }
        return origSvd ? origSvd.call(math, X) : null;
      },
    }, { override: true });
  }
}

export interface EvalResult {
  line: number;
  input: string;
  type: 'comment' | 'blank' | 'assign' | 'expr' | 'error' | 'separator' | 'heading' | 'funcdef' | 'plot' | 'disp' | 'printf';
  varName?: string;
  value?: any;
  formatted?: string;
  error?: string;
}

// Engine modes:
//   "hekatan-lab"  → comportamiento actual (autorun, asignaciones se muestran con LaTeX, etc.)
//   "matlab"       → estricto, igual a MATLAB local — solo `disp`, `fprintf`, `printf` producen output;
//                    asignaciones y expresiones se ocultan (como si todas tuvieran ';' al final).
export type EngineMode = 'hekatan-lab' | 'matlab';

// Marker class for printf/fprintf — always shows output (texto plano, sin LaTeX)
export class PrintCommand {
  constructor(public text: string) {}
}

// MATLAB-style sprintf: supports %d %i %f %g %e %s %o %x %X %c %%, plus \n \t \r
export function sprintfMATLAB(fmt: string, args: any[]): string {
  let i = 0;
  const flatten = (v: any): any[] => {
    if (v == null) return [v];
    if (Array.isArray(v)) return v.flat(Infinity);
    if (v && typeof v.toArray === 'function') return v.toArray().flat(Infinity);
    return [v];
  };
  // Spread vector/matrix args (MATLAB style: fprintf('%d\n', [1;2;3]) prints 3 lines)
  const flat: any[] = [];
  for (const a of args) flat.push(...flatten(a));
  // Loop: re-apply format until args run out (MATLAB cycles the format string)
  let out = '';
  const reSpec = /%([0-9.\-+# ]*)([diouxXeEfgGsc%])/g;
  // Caso especial: sin args. El formato se imprime tal cual (después de procesar
  // escapes \n \t etc). Ej: fprintf('hola\n') sin args -> "hola\n"
  if (flat.length === 0) {
    return fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
  }
  while (i < flat.length) {
    let consumedThisPass = false;
    let lastIdx = 0;
    let cycleOut = '';
    reSpec.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = reSpec.exec(fmt)) !== null) {
      cycleOut += fmt.substring(lastIdx, m.index);
      lastIdx = m.index + m[0].length;
      const flags = m[1] || '';
      const type = m[2];
      if (type === '%') { cycleOut += '%'; continue; }
      if (i >= flat.length) { reSpec.lastIndex = fmt.length; break; }
      const v = flat[i++];
      consumedThisPass = true;
      const precMatch = flags.match(/\.(\d+)/);
      const prec = precMatch ? parseInt(precMatch[1]) : -1;
      const widthMatch = flags.match(/^([-+# ]*)(\d+)/);
      const width = widthMatch ? parseInt(widthMatch[2]) : 0;
      const leftAlign = flags.includes('-');
      const padZero = /^0/.test(flags) && !leftAlign;
      let s = '';
      switch (type) {
        case 'd': case 'i': s = String(Math.round(Number(v))); break;
        case 'f': s = Number(v).toFixed(prec >= 0 ? prec : 6); break;
        case 'g': case 'G': {
          const p = prec >= 0 ? prec : 6;
          s = Number(v).toPrecision(p).replace(/\.?0+(e|$)/, '$1');
          if (type === 'G') s = s.toUpperCase();
          break;
        }
        case 'e': case 'E': s = Number(v).toExponential(prec >= 0 ? prec : 6); if (type === 'E') s = s.toUpperCase(); break;
        case 's': s = String(v); break;
        case 'o': s = Math.round(Number(v)).toString(8); break;
        case 'x': s = Math.round(Number(v)).toString(16); break;
        case 'X': s = Math.round(Number(v)).toString(16).toUpperCase(); break;
        case 'c': s = typeof v === 'string' ? v : String.fromCharCode(Math.round(Number(v))); break;
      }
      if (width > s.length) {
        const pad = (padZero && /[diouxXeEfgG]/.test(type) ? '0' : ' ').repeat(width - s.length);
        s = leftAlign ? s + pad : pad + s;
      }
      cycleOut += s;
    }
    cycleOut += fmt.substring(lastIdx);
    out += cycleOut;
    if (!consumedThisPass) break;  // format string had no specifiers — no infinite loop
  }
  // Interpret common escape sequences (MATLAB does this in fprintf even within '...' strings)
  return out.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
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
  // Tracking de bloques anidados (if/for/while/switch) para no cerrar la
  // función con un `end` que en realidad cierra un bloque interno.
  let blockDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    // Quitar comentarios para análisis estructural
    const codePart = (() => {
      const idx = trimmed.indexOf('%');
      if (idx < 0) return trimmed;
      // Heurística: si el % está dentro de string, no es comentario.
      // Para parser estructural basta con la primera ocurrencia.
      return trimmed.substring(0, idx).trim();
    })();

    // Detect function definition: function [a,b] = name(params) or function a = name(params)
    const funcMatch = codePart.match(/^function\s+(?:\[([^\]]+)\]\s*=\s*|(\w+)\s*=\s*)?(\w+)\s*\(([^)]*)\)/);
    if (funcMatch && !inFunc) {
      inFunc = true;
      blockDepth = 0;
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

    if (inFunc && currentFunc) {
      // Trackear apertura/cierre de bloques anidados
      const openBlock = /^(if|for|while|switch|try|parfor)\b/.test(codePart);
      const isEnd = (codePart === 'end' || codePart === 'endfunction' ||
                     codePart === 'endif' || codePart === 'endfor' ||
                     codePart === 'endwhile' || codePart === 'endswitch');
      if (isEnd) {
        if (blockDepth > 0) {
          blockDepth--;
          currentFunc.bodyLines.push(rawLine);
          continue;
        }
        // Este `end` cierra la función
        functions.set(currentFunc.name, {
          name: currentFunc.name,
          params: currentFunc.params,
          body: currentFunc.bodyLines.join('\n'),
          description: `Returns ${currentFunc.outputs ? currentFunc.outputs.join(', ') : currentFunc.outVar}`,
          outputs: currentFunc.outputs || [currentFunc.outVar],
        });
        inFunc = false;
        currentFunc = null;
        continue;
      }
      if (openBlock) blockDepth++;
      currentFunc.bodyLines.push(rawLine);
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

  // ── Mode (Hekatan Lab vs MATLAB estricto) ──
  // hekatan-lab: comportamiento permisivo (autorun, asignaciones se muestran con LaTeX)
  // matlab: estricto — solo `disp`, `fprintf`, `printf` muestran salida; sin LaTeX, texto plano
  let mode: EngineMode = 'hekatan-lab';

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
      // MATLAB nargin / nargout — número de argumentos REALMENTE pasados / esperados
      subParser.set('nargin', args.length);
      subParser.set('nargout', fn.outputs?.length ?? 1);
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
        // Transform MATLAB ~= → mathjs != (not equal). Otros operadores
        // (== <= >= && ||) son compatibles entre MATLAB y mathjs.
        expr = expr.replace(/~=/g, '!=');
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

      // Helper: recolecta el body de un bloque (for/while/if) hasta su `end`
      // matching, devolviendo además los puntos de `else`/`elseif` para `if`.
      function collectBlock(
        lines: { text: string; startLine: number }[],
        startIdx: number
      ): { body: { text: string; startLine: number }[]; endIdx: number; branches?: { cond: string; bodyStart: number; bodyEnd: number }[] } {
        const body: typeof lines = [];
        let depth = 1;
        let i = startIdx;
        const branches: { cond: string; bodyStart: number; bodyEnd: number }[] = [];
        let curBranchStart = 0;
        let curCond = '';
        while (i < lines.length) {
          const kt = lines[i].text.trim().replace(/%.*$/, '').trim();
          if (/^(for|while|if)\s+/.test(kt)) depth++;
          if (kt === 'end' || kt === 'endfunction') {
            depth--;
            if (depth === 0) {
              if (curCond) branches.push({ cond: curCond, bodyStart: curBranchStart, bodyEnd: body.length });
              return { body, endIdx: i + 1, branches: branches.length ? branches : undefined };
            }
          }
          // Detectar elseif / else en el primer nivel solamente
          if (depth === 1) {
            const elIfM = kt.match(/^elseif\s+(.+)$/);
            const elM   = kt === 'else';
            if (elIfM) {
              if (curCond) branches.push({ cond: curCond, bodyStart: curBranchStart, bodyEnd: body.length });
              curCond = elIfM[1];
              curBranchStart = body.length;
              i++; continue;
            }
            if (elM) {
              if (curCond) branches.push({ cond: curCond, bodyStart: curBranchStart, bodyEnd: body.length });
              curCond = '__else__';
              curBranchStart = body.length;
              i++; continue;
            }
          }
          body.push(lines[i]); i++;
        }
        return { body, endIdx: i, branches: branches.length ? branches : undefined };
      }

      // Sentinel exceptions para continue/return (estilo MATLAB / OctaVe)
      // Como no hay try/catch a nivel de bloque, usamos throw + catch específicos
      // arriba en la cadena execFnBody para implementar el control de flujo.
      class ContinueSignal { static readonly INSTANCE = new ContinueSignal(); }
      class BreakSignal    { static readonly INSTANCE = new BreakSignal(); }
      class ReturnSignal   { static readonly INSTANCE = new ReturnSignal(); }

      function execFnBody(lines: { text: string; startLine: number }[]) {
        let i = 0;
        while (i < lines.length) {
          const t = lines[i].text.trim();
          if (!t || t.startsWith('%')) { i++; continue; }

          let kw = t;
          const pci = kw.indexOf('%');
          if (pci > 0) kw = kw.substring(0, pci).trim();
          // Quitar `;` final para que `continue;`, `break;`, `return;` se reconozcan
          const kwClean = kw.replace(/;\s*$/, '').trim();
          if (kwClean === 'end' || kwClean === 'endfunction' || kwClean === 'else' || kwClean.startsWith('elseif ')) { i++; continue; }
          // continue / break / return — control de flujo MATLAB
          if (kwClean === 'continue') { throw ContinueSignal.INSTANCE; }
          if (kwClean === 'break')    { throw BreakSignal.INSTANCE; }
          if (kwClean === 'return')   { throw ReturnSignal.INSTANCE; }

          // for var = range
          const forMatch = kw.match(/^for\s+([a-zA-Z_]\w*)\s*=\s*(.+)$/);
          if (forMatch) {
            const collected = collectBlock(lines, i + 1);
            i = collected.endIdx;
            // Evaluate range
            const rangeExpr = fnReplaceIdx(forMatch[2], funcKnownVars);
            try {
              const rangeVal = subParser.evaluate(rangeExpr);
              let values: number[];
              if (typeof rangeVal === 'number') values = [rangeVal];
              else if (rangeVal && typeof rangeVal.toArray === 'function') values = rangeVal.toArray().flat();
              else if (Array.isArray(rangeVal)) values = rangeVal.flat();
              else values = [Number(rangeVal)];
              let iter = 0;
              forLoop: for (const v of values) {
                if (++iter > MAX_ITER_FN) break;
                subParser.set(forMatch[1], v);
                funcKnownVars.add(forMatch[1]);
                try { execFnBody(collected.body); }
                catch (sig) {
                  if (sig === ContinueSignal.INSTANCE) continue forLoop;
                  if (sig === BreakSignal.INSTANCE)    break  forLoop;
                  throw sig;  // ReturnSignal o error real → propaga
                }
              }
            } catch (e: any) {
              if (e === ReturnSignal.INSTANCE) throw e;
              console.warn('fn for error:', e?.message ?? e);
            }
            continue;
          }

          // while cond
          const whileMatch = kw.match(/^while\s+(.+)$/);
          if (whileMatch) {
            const collected = collectBlock(lines, i + 1);
            i = collected.endIdx;
            try {
              let iter = 0;
              whileLoop: while (true) {
                if (++iter > MAX_ITER_FN) break;
                const condExpr = fnReplaceIdx(whileMatch[1], funcKnownVars);
                const condVal = subParser.evaluate(condExpr);
                if (!condVal) break;
                try { execFnBody(collected.body); }
                catch (sig) {
                  if (sig === ContinueSignal.INSTANCE) continue whileLoop;
                  if (sig === BreakSignal.INSTANCE)    break  whileLoop;
                  throw sig;
                }
              }
            } catch (e: any) {
              if (e === ReturnSignal.INSTANCE) throw e;
              console.warn('fn while error:', e?.message ?? e);
            }
            continue;
          }

          // if cond ... [elseif ... | else ...] end
          const ifMatch = kw.match(/^if\s+(.+)$/);
          if (ifMatch) {
            const collected = collectBlock(lines, i + 1);
            i = collected.endIdx;
            // Build branch list: [if cond, ...elseif/else]
            const allBranches = [
              { cond: ifMatch[1], bodyStart: 0, bodyEnd: collected.branches?.[0]?.bodyStart ?? collected.body.length },
              ...(collected.branches || [])
            ];
            if ((globalThis as any).__hekatanFnDebug) {
              console.error('[fn-if]', fn.name, 'branches:', JSON.stringify(allBranches.map(b => ({ c: b.cond, s: b.bodyStart, e: b.bodyEnd }))));
              console.error('[fn-if] body:', collected.body.map(l => l.text.trim()));
            }
            try {
              for (const br of allBranches) {
                let condVal: any;
                if (br.cond === 'true' || br.cond === '__else__') {
                  condVal = true;
                } else {
                  const condExpr = fnReplaceIdx(br.cond, funcKnownVars);
                  condVal = subParser.evaluate(condExpr);
                }
                if ((globalThis as any).__hekatanFnDebug) {
                  console.error('[fn-if] cond=', br.cond, 'val=', condVal);
                }
                if (condVal) {
                  const slice = collected.body.slice(br.bodyStart, br.bodyEnd);
                  execFnBody(slice);
                  break;
                }
              }
            } catch (sig: any) {
              // Señales de control — re-throw para que el for/while padre las capture
              if (sig === ContinueSignal.INSTANCE || sig === BreakSignal.INSTANCE || sig === ReturnSignal.INSTANCE) {
                throw sig;
              }
              console.warn('fn if error:', sig?.message ?? sig);
            }
            continue;
          }

          // Regular line
          let expr = t.replace(/;$/, '');
          // Multi-output MATLAB:  [a, b, c] = func(args)  (acepta `~` como placeholder)
          const multiOut = expr.match(/^\[\s*([~a-zA-Z_][~\w\s,]*)\s*\]\s*=\s*([a-zA-Z_]\w*)\s*\((.*)\)\s*$/);
          if (multiOut) {
            const targets = multiOut[1].split(',').map(s => s.trim()).filter(s => s);
            const fname = multiOut[2];
            const fargs = multiOut[3];
            const tmpName = `__multi_${fn.name}_${i}`;
            try {
              const callExpr = fnReplaceIdx(`${tmpName} = ${fname}(${fargs})`, funcKnownVars);
              subParser.evaluate(callExpr);
              const result = subParser.evaluate(tmpName);
              funcKnownVars.add(tmpName);
              if (Array.isArray(result)) {
                for (let k = 0; k < targets.length; k++) {
                  if (targets[k] === '~') continue;
                  subParser.set(targets[k], result[k]);
                  funcKnownVars.add(targets[k]);
                }
              } else {
                if (targets.length > 0 && targets[0] !== '~') {
                  subParser.set(targets[0], result);
                  funcKnownVars.add(targets[0]);
                }
              }
            } catch (e: any) { console.warn(`fn multi-out error: ${e.message}`); }
            i++;
            continue;
          }
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

      try { execFnBody(expanded); }
      catch (sig) {
        // `return` dentro del fn termina la ejecución y devuelve los outputs
        if (sig === ReturnSignal.INSTANCE) {
          // continúa con el "Return output variables" abajo
        } else if (sig === ContinueSignal.INSTANCE || sig === BreakSignal.INSTANCE) {
          // continue/break a nivel de fn no tiene sentido; ignoramos.
        } else {
          throw sig;
        }
      }

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

    // ── MATLAB compatibility stubs ──
    // These are no-ops that update plot metadata via a side-channel,
    // letting MATLAB-pure scripts run in HekatanLab without crashing.
    // Real plot decoration in HekatanLab still comes from the title arg of plot/surf/...
    p.set('title',    (..._args: any[]) => null);
    p.set('xlabel',   (..._args: any[]) => null);
    p.set('ylabel',   (..._args: any[]) => null);
    p.set('zlabel',   (..._args: any[]) => null);
    p.set('colorbar', (..._args: any[]) => null);
    p.set('colormap', (..._args: any[]) => null);
    p.set('view',     (..._args: any[]) => null);
    p.set('axis',     (..._args: any[]) => null);
    p.set('shading',  (..._args: any[]) => null);
    p.set('figure',   (..._args: any[]) => null);
    p.set('hold',     (..._args: any[]) => null);
    p.set('grid',     (..._args: any[]) => null);
    p.set('legend',   (..._args: any[]) => null);
    p.set('clf',      (..._args: any[]) => null);
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

    // printf(fmt, ...args)  — Octave/Hekatan style (alias de fprintf a stdout)
    // fprintf(fmt, ...args) — MATLAB: el primer arg es el format string
    // fprintf(fid, fmt, ...args) — MATLAB con file id; ignoramos fid si es 1 (stdout) o numérico
    const matlabPrintf = (...args: any[]) => {
      if (args.length === 0) return new PrintCommand('');
      let fmtArgs = args;
      if (typeof args[0] === 'number' && args.length >= 2) {
        // fprintf(fid, fmt, ...) — MATLAB. fid 1=stdout, 2=stderr; otros se ignoran (no manejamos archivos).
        fmtArgs = args.slice(1);
      }
      const fmt = String(fmtArgs[0] ?? '');
      const rest = fmtArgs.slice(1);
      return new PrintCommand(sprintfMATLAB(fmt, rest));
    };
    parser.set('printf', matlabPrintf);
    parser.set('fprintf', matlabPrintf);
    // sprintf devuelve string (como en MATLAB)
    parser.set('sprintf', (...args: any[]) => {
      const fmt = String(args[0] ?? '');
      return sprintfMATLAB(fmt, args.slice(1));
    });

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

    // ── Aliases MATLAB ↔ mathjs ──
    // En MATLAB: eye(n), zeros(n,m), ones(n,m), linspace, logspace
    // mathjs ya tiene zeros/ones/linspace/logspace pero llama a la identidad `identity`.
    parser.set('eye', (...args: any[]) => {
      const n = typeof args[0] === 'number' ? args[0] : 1;
      const m = typeof args[1] === 'number' ? args[1] : n;
      return math.identity(n, m);
    });
    // numel(M) — número total de elementos (alias del .size)
    parser.set('numel', (M: any) => {
      try {
        const s = math.size(M);
        const sa = (s as any).toArray ? (s as any).toArray() : (Array.isArray(s) ? s : [s]);
        return sa.reduce((p: number, v: any) => p * Number(v), 1);
      } catch { return 1; }
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
    // NB: wrap inverseSync in try/catch — for some matrix sizes/conditioning the
    // WASM build can throw "memory access out of bounds" before returning a status.
    // We fall back to mathjs in that case (slower but correct).
    parser.set('inv', (A: any) => {
      if (eigenSolver.ready) {
        let aArr = A.toArray ? A.toArray() : A;
        if (Array.isArray(aArr) && Array.isArray(aArr[0]) && aArr.length >= 4) {
          try {
            const result = eigenSolver.inverseSync(aArr);
            if (result) return math.matrix(result);
          } catch (e) {
            // WASM trap (out-of-bounds, stack overflow, etc.) — fall back to mathjs.
            console.warn('[Hekatan inv] WASM inverse failed, falling back to mathjs:', (e as any)?.message ?? e);
          }
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

    // Helper: convertir un valor MATLAB-1-based a un índice mathjs-0-based.
    // Soporta:  número  → índice escalar
    //           rango (Range/Matrix con .toArray) → array de índices
    //           vector [3,4] → array de índices
    function toMathIndex(v: any): number | number[] {
      if (typeof v === 'number') return Math.round(v) - 1;
      if (typeof v === 'boolean') return v ? 0 : -1;
      let arr: any = null;
      if (v && typeof v.toArray === 'function') arr = v.toArray();
      else if (Array.isArray(v)) arr = v;
      if (Array.isArray(arr)) {
        const flat = arr.flat(Infinity).map((x: any) => Math.round(Number(x)) - 1);
        return flat;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error('Index must be a number, range, or vector');
      return Math.round(n) - 1;
    }

    // _setidx: MATLAB-style 1-based indexed assignment M(i,j) = val
    parser.set('_setidx', (...args: any[]) => {
      const M = args[0];
      const val = args[args.length - 1];
      if (args.length === 3) {
        // Single index: M(i) = val   (i puede ser escalar, rango o vector)
        const i = toMathIndex(args[1]);
        // Detect shape to handle MATLAB row/col vector semantics correctly.
        // For a 1xN row vector created by zeros(1,N), M(k)=val should set the k-th column,
        // not extend vertically (which is what math.index(k) does on a 2D matrix).
        let shape: number[] | null = null;
        try {
          if (M && typeof M.size === 'function') shape = M.size();
          else if (Array.isArray(M)) {
            // Detect [[...]] vs [...]
            if (M.length > 0 && Array.isArray(M[0])) {
              shape = [M.length, M[0].length];
            } else {
              shape = [M.length];
            }
          }
        } catch {}
        if (shape && shape.length === 2) {
          const [rows, cols] = shape;
          if (rows === 1) {
            // Row vector: M(k) → M(0, k-1)
            try { return math.subset(M, math.index(0, i as any), val); } catch {}
          } else if (cols === 1) {
            // Column vector: M(k) → M(k-1, 0)
            try { return math.subset(M, math.index(i as any, 0), val); } catch {}
          }
        }
        try { return math.subset(M, math.index(i as any), val); } catch {}
        try { return math.subset(M, math.index(i as any, 0), val); } catch {}
        try { return math.subset(M, math.index(0, i as any), val); } catch {}
        throw new Error(`Cannot set index ${i}`);
      }
      if (args.length === 4) {
        // Double index: M(i,j) = val (cualquiera puede ser rango/vector)
        const i = toMathIndex(args[1]);
        const j = toMathIndex(args[2]);
        return math.subset(M, math.index(i as any, j as any), val);
      }
      throw new Error('Invalid index assignment');
    });

    // _idx: MATLAB-style 1-based indexing — soporta escalar, rango (3:4) y vector [3,4]
    parser.set('_idx', (...args: any[]) => {
      const M = args[0];
      if (args.length === 2) {
        const i = toMathIndex(args[1]);
        // Vector / range index → soporta v(3:4), v([3,4])
        if (Array.isArray(i)) {
          try { return math.subset(M, math.index(i)); } catch {}
          try { return math.subset(M, math.index(i, 0)); } catch {}
          try { return math.subset(M, math.index(0, i)); } catch {}
          throw new Error(`Cannot index with vector`);
        }
        // Single scalar index — works for 1D arrays and Nx1/1xN matrices
        try { return math.subset(M, math.index(i)); } catch {}
        try { return math.subset(M, math.index(i, 0)); } catch {}
        try { return math.subset(M, math.index(0, i)); } catch {}
        const arr = (typeof M.toArray === 'function') ? M.toArray() : M;
        if (Array.isArray(arr)) {
          const flat = arr.flat(Infinity);
          return flat[i];
        }
        throw new Error(`Cannot index into value`);
      }
      if (args.length === 3) {
        // Two indices: M(i,j)  — i,j pueden ser escalar/rango/vector
        const i = toMathIndex(args[1]);
        const j = toMathIndex(args[2]);
        return math.subset(M, math.index(i as any, j as any));
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
      'title','xlabel','ylabel','zlabel','colorbar','colormap','view','axis','shading','figure','hold','grid','legend','clf',
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
    const MAX_ITER = 5000000; // safety limit (was 10K — bumped for compile-cached loop bodies)
    let insideLoop = 0; // depth counter: >0 means inside for/while → suppress output (MATLAB behavior)
    // Sentinels para continue / break / return en el flujo top-level
    const __ContinueSignal = Symbol('continue');
    const __BreakSignal    = Symbol('break');
    const __ReturnSignal   = Symbol('return');

    // Apply a regex transform only to portions OUTSIDE string literals
    // (so `\n`, `\t` etc. inside `"..."` survive untouched).
    function applyOutsideStrings(s: string, fn: (chunk: string) => string): string {
      let out = '';
      let i = 0;
      while (i < s.length) {
        const ch = s[i];
        if (ch === '"' || ch === "'") {
          const quote = ch;
          let j = i + 1;
          while (j < s.length) {
            if (s[j] === '\\') { j += 2; continue; }
            if (s[j] === quote) { j++; break; }
            j++;
          }
          out += s.substring(i, j); // keep string literal as-is
          i = j;
        } else {
          let j = i;
          while (j < s.length && s[j] !== '"' && s[j] !== "'") j++;
          out += fn(s.substring(i, j));
          i = j;
        }
      }
      return out;
    }

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

      // MATLAB compat — IMPORTANT: estas transformaciones NO deben tocar el contenido
      // dentro de strings literales, o romperían escapes como `\n`, `\t` en fprintf.
      // Convertir 'foo' a "foo" primero (single→double quote)
      expr = expr.replace(/'([^']*?)'/g, '"$1"');
      // Aplicar transformaciones MATLAB→mathjs solo FUERA de strings:
      //   x'      → transpose(x)
      //   A\b     → inv(A)*b   (mldivide)
      //   ~=      → !=         (not equal MATLAB → mathjs)
      //   &&  ||  → ya soportados por mathjs
      expr = applyOutsideStrings(expr, chunk =>
        chunk
          .replace(/~=/g, '!=')
          .replace(/(\w+)'/g, 'transpose($1)')
          .replace(/(\w+)\s*\\\s*(\w+)/g, 'inv($1) * $2')
      );

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

      // Normal _idx replacement for reads (with balanced parens) — solo fuera de strings
      // para no tocar contenido de fprintf('K(1,1) = %g', ...)
      expr = applyOutsideStrings(expr, chunk => replaceIdx(chunk));
      return { expr, suppress };
    }

    // ── Compile-cache for loop bodies ──
    // mathjs `parser.evaluate(string)` re-parses the expression every call.
    // For tight loops (1k+ iterations), parsing dominates over evaluation.
    // We cache the compiled node per expression and re-evaluate against the
    // parser's internal scope, so MATLAB-style `for i=1:N ... end` becomes
    // ~5-20× faster without changing semantics.
    //
    // Tier 1: JIT — transpilar el AST a JS optimizable por V8.
    //   Para statements simples (operadores escalares, asignaciones,
    //   llamadas a funciones builtin/usuario, indexación), generamos
    //   `new Function('scope','math','helpers', '...')` con código JS
    //   plano. V8 (TurboFan) lo optimiza al nivel de Julia bien tipado.
    // Tier 2: compile-cache de mathjs — node.compile() + .evaluate(scope).
    // Tier 3: parser.evaluate(string) — re-parsea cada vez (lento).
    //
    // Si el JIT no soporta algún nodo (RangeNode complejo, ConditionalNode,
    // funciones con rawArgs, etc.) automáticamente cae al Tier 2.
    const jitCache = new Map<string, ((scope: any, mathNs: any, helpers: any) => any) | null>();
    const compiledCache = new Map<string, any>();

    // Recolecta nombres de SymbolNode LEÍDOS del scope (no constantes mathjs).
    // Excluye los nombres del LHS de AssignmentNode pues esos son escrituras puras.
    function collectReads(node: any, out: Set<string> = new Set(), excluded: Set<string> = new Set()): string[] {
      if (!node) return Array.from(out);
      const t = node.type;
      if (t === 'SymbolNode') {
        const n = node.name;
        // Constantes hardcoded — no son scope reads
        if (n === 'pi' || n === 'PI' || n === 'e' || n === 'E' ||
            n === 'Infinity' || n === 'NaN' || n === 'true' || n === 'false') {
          return Array.from(out);
        }
        if (!excluded.has(n)) out.add(n);
      } else if (t === 'AssignmentNode') {
        // RHS sí se lee; LHS NO va a out (es write).
        // Pero si hay `a = a + 1`, el `a` del RHS sí se lee — y NO debe excluirse.
        // Por eso solo excluyo el nombre del LHS de su propia escritura, no de los reads.
        collectReads(node.value, out, excluded);
      } else if (t === 'FunctionNode') {
        // No incluir el nombre de la función como read (lo resuelve _f)
        const fexcluded = new Set(excluded);
        if (node.fn?.name) fexcluded.add(node.fn.name);
        for (const a of node.args || []) collectReads(a, out, excluded);
      } else {
        // Recurrir en todos los hijos
        const keys = ['args', 'items', 'content', 'value', 'object',
                      'index', 'dimensions', 'condition', 'trueExpr', 'falseExpr'];
        for (const k of keys) {
          const v = (node as any)[k];
          if (Array.isArray(v)) v.forEach(c => collectReads(c, out, excluded));
          else if (v && typeof v === 'object' && v.type) collectReads(v, out, excluded);
        }
        if (Array.isArray(node.blocks)) {
          for (const b of node.blocks) collectReads(b.node, out, excluded);
        }
      }
      return Array.from(out);
    }

    // Sanitiza nombre para usarlo como identificador JS local.
    // Solo permitimos [A-Za-z_][A-Za-z0-9_]*; el resto se reemplaza por _.
    function jsId(name: string): string {
      return name.replace(/[^A-Za-z0-9_]/g, '_');
    }

    function escapeRegExp(s: string): string {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ¿El nodo puede producir un valor no-escalar (matriz/array/vector)?
    // Heurística conservadora:
    //  - SymbolNode: NO sabemos a priori si es escalar; asumimos escalar (rápido).
    //    El usuario debe escribir loops escalares con primitivos numéricos.
    //  - FunctionNode con nombre en PURE_MATH_FNS: escalar (sin/cos/sqrt → number)
    //  - FunctionNode con otro nombre (eye/zeros/ones/inv/transpose/_idx/_setidx/...): asumir matriz.
    //  - ArrayNode (literales [...]): matriz por definición.
    //  - OperatorNode: recursivo en args.
    function mayBeNonScalar(node: any): boolean {
      if (!node) return false;
      const t = node.type;
      if (t === 'ConstantNode') return false;       // literales numéricos
      if (t === 'SymbolNode') {
        // Constantes mathjs (pi, e) son escalares. Otros symbols los asumimos escalares.
        return false;
      }
      if (t === 'ArrayNode') return true;
      if (t === 'FunctionNode') {
        const fname = node.fn?.name;
        if (fname && PURE_MATH_FNS[fname]) return false;
        return true;
      }
      if (t === 'OperatorNode' || t === 'ParenthesisNode') {
        const args = node.args || (node.content ? [node.content] : []);
        for (const a of args) if (mayBeNonScalar(a)) return true;
        return false;
      }
      // Otros: ser conservador y asumir matrix
      return true;
    }

    // Helpers escalares INLINEABLES: mathjs queda en variables locales del Function-body
    // (mAdd, mSub, ...) — V8 las puede monomorfizar más fácil que un helper que cierra
    // sobre un objeto. Asumimos que la mayoría de operaciones en hot loops son número-número.

    // Set de funciones "puras" de Math que aceptan/devuelven number y se inlinan a Math.*
    // (mathjs las acepta también pero pasa por typed-function dispatch).
    const PURE_MATH_FNS: Record<string, string> = {
      sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
      asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan', atan2: 'Math.atan2',
      sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
      exp: 'Math.exp', log: 'Math.log', log2: 'Math.log2', log10: 'Math.log10',
      sqrt: 'Math.sqrt', cbrt: 'Math.cbrt',
      abs: 'Math.abs', sign: 'Math.sign',
      floor: 'Math.floor', ceil: 'Math.ceil', round: 'Math.round', trunc: 'Math.trunc',
      min: 'Math.min', max: 'Math.max',
      pow: 'Math.pow',
    };

    // Transpilador AST → JS. Devuelve string de código JS o null si no soporta el nodo.
    // Si `localsSet` se provee, los SymbolNodes/AssignmentNodes con nombre en el set
    // se compilan a accesos a vars locales JS (__v_<name>) en lugar de _g/_s closures.
    // Esto es lo que permite que un for-loop completo se ejecute como puro JS local.
    function jsFromAstWith(n: any, localsSet: Set<string> | null): string | null {
      if (!n) return null;
      const t = n.type;
      const isLocal = (name: string) => localsSet ? localsSet.has(name) : false;
      switch (t) {
        case 'ConstantNode': {
          const v = n.value;
          if (typeof v === 'number') return Number.isFinite(v) ? String(v) : `(${String(v)})`;
          if (typeof v === 'string') return JSON.stringify(v);
          if (typeof v === 'boolean') return v ? 'true' : 'false';
          return null;
        }
        case 'SymbolNode': {
          const name = n.name;
          if (name === 'pi' || name === 'PI') return 'Math.PI';
          if (name === 'e' || name === 'E')   return 'Math.E';
          if (name === 'Infinity')            return 'Infinity';
          if (name === 'NaN')                 return 'NaN';
          if (name === 'true')                return 'true';
          if (name === 'false')               return 'false';
          if (isLocal(name))                  return `__v_${jsId(name)}`;
          return `_g(${JSON.stringify(name)})`;
        }
        case 'ParenthesisNode': {
          const inner = jsFromAstWith(n.content, localsSet);
          return inner === null ? null : `(${inner})`;
        }
        case 'OperatorNode': {
          const args = n.args.map((a: any) => jsFromAstWith(a, localsSet));
          if (args.some((a: string | null) => a === null)) return null;
          const fn = n.fn;
          // Si CUALQUIER operando contiene una función no-PURE (eye/zeros/inv/transpose/etc),
          // asumimos que puede devolver matriz y usamos mathNs.<op> en lugar de operador JS directo.
          // Operadores JS con matrices dan NaN o concatenación. mathNs.<op> los maneja correctamente.
          const anyMatrixy = n.args.some((a: any) => mayBeNonScalar(a));
          if (args.length === 2) {
            const [A, B] = args;
            if (anyMatrixy) {
              switch (fn) {
                case 'add':      return `mathNs.add(${A},${B})`;
                case 'subtract': return `mathNs.subtract(${A},${B})`;
                case 'multiply': return `mathNs.multiply(${A},${B})`;
                case 'divide':   return `mathNs.divide(${A},${B})`;
                case 'pow':      return `mathNs.pow(${A},${B})`;
                case 'mod':      return `mathNs.mod(${A},${B})`;
                default:         return `mathNs.${fn}(${A},${B})`;
              }
            }
            switch (fn) {
              case 'add':       return `(${A}+${B})`;
              case 'subtract':  return `(${A}-${B})`;
              case 'multiply':  return `(${A}*${B})`;
              case 'divide':    return `(${A}/${B})`;
              case 'pow':       return `Math.pow(${A},${B})`;
              case 'mod':       return `(${A}%${B})`;
              case 'smaller':       return `(${A}<${B})`;
              case 'larger':        return `(${A}>${B})`;
              case 'smallerEq':     return `(${A}<=${B})`;
              case 'largerEq':      return `(${A}>=${B})`;
              case 'equal':         return `(${A}===${B})`;
              case 'unequal':       return `(${A}!==${B})`;
              case 'and':       return `(${A}&&${B})`;
              case 'or':        return `(${A}||${B})`;
              default:
                return `mathNs.${fn}(${A},${B})`;
            }
          }
          if (args.length === 1) {
            const [A] = args;
            if (anyMatrixy) {
              switch (fn) {
                case 'unaryMinus': return `mathNs.unaryMinus(${A})`;
                case 'unaryPlus':  return A;
                default: return `mathNs.${fn}(${A})`;
              }
            }
            switch (fn) {
              case 'unaryMinus': return `(-(${A}))`;
              case 'unaryPlus':  return `(+(${A}))`;
              case 'not':        return `(!(${A}))`;
              default: return `mathNs.${fn}(${A})`;
            }
          }
          return null;
        }
        case 'AssignmentNode': {
          if (n.object?.type !== 'SymbolNode') return null;
          const rhs = jsFromAstWith(n.value, localsSet);
          if (rhs === null) return null;
          const name = n.object.name;
          if (isLocal(name)) {
            return `(__v_${jsId(name)}=${rhs})`;
          }
          return `_s(${JSON.stringify(name)},${rhs})`;
        }
        case 'FunctionNode': {
          const fname = n.fn?.name;
          if (!fname) return null;
          const args = n.args.map((a: any) => jsFromAstWith(a, localsSet));
          if (args.some((a: string | null) => a === null)) return null;
          if (PURE_MATH_FNS[fname] && args.length <= 2) {
            return `${PURE_MATH_FNS[fname]}(${args.join(',')})`;
          }
          return `_f(${JSON.stringify(fname)})(${args.join(',')})`;
        }
        case 'ArrayNode': {
          const items = n.items.map((a: any) => jsFromAstWith(a, localsSet));
          if (items.some((a: string | null) => a === null)) return null;
          return `mathNs.matrix([${items.join(',')}])`;
        }
        case 'BlockNode': {
          const parts = n.blocks.map((b: any) => jsFromAstWith(b.node, localsSet));
          if (parts.some((p: string | null) => p === null)) return null;
          if (parts.length === 1) return parts[0];
          return `(${parts.join(',')})`;
        }
        default:
          return null;
      }
    }

    // Wrapper sin locals (usado por compiledEval)
    function jsFromAst(n: any): string | null { return jsFromAstWith(n, null); }

    // Detecta si un AST contiene operaciones que el JIT for-loop NO maneja bien:
    //   - _setidx, _idx con vector (indexación)
    //   - Funciones que devuelven matrices (eye, zeros, ones, transpose, inv, ...)
    //   - Cualquier FunctionNode no-PURE — porque el JIT compila `*`,`+` a JS
    //     directos que asumen escalares; con matrices devuelven NaN.
    // PURE_MATH_FNS (sin/cos/sqrt/etc) son safe: number→number.
    function containsIndexedOps(node: any): boolean {
      if (!node) return false;
      if (node.type === 'FunctionNode') {
        const fname = node.fn?.name;
        // Si NO está en PURE_MATH_FNS, asumimos que puede devolver matriz/objeto.
        // Eso incluye: _setidx, _idx, eye, zeros, ones, identity, transpose, inv,
        // matrix, eig, eigs, svd, fprintf, disp, printf, etc.
        if (fname && !PURE_MATH_FNS[fname]) return true;
      }
      // Recurrir
      const keys = ['args', 'items', 'content', 'value', 'object',
                    'index', 'dimensions', 'condition', 'trueExpr', 'falseExpr'];
      for (const k of keys) {
        const v = (node as any)[k];
        if (Array.isArray(v)) {
          for (const c of v) if (containsIndexedOps(c)) return true;
        } else if (v && typeof v === 'object' && v.type) {
          if (containsIndexedOps(v)) return true;
        }
      }
      if (Array.isArray(node.blocks)) {
        for (const b of node.blocks) if (containsIndexedOps(b.node)) return true;
      }
      return false;
    }

    // JIT del for-loop COMPLETO. Si todo el cuerpo es transpilable,
    // genera UNA fn JS que ejecuta todas las iteraciones como código nativo
    // (V8 lo optimiza a loop nativo, sin overhead por iteración).
    //   for i = 1:50000  →  for(let i=1;i<=50000;i++) { ... }
    //   con vars del scope hoisted a locales antes/después del loop.
    // Devuelve la función o null si no se puede JIT.
    const forLoopJitCache = new Map<string, ((scope: any, mathNs: any) => void) | null>();
    function tryJitForLoop(stmt: any): ((scope: any, mathNs: any) => void) | null {
      // 1) Cache por la firma del loop (rango + body texts)
      const bodyTexts: string[] = [];
      for (const b of stmt.body) {
        if (b.kind !== 'line') return null;  // solo líneas simples soportadas
        const t = (b.text || '').trim();
        if (!t) continue;
        if (t.startsWith('%')) continue;     // comentarios — los saltamos
        bodyTexts.push(t);
      }
      const cacheKey = `for ${stmt.varName} = ${stmt.range} | ${bodyTexts.join(';')}`;
      if (forLoopJitCache.has(cacheKey)) return forLoopJitCache.get(cacheKey) as any;

      // 2) El rango debe ser RangeNode (start:end o start:step:end) con literales o symbol simples
      let rangeAst: any;
      try { rangeAst = (math as any).parse(stmt.range); }
      catch { forLoopJitCache.set(cacheKey, null); return null; }
      if (rangeAst?.type !== 'RangeNode') {
        forLoopJitCache.set(cacheKey, null); return null;
      }

      // 3) Parsear y validar cada body stmt
      type Item = { ast: any; reads: string[]; writes: string[] };
      const items: Item[] = [];
      const allReads = new Set<string>();
      const allWrites = new Set<string>();
      for (const txt of bodyTexts) {
        const sub: { text: string; hadSemi: boolean } = { text: txt.replace(/;$/, ''), hadSemi: txt.endsWith(';') };
        // prepExpr aplica las transforms de MATLAB compat (transpose, mldivide).
        // Reusamos prepExpr para que el AST refleje las transformaciones.
        const sourceForPrep = sub.hadSemi ? sub.text + ';' : sub.text;
        const { expr } = prepExpr(sourceForPrep);
        if (!expr) continue;
        let ast: any;
        try { ast = (math as any).parse(expr); }
        catch { forLoopJitCache.set(cacheKey, null); return null; }
        // Solo aceptamos AssignmentNode o expresiones puras (no AssignmentNode con lhs raro)
        if (ast.type === 'AssignmentNode') {
          if (ast.object?.type !== 'SymbolNode') { forLoopJitCache.set(cacheKey, null); return null; }
          allWrites.add(ast.object.name);
          collectReads(ast.value, allReads);
        } else {
          // expr pura — la evaluamos por su efecto secundario (ej. disp), pero NO la JITeamos en loop
          // porque puede tener efectos como printf que requieren evento. Bail.
          forLoopJitCache.set(cacheKey, null);
          return null;
        }
        // Bail si el body tiene indexed assignments (_setidx) o lecturas indexadas
        // complejas (_idx con vector). El JIT no las maneja correctamente todavía;
        // lo seguro es caer al for-loop interpretado que sí las soporta.
        if (containsIndexedOps(ast)) {
          forLoopJitCache.set(cacheKey, null);
          return null;
        }
        // Verificar que el ast sea jsFromAst-compatible (sin locals primero, para chequear)
        if (jsFromAstWith(ast, null) === null) {
          forLoopJitCache.set(cacheKey, null); return null;
        }
        items.push({ ast, reads: [], writes: [] });
      }

      if (items.length === 0) { forLoopJitCache.set(cacheKey, null); return null; }

      // 4) La var del loop tambien es local
      allWrites.add(stmt.varName);

      // Set unión de todas las locales (read y write)
      const localsSet = new Set<string>([...allReads, ...allWrites]);

      // 5) Generar JS para el rango: start, end, step
      const startCode = jsFromAstWith(rangeAst.start, null);
      const endCode   = jsFromAstWith(rangeAst.end, null);
      const stepCode  = rangeAst.step ? jsFromAstWith(rangeAst.step, null) : '1';
      if (startCode === null || endCode === null || stepCode === null) {
        forLoopJitCache.set(cacheKey, null); return null;
      }

      // 6) Generar el body como statements JS
      const bodyJs: string[] = [];
      for (const it of items) {
        const stmtJs = jsFromAstWith(it.ast, localsSet);
        if (stmtJs === null) { forLoopJitCache.set(cacheKey, null); return null; }
        bodyJs.push(`${stmtJs};`);
      }

      // 7) Construir la fn JS completa
      const loopVarLocal = `__v_${jsId(stmt.varName)}`;
      const declare = Array.from(localsSet)
        .filter(n => n !== stmt.varName)
        .map(n => `let __v_${jsId(n)}=_g(${JSON.stringify(n)});`).join('');
      const writeback = Array.from(allWrites)
        .map(n => `_s(${JSON.stringify(n)},__v_${jsId(n)});`).join('');

      const code = `
        const _start=${startCode}, _end=${endCode}, _step=${stepCode};
        ${declare}
        let ${loopVarLocal}=_start;
        if (_step>0) { for(; ${loopVarLocal}<=_end; ${loopVarLocal}+=_step){ ${bodyJs.join('')} } }
        else         { for(; ${loopVarLocal}>=_end; ${loopVarLocal}+=_step){ ${bodyJs.join('')} } }
        ${writeback}
      `;

      let fn: ((scope: any, mathNs: any) => void) | null = null;
      try {
        // eslint-disable-next-line no-new-func
        fn = new Function('_g', '_s', '_f', 'mathNs', code) as any;
      } catch {
        forLoopJitCache.set(cacheKey, null); return null;
      }
      // Wrapper que cierra sobre los helpers JIT (capturados al ejecutar)
      const wrapped = (scope: any, mathNs: any) => {
        _ensureJitHelpers(scope);
        // @ts-ignore
        fn(_jit_g, _jit_s, _jit_f, mathNs);
      };
      forLoopJitCache.set(cacheKey, wrapped);
      _jitSources.set(`__forLoop ${cacheKey}`, code);
      return wrapped;
    }

    // Métricas de tier (debug)
    const _stats = { jit: 0, jitFail: 0, compile: 0, parse: 0 };
    const _jitSources = new Map<string, string>();
    (window as any).__hekatanJitStats = () => ({ ..._stats });
    (window as any).__hekatanJitSources = () => Array.from(_jitSources.entries());

    // Helpers JIT cacheados (creados una vez por scope, no por llamada).
    // Se invalidan si cambia parser.scope (lo cual sucede en parser = math.parser()).
    let _jitScopeRef: any = null;
    let _jit_g: ((name: string) => any) | null = null;
    let _jit_s: ((name: string, v: any) => any) | null = null;
    let _jit_f: ((name: string) => any) | null = null;
    function _ensureJitHelpers(scope: any) {
      if (scope === _jitScopeRef && _jit_g) return;  // ya hechos
      _jitScopeRef = scope;
      const isMap = typeof scope.get === 'function' && typeof scope.set === 'function';
      if (isMap) {
        _jit_g = (name: string) => scope.get(name);
        _jit_s = (name: string, v: any) => { scope.set(name, v); return v; };
        _jit_f = (name: string) => {
          const f = scope.get(name);
          return typeof f === 'function' ? f : (math as any)[name];
        };
      } else {
        _jit_g = (name: string) => scope[name];
        _jit_s = (name: string, v: any) => { scope[name] = v; return v; };
        _jit_f = (name: string) => {
          const f = scope[name];
          return typeof f === 'function' ? f : (math as any)[name];
        };
      }
    }

    // Toggle dinámico: si globalThis.__hekatanDisableJit está true, saltamos
    // el JIT statement-level y usamos solo compile-cache (Tier 2).
    // Se lee EN CADA llamada para que setMode('matlab') funcione runtime.
    function isJitDisabled(): boolean {
      return typeof globalThis !== "undefined"
        && (globalThis as any).__hekatanDisableJit === true;
    }

    function compiledEval(expr: string): any {
      const scope = (parser as any).scope;
      if (!scope) { _stats.parse++; return parser.evaluate(expr); }
      _ensureJitHelpers(scope);

      if (isJitDisabled()) {
        // Salta a Tier 2 directamente
        let node = compiledCache.get(expr);
        if (node === undefined) {
          try { node = (math as any).parse(expr).compile(); }
          catch { node = null; }
          compiledCache.set(expr, node);
        }
        if (node) {
          try { _stats.compile++; return node.evaluate(scope); }
          catch {}
        }
        _stats.parse++;
        return parser.evaluate(expr);
      }

      // Tier 1: JIT
      if (jitCache.has(expr)) {
        const fn = jitCache.get(expr);
        if (fn) {
          try { _stats.jit++; return fn(_jit_g, _jit_s, _jit_f, math); }
          catch { _stats.jitFail++; }
        }
      } else {
        try {
          const ast = (math as any).parse(expr);
          const code = jsFromAst(ast);
          if (code !== null) {
            // OPTIMIZACIÓN: hoist scope reads. Declaramos cada variable LEÍDA del scope
            // como local var al inicio del cuerpo JS, así V8 puede tratar las lecturas
            // subsiguientes como acceso a registro (zero-cost) en vez de Map.get.
            //   Ej: `s = s + i^2 - sin(i)*cos(i)` →
            //   const __r_s = _g("s"), __r_i = _g("i");
            //   return _s("s", __r_s + Math.pow(__r_i, 2) - Math.sin(__r_i)*Math.cos(__r_i));
            // Si la variable se asigna después de leerse, OK porque ya tenemos su valor previo
            // en la local (mismo orden que MATLAB: a = a + 1 lee a viejo, asigna nuevo).
            const reads = collectReads(ast);
            const prelude = reads.length > 0
              ? `const ${reads.map(n => `__r_${jsId(n)}=_g(${JSON.stringify(n)})`).join(',')};`
              : '';
            // Reescribir el código sustituyendo _g("name") por __r_name
            let optimizedCode = code;
            for (const n of reads) {
              const re = new RegExp(`_g\\(${escapeRegExp(JSON.stringify(n))}\\)`, 'g');
              optimizedCode = optimizedCode.replace(re, `__r_${jsId(n)}`);
            }
            const body = `${prelude}return ${optimizedCode};`;
            _jitSources.set(expr, body);
            // eslint-disable-next-line no-new-func
            const fn = new Function('_g', '_s', '_f', 'mathNs', body) as any;
            jitCache.set(expr, fn);
            try { _stats.jit++; return fn(_jit_g, _jit_s, _jit_f, math); }
            catch { _stats.jitFail++; }
          } else {
            jitCache.set(expr, null);
          }
        } catch {
          jitCache.set(expr, null);
        }
      }

      // Tier 2: mathjs compile-cache
      let node = compiledCache.get(expr);
      if (node === undefined) {
        try { node = (math as any).parse(expr).compile(); }
        catch { node = null; }
        compiledCache.set(expr, node);
      }
      if (node) {
        try { _stats.compile++; return node.evaluate(scope); }
        catch { /* fallback */ }
      }

      // Tier 3: parser fresco
      _stats.parse++;
      return parser.evaluate(expr);
    }

    function evalOneLine(rawText: string, startLine: number, suppress: boolean, expr: string) {
      // Inside for/while loops: suppress ALL output (MATLAB behavior)
      // Only disp() or plot commands produce output inside loops
      const loopSuppress = insideLoop > 0;

      // Multi-output MATLAB: [a, b, c] = func(args)  (acepta `~` como placeholder ignorado)
      // Expandir a llamada única + lecturas indexadas (igual que en execFnBody).
      const multiOut = expr.match(/^\[\s*([~a-zA-Z_][~\w\s,]*)\s*\]\s*=\s*([a-zA-Z_]\w*)\s*\((.*)\)\s*$/);
      if (multiOut) {
        const targets = multiOut[1].split(',').map(s => s.trim()).filter(s => s);
        const fname = multiOut[2];
        const fargs = multiOut[3];
        const tmpName = `__multi_${startLine}_${Math.random().toString(36).substring(2, 7)}`;
        try {
          parser.evaluate(`${tmpName} = ${fname}(${fargs})`);
          const result = parser.evaluate(tmpName);
          if (Array.isArray(result)) {
            for (let k = 0; k < targets.length; k++) {
              if (targets[k] === '~') continue;  // placeholder MATLAB
              parser.set(targets[k], result[k]);
              knownVars.add(targets[k]);
            }
          } else {
            if (targets.length > 0 && targets[0] !== '~') {
              parser.set(targets[0], result);
              knownVars.add(targets[0]);
            }
          }
          if (!loopSuppress && !suppress) {
            // Reportar solo el primer destino (estilo MATLAB)
            const v = result && Array.isArray(result) ? result[0] : result;
            results.push({ line: startLine + 1, input: rawText, type: 'assign', varName: targets[0], value: v, formatted: formatValue(v) });
          }
        } catch (e: any) {
          if (!loopSuppress) results.push({ line: startLine + 1, input: rawText, type: 'error', error: e.message });
        }
        return;
      }

      try {
        const result = (insideLoop > 0)
          ? compiledEval(expr)
          : parser.evaluate(expr);
        // disp() always produces output, even inside loops
        if (result instanceof DispCommand) {
          results.push({ line: startLine + 1, input: rawText, type: 'disp', value: result.value, formatted: formatValue(result.value) });
          return;
        }
        // printf/fprintf — siempre muestra (incluso dentro de loops, igual que MATLAB)
        if (result instanceof PrintCommand) {
          results.push({ line: startLine + 1, input: rawText, type: 'printf', value: result.text, formatted: result.text });
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
        // Modo MATLAB estricto: igual al MATLAB local — solo disp/printf/fprintf y asignaciones
        // sin punto y coma muestran output. Las expresiones puras tipo `2+3` muestran como `ans = 5`.
        // Por defecto suprimimos todo lo que no haya pedido el usuario (SUPPRESS más estricto).
        const strict = mode === 'matlab';
        const assignMatch = expr.match(/^([a-zA-Z_]\w*)\s*=/);
        if (assignMatch) {
          knownVars.add(assignMatch[1]);
          if (result instanceof PlotCommand) {
            results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result.data });
          } else if (result instanceof ViewCommand) {
            results.push({ line: startLine + 1, input: rawText, type: 'plot', value: result });
          } else if (!loopSuppress) {
            // En MATLAB local, `x = 5` muestra `x = 5` y `x = 5;` no muestra nada — comportamiento estándar.
            // Esto coincide con `suppress` (true cuando termina en ';'), así que `suppress` ya funciona en ambos modos.
            results.push({
              line: startLine + 1, input: rawText, type: 'assign',
              varName: assignMatch[1], value: result,
              formatted: suppress ? undefined : formatValue(result),
            });
          }
        } else if (!loopSuppress) {
          // Expresión sin asignación: en MATLAB se asigna a `ans` y se muestra a menos que termine en ';'.
          // En modo estricto, lo mostramos como `ans = ...` (más fiel a MATLAB).
          if (strict && !suppress) {
            try { parser.set('ans', result); } catch {}
            results.push({
              line: startLine + 1, input: rawText, type: 'assign',
              varName: 'ans', value: result, formatted: formatValue(result),
            });
          } else {
            results.push({
              line: startLine + 1, input: rawText, type: 'expr',
              value: result, formatted: suppress ? undefined : formatValue(result),
            });
          }
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
          const kw = stripComment(trimmed).replace(/;\s*$/, '').trim();
          if (kw === 'end' || kw === 'endfunction' || kw === 'clc' || kw === 'clear' || kw === 'clear all') continue;
          // MATLAB control flow a nivel top-level
          if (kw === 'continue' && insideLoop > 0) { throw __ContinueSignal; }
          if (kw === 'break'    && insideLoop > 0) { throw __BreakSignal; }
          if (kw === 'return') { throw __ReturnSignal; }
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
          // Split por `;` Y por `,` fuera de brackets/strings (MATLAB acepta ambos):
          //   `;` → separador suppress (oculta el stmt previo)
          //   `,` → separador visible (muestra el stmt previo, igual que sin separador)
          // Ejemplos MATLAB:
          //   a=1; b=2   → a oculto, b visible
          //   a=1; b=2;  → ambos ocultos
          //   a=1, b=2   → ambos visibles
          //   a=1, b=2;  → a visible, b oculto
          // El último stmt usa el separador que tenía (o `false` si la línea no terminaba en `;`).
          const subStmts: { text: string; hadSemi: boolean }[] = [];
          { let depth = 0, inStr = false, cur = '';
            for (const ch of trimmed) {
              if (ch === '"' || ch === "'") inStr = !inStr;
              if (!inStr) { if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; }
              if ((ch === ';' || ch === ',') && depth === 0 && !inStr) {
                if (cur.trim()) subStmts.push({ text: cur.trim(), hadSemi: ch === ';' });
                cur = '';
              } else cur += ch;
            }
            if (cur.trim()) subStmts.push({ text: cur.trim(), hadSemi: false });
          }
          for (const sub of subStmts) {
            // Re-añadimos el `;` virtual antes de prepExpr para que la lógica
            // existente de `endsWith(';')` siga funcionando.
            const sourceForPrep = sub.hadSemi ? sub.text + ';' : sub.text;
            const { expr, suppress } = prepExpr(sourceForPrep);
            if (!expr) continue;
            evalOneLine(sub.text, stmt.startLine, suppress, expr);
          }

        } else if (stmt.kind === 'for') {
          // for i = start:end or for i = start:step:end or for i = [array]
          // Only show the for header as a comment (no iteration output — MATLAB behavior)
          if (!insideLoop) {
            results.push({ line: stmt.startLine + 1, input: `for ${stmt.varName} = ${stmt.range}`, type: 'comment', formatted: `for ${stmt.varName}` });
          }
          try {
            // ── FAST PATH: JIT del loop completo ──
            // Si todo el body es transpilable, ejecutamos UNA fn JS nativa con
            // for(let i=...) { ... } — V8 lo optimiza al máximo. ~10-30× más
            // rápido que iterar via execStmts/compiledEval por iteración.
            if (!insideLoop) {
              const jitFn = tryJitForLoop(stmt);
              if (jitFn) {
                const scope = (parser as any).scope;
                if (scope) {
                  jitFn(scope, math);
                  // Marcar variables modificadas como conocidas
                  knownVars.add(stmt.varName);
                  // Otras vars que se asignaron también deben estar en knownVars,
                  // pero como el JIT no sabe cuáles, las añadimos via reflection del scope.
                  // (No es crítico — knownVars se usa solo para reemplazo M(i,j)→_idx).
                  continue; // skip el for-loop interpretado
                }
              }
            }

            // Fallback: interpreted loop
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
            forTop: for (const v of values) {
              if (++iter > MAX_ITER) { results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: 'Max iterations exceeded' }); break; }
              parser.set(stmt.varName, v);
              knownVars.add(stmt.varName);
              try { execStmts(stmt.body); }
              catch (sig) {
                if (sig === __ContinueSignal) continue forTop;
                if (sig === __BreakSignal)    break  forTop;
                throw sig;
              }
            }
            insideLoop--;
          } catch (e: any) {
            insideLoop = Math.max(0, insideLoop - 1);
            if (e === __ReturnSignal) throw e;
            results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: `for: ${e?.message ?? e}` });
          }

        } else if (stmt.kind === 'while') {
          if (!insideLoop) {
            results.push({ line: stmt.startLine + 1, input: `while ${stmt.cond}`, type: 'comment', formatted: `while ...` });
          }
          let iter = 0;
          try {
            insideLoop++;
            whileTop: while (true) {
              if (++iter > MAX_ITER) { results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: 'Max iterations exceeded' }); break; }
              const { expr: condExpr } = prepExpr(stmt.cond);
              const condVal = parser.evaluate(condExpr);
              if (!condVal) break;
              try { execStmts(stmt.body); }
              catch (sig) {
                if (sig === __ContinueSignal) continue whileTop;
                if (sig === __BreakSignal)    break  whileTop;
                throw sig;
              }
            }
            insideLoop--;
          } catch (e: any) {
            insideLoop = Math.max(0, insideLoop - 1);
            if (e === __ReturnSignal) throw e;
            results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: `while: ${e?.message ?? e}` });
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
              // Señales de control flow se propagan
              if (e === __ContinueSignal || e === __BreakSignal || e === __ReturnSignal) throw e;
              results.push({ line: stmt.startLine + 1, input: '', type: 'error', error: `if: ${e?.message ?? e}` });
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

    try { execStmts(ast); }
    catch (sig) {
      // `return` a nivel top-level termina el script; otras señales se ignoran.
      if (sig !== __ReturnSignal && sig !== __BreakSignal && sig !== __ContinueSignal) {
        throw sig;
      }
    }
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

  function setMode(m: EngineMode) {
    mode = m;
    // En modo MATLAB el JIT statement-level se desactiva para evitar el bug
    // conocido con scope reads dentro de for-loops con _idx (caso FEM).
    // El JIT for-loop completo sigue activo para loops escalares simples.
    // En modo Hekatan Lab el JIT statement queda activado (más rápido).
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__hekatanDisableJit = (m === 'matlab');
    }
  }
  function getMode(): EngineMode { return mode; }

  return { evaluate, reset, getScope, loadFunctions, addFunction: addFunction, removeFunction, setMode, getMode };
}
