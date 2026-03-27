import './styles.css';
import { createEngine, loadFunctions, addFunction, removeFunction } from './engine';
import { renderOutput } from './renderer';
import { TEMPLATES } from './templates';
import { parseS2k, s2kToMatlab } from './s2kParser';
import { parseE2k, e2kToMatlab } from './e2kParser';
import { exportS2k, type S2kExportData } from './s2kExporter';
import { exportE2k, type E2kExportData } from './e2kExporter';

// ── Build UI ──
const categories = [...new Set(TEMPLATES.map(t => t.category))];
const templateOptions = categories.map(cat => {
  const items = TEMPLATES.filter(t => t.category === cat);
  return `<optgroup label="${cat}">${items.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}</optgroup>`;
}).join('');

document.body.innerHTML = `
<div id="header">
  <span class="logo">HékatanLab</span>
  <span class="subtitle">MATLAB Web</span>
  <div class="spacer"></div>
  <button class="primary" id="btn-run">▶ Ejecutar</button>
  <button id="btn-clear">Limpiar</button>
  <select id="template-select">
    <option value="">📂 Ejemplos</option>
    ${templateOptions}
  </select>
  <button id="btn-import" title="Importar S2K/E2K">📁 Import</button>
  <button id="btn-export" title="Exportar S2K/E2K">💾 Export</button>
  <button id="btn-funcs">📚</button>
  <button id="btn-autorun" class="active" title="Autorun ON/OFF">⚡</button>
  <button id="btn-theme" title="Claro/Oscuro">☀</button>
  <button id="btn-help">?</button>
</div>
<div id="main">
  <div id="editor-panel">
    <div id="editor-header">EDITOR — MATLAB/Octave (autorun)</div>
    <textarea id="editor" spellcheck="false" placeholder="% Escribe código MATLAB aquí
a = 3
A = [1, 2; 3, 4]
x = inv(A) * [5; 6]"></textarea>
  </div>
  <div id="output-panel">
    <div id="output-header">OUTPUT</div>
    <div id="output"></div>
  </div>
</div>
<div id="status">
  <span id="status-lines">0</span>
  <span id="status-time">0ms</span>
  <span id="status-vars">0 vars</span>
  <span>HékatanLab Web v1.0</span>
</div>
`;

const editor = document.getElementById('editor') as HTMLTextAreaElement;
const output = document.getElementById('output') as HTMLDivElement;
const engine = createEngine();

// Tab key
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart;
    editor.value = editor.value.substring(0, s) + '  ' + editor.value.substring(editor.selectionEnd);
    editor.selectionStart = editor.selectionEnd = s + 2;
  }
});

// Autorun (toggleable)
let autorunEnabled = true;
let timer: number | null = null;
editor.addEventListener('input', () => {
  if (!autorunEnabled) return;
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(run, 400);
});

document.getElementById('btn-autorun')!.addEventListener('click', () => {
  autorunEnabled = !autorunEnabled;
  const btn = document.getElementById('btn-autorun')!;
  btn.classList.toggle('active', autorunEnabled);
  btn.title = autorunEnabled ? 'Autorun ON' : 'Autorun OFF';
});

function run() {
  const code = editor.value;
  const t0 = performance.now();
  const results = engine.evaluate(code);
  const dt = (performance.now() - t0).toFixed(0);
  renderOutput(output, results, editor);
  (document.getElementById('status-lines')!).textContent = `${code.split('\n').length} líneas`;
  (document.getElementById('status-time')!).textContent = `${dt}ms`;
  (document.getElementById('status-vars')!).textContent = `${results.filter(r => r.type === 'assign').length} vars`;
}

document.getElementById('btn-run')!.addEventListener('click', run);
document.getElementById('btn-clear')!.addEventListener('click', () => { editor.value = ''; output.innerHTML = ''; engine.reset(); });

// Templates
document.getElementById('template-select')!.addEventListener('change', (e) => {
  const sel = e.target as HTMLSelectElement;
  const t = TEMPLATES.find(x => x.name === sel.value);
  if (t) { editor.value = t.code; run(); }
  // Keep showing selected template name (don't reset to "Ejemplos")
});

// Theme
let dark = true;
document.getElementById('btn-theme')!.addEventListener('click', () => {
  dark = !dark;
  document.body.classList.toggle('light', !dark);
  (document.getElementById('btn-theme')!).textContent = dark ? '☀' : '🌙';
});

