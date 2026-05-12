import './styles.css';
// KaTeX CSS bundleado localmente — antes se cargaba desde cdn.jsdelivr.net
// pero el Tracking Prevention de los navegadores bloqueaba el storage del CDN.
import 'katex/dist/katex.min.css';
import { createEngine, loadFunctions, addFunction, removeFunction } from './engine';
import { renderOutput } from './renderer';
import { TEMPLATES } from './templates';
import { parseS2k, s2kToMatlab } from './s2kParser';
import { parseE2k, e2kToMatlab } from './e2kParser';
import { exportS2k, type S2kExportData } from './s2kExporter';
import { exportE2k, type E2kExportData } from './e2kExporter';
import { femMatlabLibrary } from './fem-matlab';
import { initTriangle } from './wasm/triangleMesh';

// Pre-load Triangle WASM in background
initTriangle().catch(e => console.warn('Triangle WASM load failed:', e));

// ── Build UI ──
// Filtrar templates por modo activo.
// Default: un template SIN `mode` se considera del modo Hékatan Lab (LaTeX, autorun).
// Para que aparezca en ambos modos hay que poner `mode: 'both'` explícitamente.
// Los nuevos ejemplos `MATLAB Clásico` llevan `mode: 'matlab'`.
function templatesForMode(m: 'hekatan-lab' | 'matlab') {
  return TEMPLATES.filter(t => {
    const mode = t.mode ?? 'hekatan-lab';
    return mode === 'both' || mode === m;
  });
}
function buildTemplateOptions(m: 'hekatan-lab' | 'matlab'): string {
  const visible = templatesForMode(m);
  const cats = [...new Set(visible.map(t => t.category))];
  return cats.map(cat => {
    const items = visible.filter(t => t.category === cat);
    return `<optgroup label="${cat}">${items.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}</optgroup>`;
  }).join('');
}
// Modo persistido (mismo key que aplicaremos abajo en applyMode)
const initialMode: 'hekatan-lab' | 'matlab' =
  ((localStorage.getItem('hekatanlab-mode') as any) === 'matlab') ? 'matlab' : 'hekatan-lab';
const templateOptions = buildTemplateOptions(initialMode);

