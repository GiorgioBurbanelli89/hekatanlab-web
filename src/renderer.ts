import katex from 'katex';
import * as math from 'mathjs';
import type { EvalResult } from './engine';

export function renderOutput(container: HTMLElement, results: EvalResult[]) {
  container.innerHTML = '';

  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'out-line';

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

      case 'assign': {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'out-assign';
        nameSpan.textContent = `${r.varName} = `;
        div.appendChild(nameSpan);

        if (r.formatted !== undefined) {
          // Try KaTeX for matrices
          const katexStr = valueToKatex(r.varName!, r.value);
          if (katexStr) {
            const mathDiv = document.createElement('div');
            mathDiv.style.margin = '4px 0';
            try {
              katex.render(katexStr, mathDiv, { throwOnError: false, displayMode: true });
              div.innerHTML = '';
              div.appendChild(mathDiv);
            } catch {
              const valSpan = document.createElement('span');
              valSpan.className = 'out-result';
              valSpan.textContent = r.formatted;
              div.appendChild(valSpan);
            }
          } else {
            const valSpan = document.createElement('span');
            valSpan.className = 'out-result';
            valSpan.textContent = r.formatted;
            div.appendChild(valSpan);
          }
        }
        break;
      }

      case 'expr': {
        if (r.formatted) {
          const valSpan = document.createElement('span');
          valSpan.className = 'out-result';
          valSpan.textContent = r.formatted;
          div.appendChild(valSpan);
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
}

function valueToKatex(name: string, val: any): string | null {
  if (val === undefined || val === null) return null;

  // Scalar
  if (typeof val === 'number') {
    const formatted = formatNum(val);
    return `${escName(name)} = ${formatted}`;
  }

  // String (symbolic result)
  if (typeof val === 'string') {
    return `${escName(name)} = ${val.replace(/\*/g, '\\cdot ')}`;
  }

  // Matrix
  try {
    const size = math.size(val) as number[];
    if (size.length === 2) {
      const rows = size[0], cols = size[1];
      if (rows > 12 || cols > 12) return null; // too big for KaTeX
      const arr = math.matrix(val).toArray() as number[][];
      let tex = `${escName(name)}_{${rows}\\times${cols}} = \\begin{bmatrix}`;
      for (let i = 0; i < Math.min(rows, 8); i++) {
        const rowVals = arr[i].slice(0, Math.min(cols, 8)).map(v => formatNum(v));
        if (cols > 8) rowVals.push('\\cdots');
        tex += rowVals.join(' & ');
        if (i < Math.min(rows, 8) - 1) tex += ' \\\\ ';
      }
      if (rows > 8) tex += ' \\\\ \\vdots';
      tex += '\\end{bmatrix}';
      return tex;
    }
    if (size.length === 1) {
      const arr = (val as any).toArray ? (val as any).toArray() : val;
      if (Array.isArray(arr) && arr.length <= 12) {
        const vals = arr.map((v: any) => formatNum(v));
        return `${escName(name)}_{${arr.length}\\times 1} = \\begin{bmatrix}${vals.join(' \\\\ ')}\\end{bmatrix}`;
      }
    }
  } catch {}

  return null;
}

function escName(name: string): string {
  // Convert underscores to subscripts
  const parts = name.split('_');
  if (parts.length === 1) return name;
  return `${parts[0]}_{${parts.slice(1).join('\\_')}}`;
}

function formatNum(val: any): string {
  if (typeof val !== 'number') return String(val);
  if (Number.isInteger(val) && Math.abs(val) < 1e8) return val.toString();
  if (Math.abs(val) < 1e-10) return '0';
  if (Math.abs(val) >= 1e5) {
    const exp = Math.floor(Math.log10(Math.abs(val)));
    const mantissa = (val / Math.pow(10, exp)).toFixed(4);
    return `${mantissa} \\times 10^{${exp}}`;
  }
  if (Math.abs(val) < 1e-3) {
    const exp = Math.floor(Math.log10(Math.abs(val)));
    const mantissa = (val / Math.pow(10, exp)).toFixed(4);
    return `${mantissa} \\times 10^{${exp}}`;
  }
  return parseFloat(val.toPrecision(6)).toString();
}