// Functions panel
document.getElementById('btn-funcs')!.addEventListener('click', () => {
  document.getElementById('funcs-panel')?.remove();
  const fns = loadFunctions();
  const p = document.createElement('div');
  p.id = 'funcs-panel';
  p.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-panel);border:2px solid var(--accent);border-radius:12px;padding:20px;z-index:10000;color:var(--text);font-family:monospace;font-size:12px;min-width:350px;max-height:70vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.6);';
  let h = '<h3 style="color:var(--accent);margin:0 0 10px">📚 Funciones Guardadas</h3>';
  if (!fns.length) h += '<p style="color:var(--text-dim)">Ninguna. Define con:<br><code>function K = nombre(x)<br>  ...<br>end</code></p>';
  for (const f of fns) h += `<div style="border:1px solid var(--border);border-radius:4px;padding:6px;margin:4px 0"><b style="color:var(--accent2)">${f.name}(${f.params.join(',')})</b> <button data-d="${f.name}" style="float:right;background:var(--error);color:#fff;border:none;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:9px">🗑</button><pre style="color:var(--text-dim);font-size:9px;margin:2px 0 0;max-height:40px;overflow:hidden">${f.body}</pre></div>`;
  h += '<div style="display:flex;gap:6px;margin-top:10px"><button id="fn-s" style="flex:1;padding:5px;background:#0a4a2a;color:var(--accent2);border:1px solid var(--accent2);border-radius:4px;cursor:pointer">💾 Guardar del editor</button><button id="fn-c" style="padding:5px 10px;background:var(--bg);color:var(--text-dim);border:1px solid var(--border);border-radius:4px;cursor:pointer">✕</button></div>';
  p.innerHTML = h;
  document.body.appendChild(p);
  p.querySelectorAll<HTMLButtonElement>('button[data-d]').forEach(b => b.addEventListener('click', () => { removeFunction(b.dataset.d!); p.remove(); document.getElementById('btn-funcs')!.click(); }));
  document.getElementById('fn-s')!.addEventListener('click', () => {
    const rx = /function\s+(?:\[?(\w+)\]?\s*=\s*)?(\w+)\s*\(([^)]*)\)([\s\S]*?)(?:end|endfunction)/g;
    let m, c = 0;
    while ((m = rx.exec(editor.value)) !== null) { addFunction({ name: m[2], params: m[3].split(',').map(s=>s.trim()).filter(Boolean), body: m[4].trim() }); c++; }
    alert(c ? `${c} función(es) guardada(s)` : 'No se encontraron funciones');
    p.remove();
  });
  document.getElementById('fn-c')!.addEventListener('click', () => p.remove());
});