document.body.innerHTML = `
<div id="header">
  <span class="logo">HékatanLab</span>
  <span class="subtitle">MATLAB Web</span>
  <div class="spacer"></div>
  <button class="primary" id="btn-run">▶ Ejecutar</button>
  <button id="btn-clear">Limpiar</button>
  <div id="mode-switch" class="mode-switch" title="Cambiar modo de ejecución">
    <button id="mode-hekatan" class="mode-btn active" data-mode="hekatan-lab" title="Modo permisivo: autorun, asignaciones se muestran con LaTeX automáticamente">🧪 Hékatan Lab</button>
    <button id="mode-matlab" class="mode-btn" data-mode="matlab" title="Modo estricto MATLAB: solo disp/fprintf/printf muestran salida; sin autorun">📐 MATLAB</button>
  </div>
  <select id="template-select">
    <option value="">📂 Ejemplos</option>
    ${templateOptions}
  </select>
  <select id="cpd-select" title="Cargar ejemplos de Calcpad-Symbolic">
    <option value="">📚 Calcpad (390+)</option>
  </select>
  <button id="btn-import" title="Importar S2K/E2K">📁 Import</button>
  <button id="btn-export" title="Exportar S2K/E2K">💾 Export</button>
  <button id="btn-funcs" title="Ver funciones FEM">📚 Funciones</button>
  <button id="btn-autorun" class="active" title="Autorun ON/OFF">⚡</button>
  <button id="btn-theme" title="Claro/Oscuro">☀</button>
  <button id="btn-help">?</button>
</div>
<div id="main">
  <div id="left-col">
    <div id="editor-panel">
      <div id="editor-header">EDITOR — MATLAB/Octave (autorun)</div>
      <textarea id="editor" spellcheck="false" placeholder="% Escribe código MATLAB aquí
a = 3
A = [1, 2; 3, 4]
x = inv(A) * [5; 6]"></textarea>
    </div>
    <div id="funcs-panel" style="display:none">
      <div id="funcs-header">
        <span>📚 FUNCIONES FEM</span>
        <div class="spacer"></div>
        <button id="funcs-save" title="Guardar funciones del editor">💾</button>
        <button id="funcs-close" title="Cerrar panel">✕</button>
      </div>
      <div id="funcs-body">
        <div id="funcs-list"></div>
        <div id="funcs-code">
          <pre id="funcs-code-pre">% Selecciona una función de la lista</pre>
        </div>
      </div>
    </div>
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

// Helper: set editor text preserving undo history
function setEditorText(text: string) {
  editor.focus();
  editor.select();
  document.execCommand('insertText', false, text);
}

// Tab key — use execCommand to preserve undo
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  }
});

// ── Modo (Hékatan Lab vs MATLAB estricto) ──
type Mode = 'hekatan-lab' | 'matlab';
let currentMode: Mode = (localStorage.getItem('hekatanlab-mode') as Mode) || 'hekatan-lab';
function applyMode(m: Mode) {
  currentMode = m;
  localStorage.setItem('hekatanlab-mode', m);
  engine.setMode(m);
  // Resaltar botón activo
  document.querySelectorAll<HTMLElement>('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === m);
  });
  // En modo MATLAB no hay autorun (igual al MATLAB local: hay que pulsar Ejecutar)
  // y se actualiza el header del editor.
  const isMatlab = m === 'matlab';
  if (isMatlab) autorunEnabled = false;
  document.body.classList.toggle('mode-matlab', isMatlab);
  const autoBtn = document.getElementById('btn-autorun')!;
  autoBtn.classList.toggle('active', autorunEnabled);
  autoBtn.style.display = isMatlab ? 'none' : '';
  const editorHeader = document.getElementById('editor-header');
  if (editorHeader) editorHeader.textContent = isMatlab ? 'EDITOR — MATLAB (estricto, pulsa ▶ Ejecutar)' : 'EDITOR — MATLAB/Octave (autorun)';
  // Reconstruir el dropdown de Ejemplos para mostrar solo los del modo activo
  const sel = document.getElementById('template-select') as HTMLSelectElement | null;
  if (sel) {
    const placeholder = `<option value="">📂 Ejemplos${isMatlab ? ' (MATLAB)' : ''}</option>`;
    sel.innerHTML = placeholder + buildTemplateOptions(m);
  }
  // Re-render con el nuevo modo si ya hay output
  if (lastResults) renderOutput(output, lastResults, editor, { mode: currentMode });
}

// Autorun (toggleable)
let autorunEnabled = true;
let timer: number | null = null;
let suppressAutorun = false; // suppress during programmatic text changes
let lastResults: any = null;
editor.addEventListener('input', () => {
  if (!autorunEnabled || suppressAutorun) return;
  if (timer) clearTimeout(timer);
  // Longer delay for getMesh (async WASM) to avoid race conditions
  const delay = editor.value.includes('getMesh') ? 1000 : 400;
  timer = window.setTimeout(run, delay);
});

document.getElementById('btn-autorun')!.addEventListener('click', () => {
  autorunEnabled = !autorunEnabled;
  const btn = document.getElementById('btn-autorun')!;
  btn.classList.toggle('active', autorunEnabled);
  btn.title = autorunEnabled ? 'Autorun ON' : 'Autorun OFF';
});

// Botones de modo
document.querySelectorAll<HTMLElement>('.mode-btn').forEach(b => {
  b.addEventListener('click', () => applyMode(b.dataset.mode as Mode));
});

let runId = 0; // guard against concurrent runs
async function run() {
  const myId = ++runId;
  const code = editor.value;
  const t0 = performance.now();
  const results = await engine.evaluate(code);
  if (myId !== runId) return; // stale run — newer one started
  const dt = (performance.now() - t0).toFixed(0);
  lastResults = results;
  renderOutput(output, results, editor, { mode: currentMode });
  (document.getElementById('status-lines')!).textContent = `${code.split('\n').length} líneas`;
  (document.getElementById('status-time')!).textContent = `${dt}ms`;
  (document.getElementById('status-vars')!).textContent = `${results.filter(r => r.type === 'assign').length} vars`;
}

document.getElementById('btn-run')!.addEventListener('click', run);
document.getElementById('btn-clear')!.addEventListener('click', () => { setEditorText(''); output.innerHTML = ''; engine.reset(); });

// Aplicar modo persistido (después de wirear botones y engine)
applyMode(currentMode);

// Templates — al seleccionar, solo carga el codigo en el editor.
// El usuario presiona "Ejecutar" cuando quiere correr (igual que MATLAB).
// Esto evita el lag de auto-run en templates pesados como FEM completo.
document.getElementById('template-select')!.addEventListener('change', (e) => {
  const sel = e.target as HTMLSelectElement;
  const t = TEMPLATES.find(x => x.name === sel.value);
  if (t) {
    if (timer) clearTimeout(timer);
    suppressAutorun = true;
    setEditorText(t.code);
    suppressAutorun = false;
    // Limpiar output anterior para que no confunda con el template nuevo
    output.innerHTML = '<div style="padding:1em;opacity:0.6;font-style:italic">' +
      'Codigo cargado. Presiona "Ejecutar" para correr el template.' +
      '</div>';
  }
});

// Theme
let dark = true;
document.getElementById('btn-theme')!.addEventListener('click', () => {
  dark = !dark;
  document.body.classList.toggle('light', !dark);
  (document.getElementById('btn-theme')!).textContent = dark ? '☀' : '🌙';
  run(); // Re-render 3D views with new theme colors
});

// ── Functions Panel (inline below editor) ──
let funcsPanelOpen = false;
const funcsPanel = document.getElementById('funcs-panel')!;
const funcsList = document.getElementById('funcs-list')!;
const funcsCodePre = document.getElementById('funcs-code-pre')!;

function buildFuncsList() {
  let html = '';
  // Category groups
  const cats: Record<string, typeof femMatlabLibrary> = {};
  for (const mf of femMatlabLibrary) {
    const cat = mf.name.startsWith('k_') ? 'Rigidez' :
                mf.name.startsWith('T') && mf.name.length <= 4 ? 'Transformación' :
                mf.name.startsWith('shell_') || mf.name.startsWith('build') ? 'Shell' :
                mf.name.startsWith('mesh') || mf.name.startsWith('gen_') || mf.name.startsWith('fixed_') ? 'Malla' :
                ['freedofs','submat','subvec','fullvec','assemble_k','solve_fem','reactions','frame_forces'].includes(mf.name) ? 'Solver' :
                'Otros';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(mf);
  }

  // User functions
  const userFns = loadFunctions();

  for (const [cat, fns] of Object.entries(cats)) {
    html += `<div class="fn-cat">${cat}</div>`;
    for (const mf of fns) {
      const desc = mf.description || '';
      html += `<div class="fn-item" data-fn="${mf.name}" title="${desc}">
        <span class="fn-name">${mf.name}</span><span class="fn-params">(${mf.params.join(', ')})</span>
      </div>`;
    }
  }

  if (userFns.length > 0) {
    html += `<div class="fn-cat">Usuario</div>`;
    for (const f of userFns) {
      html += `<div class="fn-item fn-user" data-fn="user:${f.name}">
        <span class="fn-name">${f.name}</span><span class="fn-params">(${f.params.join(', ')})</span>
        <button class="fn-del" data-d="${f.name}" title="Eliminar">✕</button>
      </div>`;
    }
  }

  funcsList.innerHTML = html;

  // Click handlers
  funcsList.querySelectorAll<HTMLDivElement>('.fn-item').forEach(el => {
    el.addEventListener('click', () => {
      // Deselect all, select this one
      funcsList.querySelectorAll('.fn-item').forEach(x => x.classList.remove('fn-selected'));
      el.classList.add('fn-selected');

      const fnName = el.dataset.fn || '';
      if (fnName.startsWith('user:')) {
        const name = fnName.slice(5);
        const uf = loadFunctions().find(f => f.name === name);
        if (uf) {
          funcsCodePre.textContent = `function ${uf.name}(${uf.params.join(', ')})\n${uf.body}\nend`;
        }
      } else {
        const mf = femMatlabLibrary.find(f => f.name === fnName);
        if (mf) {
          const header = mf.description ? `% ${mf.description}\n` : '';
          funcsCodePre.textContent = `function ${mf.name}(${mf.params.join(', ')})\n${header}${mf.body}\nend`;
        }
      }
    });
  });

  // Delete user function buttons
  funcsList.querySelectorAll<HTMLButtonElement>('.fn-del').forEach(b => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeFunction(b.dataset.d!);
      buildFuncsList();
    });
  });
}

document.getElementById('btn-funcs')!.addEventListener('click', () => {
  funcsPanelOpen = !funcsPanelOpen;
  funcsPanel.style.display = funcsPanelOpen ? 'flex' : 'none';
  document.getElementById('btn-funcs')!.classList.toggle('active', funcsPanelOpen);
  if (funcsPanelOpen) {
    buildFuncsList();
    // Select first function
    const first = funcsList.querySelector<HTMLDivElement>('.fn-item');
    if (first) first.click();
  }
});

document.getElementById('funcs-close')!.addEventListener('click', () => {
  funcsPanelOpen = false;
  funcsPanel.style.display = 'none';
  document.getElementById('btn-funcs')!.classList.remove('active');
});

document.getElementById('funcs-save')!.addEventListener('click', () => {
  const rx = /function\s+(?:\[?(\w+)\]?\s*=\s*)?(\w+)\s*\(([^)]*)\)([\s\S]*?)(?:end|endfunction)/g;
  let m, c = 0;
  while ((m = rx.exec(editor.value)) !== null) {
    addFunction({ name: m[2], params: m[3].split(',').map(s=>s.trim()).filter(Boolean), body: m[4].trim() });
    c++;
  }
  if (c) { buildFuncsList(); } else { alert('No se encontraron funciones en el editor'); }
});

// Exposición para testing (window.__hekatan_importE2k(text) → string MATLAB)
(window as any).__hekatan_importE2k = (text: string) => e2kToMatlab(parseE2k(text));
(window as any).__hekatan_parseE2k = parseE2k;

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
      try {
        if (ext.endsWith('.e2k')) {
          setEditorText(e2kToMatlab(parseE2k(text)));
        } else {
          setEditorText(s2kToMatlab(parseS2k(text)));
        }
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
    <p style="color:var(--text-dim);font-size:11px;margin:0 0 12px">Exporta variables <b>nodes</b>, <b>frames/elem</b>, <b>supports</b>, <b>loads</b></p>
    <div style="display:flex;gap:8px;flex-direction:column">
      <button id="exp-s2k" style="padding:8px;background:#1a3a5c;color:#66ccff;border:1px solid #66ccff;border-radius:4px;cursor:pointer;font-size:13px">📄 .s2k (SAP2000)</button>
      <button id="exp-e2k" style="padding:8px;background:#1a4a2a;color:#66ff99;border:1px solid #66ff99;border-radius:4px;cursor:pointer;font-size:13px">📄 .e2k (ETABS)</button>
      <button id="exp-close" style="padding:6px;background:var(--bg);color:var(--text-dim);border:1px solid var(--border);border-radius:4px;cursor:pointer">✕</button>
    </div>`;
  document.body.appendChild(p);

  const extractData = async () => {
    await engine.evaluate(editor.value);
    const scope = engine.getScope();
    const toArr = (v: any): number[][] => {
      if (!v) return [];
      try {
        const a = (v.toArray ? v.toArray() : v) as any[];
        if (!Array.isArray(a)) return [];
        return a.map((row: any) => Array.isArray(row) ? row.map(Number) : [Number(row)]);
      } catch { return []; }
    };
    const nodes = toArr(scope.nodes);
    if (!nodes.length) { alert('No se encontró variable "nodes"'); return null; }
    return { nodes, elements: toArr(scope.frames || scope.elem || scope.elements),
      frameProps: toArr(scope.frame_props || scope.props),
      supports: toArr(scope.supports), loads: toArr(scope.loads) };
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
    const d = extractData(); if (!d) return;
    try { download(exportS2k({ nodes: d.nodes, frames: d.elements, frameProps: d.frameProps.length ? d.frameProps : undefined, supports: d.supports.length ? d.supports : undefined, loads: d.loads.length ? d.loads : undefined }), 'model.s2k'); p.remove(); }
    catch (e: any) { alert('Error: ' + e.message); }
  });
  document.getElementById('exp-e2k')!.addEventListener('click', () => {
    const d = extractData(); if (!d) return;
    try { download(exportE2k({ nodes: d.nodes, elements: d.elements, props: d.frameProps.length ? d.frameProps : undefined, supports: d.supports.length ? d.supports : undefined, loads: d.loads.length ? d.loads : undefined }), 'model.e2k'); p.remove(); }
    catch (e: any) { alert('Error: ' + e.message); }
  });
  document.getElementById('exp-close')!.addEventListener('click', () => p.remove());
});

