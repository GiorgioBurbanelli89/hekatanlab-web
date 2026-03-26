import katex from 'katex';
import * as math from 'mathjs';
import type { EvalResult } from './engine';
import { renderPlot } from './plotter';
import { ViewCommand, renderStructure } from './viewer3d';

export function renderOutput(container: HTMLElement, results: EvalResult[], editor?: HTMLTextAreaElement) {
  container.innerHTML = '';

  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'out-line';
    // data-line for output→code navigation
    if (r.line) div.setAttribute('data-line', String(r.line));

    switch (r.type) {
      case 'blank':
        div.innerHTML = '&nbsp;';
        break;

      case 'separator':
        div.className = 'out-separator';
        break;

      case 'comment':
        div.className = 'out-line out-comment';
        div.textContent = r.formatted || '';
        break;

      case 'funcdef':
        div.className = 'out-line out-comment';
        div.style.color = 'var(--accent2)';
        div.textContent = r.formatted || '';
        break;

      case 'assign': {
        if (r.formatted === undefined) break; // suppressed with ;

        // Try KaTeX rendering
        const katexStr = valueToKatex(r.varName!, r.value);
        if (katexStr) {
          const mathDiv = document.createElement('div');
          mathDiv.style.margin = '4px 0';
          try {
            katex.render(katexStr, mathDiv, { throwOnError: false, displayMode: true });
            div.appendChild(mathDiv);
          } catch {
            div.innerHTML = `<span class="out-assign">${r.varName} = </span><span class="out-result">${toMatlabStr(r.value)}</span>`;
          }
        } else {
          div.innerHTML = `<span class="out-assign">${r.varName} = </span><span class="out-result">${toMatlabStr(r.value)}</span>`;
        }
        break;
      }

      case 'expr':
        if (r.formatted) {
          div.innerHTML = `<span class="out-result">${toMatlabStr(r.value)}</span>`;
        }
        break;

      case 'plot': {
        try {
          if (r.value instanceof ViewCommand) {
            const viewer = renderStructure(r.value.data);
            div.appendChild(viewer);
          } else {
            const plotEl = renderPlot(r.value);
            div.appendChild(plotEl);
          }
        } catch (e: any) {
          div.className = 'out-line out-error';
          div.textContent = `Plot error: ${e.message}`;
        }
        break;
      }

      case 'error':
        div.className = 'out-line out-error';
        div.textContent = `Error: ${r.error}`;
        break;
    }

    container.appendChild(div);
  }

  // Click handler: output → code navigation
  if (editor) {
    container.onclick = (e) => {
      const target = (e.target as HTMLElement).closest('[data-line]') as HTMLElement | null;
      if (!target) return;
      const lineNum = parseInt(target.getAttribute('data-line') || '0');
      if (!lineNum) return;

      // Scroll editor to that line and highlight
      const lines = editor.value.split('\n');
      let pos = 0;
      for (let i = 0; i < lineNum - 1 && i < lines.length; i++) {
        pos += lines[i].length + 1;
      }
      const endPos = pos + (lines[lineNum - 1]?.length || 0);
      editor.focus();
      editor.setSelectionRange(pos, endPos);

      // Scroll into view
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 18;
      editor.scrollTop = (lineNum - 3) * lineHeight;

      // Flash highlight on the output element
      target.classList.add('line-highlight-flash');
      setTimeout(() => target.classList.remove('line-highlight-flash'), 600);
    };
  }
}

// ── Format value as MATLAB string (not [[],[]]) ──
function toMatlabStr(val: any): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'function') return '[function]';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') {
    if (Number.isInteger(val) && Math.abs(val) < 1e9) return val.toString();
    if (Math.abs(val) < 1e-10) return '0';
    if (Math.abs(val) > 1e6 || Math.abs(val) < 1e-4) return val.toExponential(4);
    return parseFloat(val.toPrecision(6)).toString();
  }

  // Matrix → MATLAB format [row1; row2; row3]
  try {
    const arr = toArray2D(val);
    if (arr) {
      const rows = arr.map(row => row.map(v => fmtNum(v)).join(', '));
      return '[' + rows.join('; ') + ']';
    }
  } catch {}

  // Array
  if (Array.isArray(val)) {
    return '[' + val.map(v => typeof v === 'number' ? fmtNum(v) : toMatlabStr(v)).join(', ') + ']';
  }

  // Object (eigs result etc)
  if (typeof val === 'object' && val !== null) {
    if (val.values) return `eigenvalues: [${Array.from(val.values).map((v: any) => fmtNum(v)).join(', ')}]`;
    try { return math.format(val, { precision: 6 }); } catch {}
  }

  return String(val);
}

function fmtNum(v: any): string {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v) && Math.abs(v) < 1e8) return v.toString();
  if (Math.abs(v) < 1e-10) return '0';
  if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3) return v.toExponential(4);
  return parseFloat(v.toPrecision(6)).toString();
}

