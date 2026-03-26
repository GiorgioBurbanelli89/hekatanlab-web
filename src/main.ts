import './styles.css';
import { createEngine, loadFunctions, addFunction, removeFunction } from './engine';
import { renderOutput } from './renderer';
import { TEMPLATES } from './templates';

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
  <button id="btn-funcs">📚</button>
  <button id="btn-theme">☀</button>
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

// Autorun
let timer: number | null = null;
editor.addEventListener('input', () => {
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(run, 400);
});

function run() {
  const code = editor.value;
  const t0 = performance.now();
  const results = engine.evaluate(code);
  const dt = (performance.now() - t0).toFixed(0);
  renderOutput(output, results);
  (document.getElementById('status-lines')!).textContent = `${code.split('\n').length} líneas`;
  (document.getElementById('status-time')!).textContent = `${dt}ms`;
  (document.getElementById('status-vars')!).textContent = `${results.filter(r => r.type === 'assign').length} vars`;
}

document.getElementById('btn-run')!.addEventListener('click', run);
document.getElementById('btn-clear')!.addEventListener('click', () => { editor.value = ''; output.innerHTML = ''; engine.reset(); });

// Templates
document.getElementById('template-select')!.addEventListener('change', (e) => {
  const t = TEMPLATES.find(x => x.name === (e.target as HTMLSelectElement).value);
  if (t) { editor.value = t.code; run(); }
  (e.target as HTMLSelectElement).value = '';
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