// ── Import S2K/E2K ──
document.getElementById('btn-import')!.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.s2k,.S2K,.$2k,.$2K,.e2k,.E2K';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const ext = file.name.toLowerCase();
      let matlab = '';
      try {
        if (ext.endsWith('.e2k')) {
          const parsed = parseE2k(text);
          matlab = e2kToMatlab(parsed);
        } else {
          const parsed = parseS2k(text);
          matlab = s2kToMatlab(parsed);
        }
        editor.value = matlab;
        run();
      } catch (err: any) {
        alert(`Error importando ${file.name}: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

// ── Export S2K/E2K ──
document.getElementById('btn-export')!.addEventListener('click', () => {
  document.getElementById('export-panel')?.remove();
  const p = document.createElement('div');
  p.id = 'export-panel';
  p.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-panel);border:2px solid var(--accent);border-radius:12px;padding:20px;z-index:10000;color:var(--text);font-family:monospace;font-size:13px;min-width:280px;box-shadow:0 8px 32px rgba(0,0,0,0.6);';
  p.innerHTML = `
    <h3 style="color:var(--accent);margin:0 0 12px">💾 Exportar modelo</h3>
    <p style="color:var(--text-dim);font-size:11px;margin:0 0 12px">Exporta las variables <b>nodes</b>, <b>frames/elem</b>, <b>supports</b>, <b>loads</b> del editor actual.</p>
    <div style="display:flex;gap:8px;flex-direction:column">
      <button id="exp-s2k" style="padding:8px;background:#1a3a5c;color:#66ccff;border:1px solid #66ccff;border-radius:4px;cursor:pointer;font-size:13px">📄 Exportar .s2k (SAP2000)</button>
      <button id="exp-e2k" style="padding:8px;background:#1a4a2a;color:#66ff99;border:1px solid #66ff99;border-radius:4px;cursor:pointer;font-size:13px">📄 Exportar .e2k (ETABS)</button>
      <button id="exp-close" style="padding:6px;background:var(--bg);color:var(--text-dim);border:1px solid var(--border);border-radius:4px;cursor:pointer">✕ Cerrar</button>
    </div>`;
  document.body.appendChild(p);

  const extractData = (): { nodes: number[][]; elements: number[][]; frameProps: number[][]; supports: number[][]; loads: number[][] } | null => {
    // Run engine to get current scope
    engine.evaluate(editor.value);
    const scope = engine.getScope();
    // Try to extract arrays from scope
    const toArr = (v: any): number[][] => {
      if (!v) return [];
      try {
        const a = (v.toArray ? v.toArray() : v) as any[];
        if (!Array.isArray(a)) return [];
        return a.map((row: any) => Array.isArray(row) ? row.map(Number) : [Number(row)]);
      } catch { return []; }
    };
    const nodes = toArr(scope.nodes);
    if (nodes.length === 0) { alert('No se encontró variable "nodes" en el editor'); return null; }
    const frames = toArr(scope.frames || scope.elem || scope.elements);
    const props = toArr(scope.frame_props || scope.props);
    const sups = toArr(scope.supports);
    const lds = toArr(scope.loads);
    return { nodes, elements: frames, frameProps: props, supports: sups, loads: lds };
  };

  const download = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById('exp-s2k')!.addEventListener('click', () => {
    const data = extractData();
    if (!data) return;
    try {
      const s2kData: S2kExportData = {
        nodes: data.nodes,
        frames: data.elements,
        frameProps: data.frameProps.length > 0 ? data.frameProps : undefined,
        supports: data.supports.length > 0 ? data.supports : undefined,
        loads: data.loads.length > 0 ? data.loads : undefined,
        title: 'HékatanLab Model',
      };
      const text = exportS2k(s2kData);
      download(text, 'model.s2k');
      p.remove();
    } catch (err: any) { alert(`Error exportando: ${err.message}`); }
  });

  document.getElementById('exp-e2k')!.addEventListener('click', () => {
    const data = extractData();
    if (!data) return;
    try {
      const e2kData: E2kExportData = {
        nodes: data.nodes,
        elements: data.elements,
        props: data.frameProps.length > 0 ? data.frameProps : undefined,
        supports: data.supports.length > 0 ? data.supports : undefined,
        loads: data.loads.length > 0 ? data.loads : undefined,
        title: 'HékatanLab Model',
      };
      const text = exportE2k(e2kData);
      download(text, 'model.e2k');
      p.remove();
    } catch (err: any) { alert(`Error exportando: ${err.message}`); }
  });

  document.getElementById('exp-close')!.addEventListener('click', () => p.remove());
});

// Help
document.getElementById('btn-help')!.addEventListener('click', () => {
  editor.value = `% HékatanLab Web — Ayuda
%
% AUTORUN: se ejecuta al escribir (400ms)
% Tab = indentar
%
% VARIABLES: x = 3.14
% MATRICES: A = [1, 2; 3, 4]
% VECTORES: b = [5; 6]
%
% FUNCIONES: sin cos tan sqrt abs exp log
%   inv det transpose trace eigs norm
%   zeros ones identity diag size mean sum
%
% FUNCIONES PROPIAS:
%   function K = nombre(E, A, L)
%     K = (E*A/L) * [1, -1; -1, 1]
%   end
%   K1 = nombre(210000, 0.01, 2)
%   📚 → 💾 Guardar para usar siempre
%
% SIMBÓLICO:
%   sdiff('x^3', 'x')  sint('x^2', 'x')
%   sdefint('x^2','x',0,1)  ssolve('x^2-4','x')
%   sexpand('(x+1)^2')  sfactor('x^2-4')`;
  run();
});

// Default
const def = TEMPLATES.find(t => t.name === 'Operaciones básicas');
if (def) { editor.value = def.code; run(); }