// Help
document.getElementById('btn-help')!.addEventListener('click', () => {
  setEditorText(`% HékatanLab Web — Ayuda
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
%   📚 → ver código de funciones FEM
%
% S2K/E2K:
%   📁 Import → abre .s2k o .e2k
%   💾 Export → genera .s2k o .e2k`);
  run();
});

// Default
const def = TEMPLATES.find(t => t.name === 'Operaciones básicas');
if (def) { setEditorText(def.code); run(); }

// === Carga de ejemplos Calcpad (390+) ===
type CpdIndex = { groups: Record<string, { path: string; name: string }[]>; total: number };

async function loadCpdIndex(): Promise<void> {
  try {
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const res = await fetch(baseUrl + 'calcpad-examples/index.json');
    if (!res.ok) {
      // 404/500 — endpoint no existe en este deploy. No es un error.
      return;
    }
    // Verificar Content-Type: si el archivo no existe, Vite/SPA-fallback devuelve
    // index.html con 200 OK pero Content-Type text/html → res.json() fallaría con
    // "Unexpected token '<'". Detectamos eso explícitamente.
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('json')) {
      // No hay catálogo Calcpad en este deploy — silenciamos.
      return;
    }
    const idx: CpdIndex = await res.json();
    const sel = document.getElementById('cpd-select') as HTMLSelectElement | null;
    if (!sel) return;
    sel.options[0].text = `📚 Calcpad (${idx.total})`;
    const sortedGroups = Object.keys(idx.groups).sort();
    for (const groupName of sortedGroups) {
      const og = document.createElement('optgroup');
      og.label = groupName;
      const items = idx.groups[groupName];
      items.sort((a, b) => a.name.localeCompare(b.name));
      for (const item of items) {
        const opt = document.createElement('option');
        opt.value = item.path;
        opt.textContent = item.name;
        og.appendChild(opt);
      }
      sel.appendChild(og);
    }
    console.log(`Loaded ${idx.total} Calcpad examples in ${sortedGroups.length} groups`);
  } catch (err) {
    // Silenciar — el catálogo Calcpad es opcional. Cualquier error de red o JSON
    // simplemente significa que no hay catálogo disponible en este deploy.
    console.debug('Calcpad index not available:', err);
  }
}

