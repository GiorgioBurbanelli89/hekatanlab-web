import * as math from 'mathjs';

export interface EvalResult {
  line: number;
  input: string;
  type: 'comment' | 'blank' | 'assign' | 'expr' | 'error' | 'separator' | 'heading';
  varName?: string;
  value?: any;
  formatted?: string;
  error?: string;
}

export function createEngine() {
  let scope: Record<string, any> = {};
  let parser = math.parser();

  // Import symbolic functions (nerdamer)
  function loadNerdamer() {
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
        parser.set(name, fn);
      }
    } catch (e) {
      console.warn('nerdamer not available:', e);
    }
  }

  function evaluate(code: string): EvalResult[] {
    const lines = code.split('\n');
    const results: EvalResult[] = [];

    // Reset parser for fresh evaluation
    parser = math.parser();
    loadNerdamer();

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      // Blank line
      if (trimmed === '') {
        results.push({ line: i + 1, input: raw, type: 'blank' });
        continue;
      }

      // Comment
      if (trimmed.startsWith('%')) {
        // Check for heading-style comments
        if (trimmed.startsWith('% ═') || trimmed.startsWith('% ───') || trimmed.startsWith('% ---')) {
          results.push({ line: i + 1, input: raw, type: 'separator' });
        } else if (trimmed.startsWith('% ') && trimmed.length > 3 && !trimmed.startsWith('% %')) {
          results.push({ line: i + 1, input: raw, type: 'comment', formatted: trimmed.substring(2) });
        } else {
          results.push({ line: i + 1, input: raw, type: 'comment', formatted: trimmed.substring(1).trim() });
        }
        continue;
      }

      // Normalize MATLAB → math.js
      let expr = trimmed;
      // Remove trailing semicolon (suppress output in MATLAB style)
      const suppress = expr.endsWith(';');
      if (suppress) expr = expr.slice(0, -1).trim();

      // Matrix notation: commas separate rows in MATLAB
      // [1, 2; 3, 4] is already math.js compatible

      try {
        const result = parser.evaluate(expr);

        // Determine if it's an assignment
        const assignMatch = expr.match(/^([a-zA-Z_]\w*)\s*=/);
        if (assignMatch) {
          results.push({
            line: i + 1,
            input: raw,
            type: 'assign',
            varName: assignMatch[1],
            value: result,
            formatted: suppress ? undefined : formatValue(result),
          });
        } else {
          results.push({
            line: i + 1,
            input: raw,
            type: 'expr',
            value: result,
            formatted: suppress ? undefined : formatValue(result),
          });
        }
      } catch (e: any) {
        results.push({
          line: i + 1,
          input: raw,
          type: 'error',
          error: e.message,
        });
      }
    }

    return results;
  }

  function formatValue(val: any): string {
    if (val === undefined || val === null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return val.toString();
      if (Math.abs(val) < 1e-10) return '0';
      if (Math.abs(val) > 1e6 || Math.abs(val) < 1e-4) return val.toExponential(4);
      return val.toPrecision(6).replace(/\.?0+$/, '');
    }
    if (typeof val === 'boolean') return val ? 'true' : 'false';

    // Matrix
    try {
      const size = math.size(val);
      if (size && (size as any).length >= 2) {
        return math.format(val, { precision: 6 });
      }
    } catch {}

    // Array
    if (Array.isArray(val)) {
      return '[' + val.map(v => formatValue(v)).join(', ') + ']';
    }

    try {
      return math.format(val, { precision: 6 });
    } catch {
      return String(val);
    }
  }

  function reset() {
    scope = {};
    parser = math.parser();
  }

  return { evaluate, reset };
}