// ── Convert math.js value to 2D array ──
function toArray2D(val: any): number[][] | null {
  try {
    // math.js Matrix → toArray()
    if (val && typeof val.toArray === 'function') {
      const arr = val.toArray();
      if (Array.isArray(arr) && arr.length > 0) {
        if (Array.isArray(arr[0])) return arr as number[][];
        return arr.map((v: any) => [v]) as number[][];
      }
    }
    // Plain JS array
    if (Array.isArray(val) && val.length > 0) {
      if (Array.isArray(val[0])) return val as number[][];
      return val.map((v: any) => [v]) as number[][];
    }
    // math.js DenseMatrix/SparseMatrix — try valueOf() or _data
    if (val && val._data) {
      const data = val._data;
      if (Array.isArray(data) && data.length > 0) {
        if (Array.isArray(data[0])) return data as number[][];
        return data.map((v: any) => [v]) as number[][];
      }
    }
    // Last resort: use math.js to get size and extract
    if (val && typeof val === 'object') {
      try {
        const size = math.size(val);
        const s = (size as any).valueOf ? (size as any).valueOf() : size;
        if (Array.isArray(s) && s.length >= 1) {
          const arr = (typeof val.valueOf === 'function') ? val.valueOf() : val;
          if (Array.isArray(arr)) {
            if (s.length === 1) return arr.map((v: any) => [typeof v === 'number' ? v : Number(v)]);
            if (s.length === 2 && Array.isArray(arr[0])) return arr;
          }
        }
      } catch {}
    }
  } catch {}
  return null;
}

// ── KaTeX rendering ──
function valueToKatex(name: string, val: any): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'function') return null;

  // Scalar
  if (typeof val === 'number') {
    return `${escName(name)} = ${formatKNum(val)}`;
  }

  // String (symbolic)
  if (typeof val === 'string') {
    // Clean up symbolic output for KaTeX
    let tex = val.replace(/\*/g, ' \\cdot ').replace(/\^(\d+)/g, '^{$1}');
    return `${escName(name)} = ${tex}`;
  }

  // Matrix / Vector
  const arr = toArray2D(val);
  if (arr) {
    const rows = arr.length, cols = arr[0].length;

    // Large arrays → compact summary
    if (rows > 12 || cols > 12) {
      return `${escNameWithSize(name, rows, cols)} = [${rows}\\times${cols} \\text{ matrix}]`;
    }

    let tex = escNameWithSize(name, rows, cols);
    tex += ` = \\begin{bmatrix}`;

    for (let i = 0; i < Math.min(rows, 8); i++) {
      const rowVals = arr[i].slice(0, Math.min(cols, 8)).map(v => formatKNum(v));
      if (cols > 8) rowVals.push('\\cdots');
      tex += rowVals.join(' & ');
      if (i < Math.min(rows, 8) - 1) tex += ' \\\\ ';
    }
    if (rows > 8) tex += ' \\\\ \\vdots';
    tex += '\\end{bmatrix}';
    return tex;
  }

  // 1D array (not matrix) — compact for large
  if (Array.isArray(val) || (val && typeof val.toArray === 'function')) {
    let flat: number[];
    try {
      flat = Array.isArray(val) ? val.flat(Infinity) : val.toArray().flat(Infinity);
    } catch { return null; }
    if (flat.length > 12) {
      return `${escName(name)} = [1\\times${flat.length} \\text{ vector}]`;
    }
  }

  // Object with values (eigs)
  if (typeof val === 'object' && val.values) {
    try {
      const vals = Array.from(val.values).map((v: any) => formatKNum(v));
      return `\\lambda = \\begin{bmatrix}${vals.join(' \\\\ ')}\\end{bmatrix}`;
    } catch {}
  }

  return null;
}

function escName(name: string): string {
  const parts = name.split('_');
  if (parts.length === 1) return name.length > 1 ? `\\text{${name}}` : name;
  return `${parts[0]}_{\\text{${parts.slice(1).join('\\_')}}}`;
}

function escNameWithSize(name: string, rows: number, cols: number): string {
  const parts = name.split('_');
  const dimStr = (rows > 1 || cols > 1) ? `${rows}\\times${cols}` : '';
  if (parts.length === 1) {
    const base = name.length > 1 ? `\\text{${name}}` : name;
    return dimStr ? `${base}_{${dimStr}}` : base;
  }
  // Combine subscript text + dimensions in one subscript
  const sub = parts.slice(1).join('\\_');
  if (dimStr) {
    return `${parts[0]}_{\\text{${sub}},\\,${dimStr}}`;
  }
  return `${parts[0]}_{\\text{${sub}}}`;
}

function formatKNum(val: any): string {
  if (typeof val !== 'number') return String(val);
  if (Number.isInteger(val) && Math.abs(val) < 1e8) return val.toString();
  if (Math.abs(val) < 1e-10) return '0';
  if (Math.abs(val) >= 1e5) {
    const exp = Math.floor(Math.log10(Math.abs(val)));
    const man = (val / Math.pow(10, exp)).toFixed(4);
    return `${man} \\times 10^{${exp}}`;
  }
  if (Math.abs(val) < 1e-3) {
    const exp = Math.floor(Math.log10(Math.abs(val)));
    const man = (val / Math.pow(10, exp)).toFixed(4);
    return `${man} \\times 10^{${exp}}`;
  }
  return parseFloat(val.toPrecision(6)).toString();
}