document.getElementById('cpd-select')?.addEventListener('change', async (ev) => {
  const sel = ev.target as HTMLSelectElement;
  const path = sel.value;
  if (!path) return;
  try {
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const res = await fetch(baseUrl + 'calcpad-examples/' + path);
    if (!res.ok) {
      console.error(`Failed to load ${path}: HTTP ${res.status}`);
      return;
    }
    const cpdText = await res.text();
    // Convert .cpd to MATLAB-like comment + raw code so the user can read it
    // Calcpad uses ' for comments, " for headings — keep them as comments
    const lines = cpdText.split('\n');
    const matlab = lines.map(l => {
      const t = l.trimStart();
      if (t.startsWith("'")) return '% ' + t.substring(1).trim();
      if (t.startsWith('"')) return '% === ' + t.substring(1).trim() + ' ===';
      return '% [calcpad] ' + l;
    }).join('\n');
    const header = `% ═══════════════════════════════════════════
% Ejemplo Calcpad-Symbolic: ${path}
% Mostrado como comentarios en HekatanLab.
% Para ejecutar: usa Calcpad-Symbolic Web →
% https://giorgioburbanelli89.github.io/calcpad-web/
% ═══════════════════════════════════════════
\n`;
    setEditorText(header + matlab);
    run();
  } catch (err) {
    console.error('Failed to load .cpd:', err);
  }
});

loadCpdIndex();
