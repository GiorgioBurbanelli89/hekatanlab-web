import './styles.css';
import { createEngine } from './engine';
import { renderOutput } from './renderer';

// ── Build UI ──
document.body.innerHTML = `
<div id="header">
  <span class="logo">HékatanLab</span>
  <span class="subtitle">MATLAB Web — math.js + C++/WASM</span>
  <div class="spacer"></div>
  <button class="primary" id="btn-run">▶ Ejecutar</button>
  <button id="btn-clear">Limpiar</button>
  <select id="template-select">
    <option value="">📂 Ejemplos</option>
    <option value="basico">Básico — variables y operaciones</option>
    <option value="matrices">Matrices y sistemas Ax=b</option>
    <option value="simbolico">Álgebra simbólica</option>
    <option value="fem-barra">FEM — Barra axial</option>
    <option value="fem-portico">FEM — Pórtico 2D</option>
    <option value="estadistica">Estadística y regresión</option>
  </select>
  <button id="btn-help">?</button>
</div>
<div id="main">
  <div id="editor-panel">
    <div id="editor-header">EDITOR — Sintaxis MATLAB/Octave</div>
    <textarea id="editor" spellcheck="false" placeholder="% Escribe código MATLAB aquí
% Ejemplo:
A = [1, 2; 3, 4]
b = [5; 6]
x = inv(A) * b"></textarea>
  </div>
  <div id="output-panel">
    <div id="output-header">OUTPUT</div>
    <div id="output"></div>
  </div>
</div>
<div id="status">
  <span id="status-lines">Líneas: 0</span>
  <span id="status-time">Tiempo: 0ms</span>
  <span id="status-vars">Variables: 0</span>
  <span>HékatanLab Web v1.0 — math.js + KaTeX + nerdamer</span>
</div>
`;

const editor = document.getElementById('editor') as HTMLTextAreaElement;
const output = document.getElementById('output') as HTMLDivElement;
const engine = createEngine();

// ── Tab key in editor ──
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(editor.selectionEnd);
    editor.selectionStart = editor.selectionEnd = start + 2;
  }
});

// ── Autorun: debounced execution on every keystroke ──
let autorunTimer: number | null = null;
editor.addEventListener('input', () => {
  if (autorunTimer) clearTimeout(autorunTimer);
  autorunTimer = window.setTimeout(run, 300); // 300ms debounce
});

// ── Run ──
function run() {
  const code = editor.value;
  const t0 = performance.now();
  const results = engine.evaluate(code);
  const dt = (performance.now() - t0).toFixed(0);
  renderOutput(output, results);

  // Status bar
  const lines = code.split('\n').length;
  (document.getElementById('status-lines') as HTMLElement).textContent = `Líneas: ${lines}`;
  (document.getElementById('status-time') as HTMLElement).textContent = `Tiempo: ${dt}ms`;
  (document.getElementById('status-vars') as HTMLElement).textContent = `Variables: ${results.filter(r => r.type === 'assign').length}`;
}

document.getElementById('btn-run')!.addEventListener('click', run);
document.getElementById('btn-clear')!.addEventListener('click', () => {
  editor.value = '';
  output.innerHTML = '';
  engine.reset();
});

// ── Templates ──
const TEMPLATES: Record<string, string> = {
  basico: `% ═══════════════════════════════════════════
% Operaciones básicas
% ═══════════════════════════════════════════

% Variables
a = 3
b = 4
c = sqrt(a^2 + b^2)

% Trigonometría
angulo = 30
rad = angulo * pi / 180
seno = sin(rad)
coseno = cos(rad)

% Logaritmos
x = log(100)
y = log2(256)
z = exp(1)`,

  matrices: `% ═══════════════════════════════════════════
% Matrices y sistemas lineales
% ═══════════════════════════════════════════

% Definir matrices
A = [4, -1, 0; -1, 4, -1; 0, -1, 4]
b = [1; 2; 3]

% Resolver Ax = b
x = inv(A) * b

% Determinante
d = det(A)

% Transpuesta
At = transpose(A)

% Traza
tr = trace(A)

% Eigenvalores
lambda = eigs(A)`,

  simbolico: `% ═══════════════════════════════════════════
% Álgebra simbólica (nerdamer)
% ═══════════════════════════════════════════

% Derivada
f_prima = sdiff('x^3 + 2*x^2 - 5*x + 1', 'x')

% Segunda derivada
f_seg = sdiff2('x^3 + 2*x^2 - 5*x + 1', 'x')

% Integral indefinida
F = sint('3*x^2 + 4*x - 5', 'x')

% Integral definida
area = sdefint('x^2', 'x', 0, 1)

% Resolver ecuación
sol = ssolve('x^2 - 5*x + 6', 'x')

% Expandir
exp1 = sexpand('(x+1)*(x-2)')

% Factorizar
fac1 = sfactor('x^2 - 4')`,

  'fem-barra': `% ═══════════════════════════════════════════
% FEM — Barra axial paso a paso
% 1 elemento, 2 nodos, 1 DOF por nodo
% ═══════════════════════════════════════════

% ─── Datos ───
L = 2
E = 210000
A = 0.01

% ─── Rigidez local ───
k = E * A / L
K = k * [1, -1; -1, 1]

% ─── Carga distribuida ───
q = 5
F_dist = [q * L / 2; q * L / 2]

% ─── Carga puntual ───
P = 20

% ─── Condiciones de borde: u1 = 0 ───
K_red = K(2, 2)
F_red = F_dist(2) + P

% ─── Solución ───
u2 = F_red / K_red

% ─── Verificación analítica ───
u_exact = (P * L + q * L^2 / 2) / (E * A)
error_pct = abs(u2 - u_exact) / u_exact * 100

% ─── Reacción ───
R1 = -(P + q * L)

% ─── Esfuerzo ───
sigma = E * u2 / L`,

  'fem-portico': `% ═══════════════════════════════════════════
% FEM — Pórtico plano 2D
% 2 columnas + 1 viga, 3 nodos, 3 DOF/nodo
% ═══════════════════════════════════════════

% ─── Propiedades ───
E = 200000
A = 0.01
I = 8.33e-6
L_col = 3
L_viga = 5

% ─── K columna (6x6) ───
EA_L = E * A / L_col
EI_L3 = E * I / L_col^3
EI_L2 = E * I / L_col^2
EI_L = E * I / L_col

K_col = [EA_L, 0, 0, -EA_L, 0, 0;
         0, 12*EI_L3, 6*EI_L2, 0, -12*EI_L3, 6*EI_L2;
         0, 6*EI_L2, 4*EI_L, 0, -6*EI_L2, 2*EI_L;
         -EA_L, 0, 0, EA_L, 0, 0;
         0, -12*EI_L3, -6*EI_L2, 0, 12*EI_L3, -6*EI_L2;
         0, 6*EI_L2, 2*EI_L, 0, -6*EI_L2, 4*EI_L]

% ─── Carga lateral ───
P = 10
F = [0; 0; 0; P; 0; 0; 0; 0; 0]`,

  estadistica: `% ═══════════════════════════════════════════
% Estadística y regresión
% ═══════════════════════════════════════════

% Datos
x = [1, 2, 3, 4, 5, 6, 7, 8]
y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.3, 13.9, 16.2]

% Estadísticas
n = size(x)(2)
x_mean = mean(x)
y_mean = mean(y)

% Regresión lineal: y = a + b*x
Sxy = sum(x .* y) - n * x_mean * y_mean
Sxx = sum(x .* x) - n * x_mean^2
b_reg = Sxy / Sxx
a_reg = y_mean - b_reg * x_mean

% Coeficiente R²
y_pred = a_reg + b_reg * x
SS_res = sum((y - y_pred) .^ 2)
SS_tot = sum((y - y_mean) .^ 2)
R2 = 1 - SS_res / SS_tot`,
};

document.getElementById('template-select')!.addEventListener('change', (e) => {
  const val = (e.target as HTMLSelectElement).value;
  if (val && TEMPLATES[val]) {
    editor.value = TEMPLATES[val];
    run();
  }
  (e.target as HTMLSelectElement).value = '';
});

// ── Help ──
document.getElementById('btn-help')!.addEventListener('click', () => {
  editor.value = `% ═══════════════════════════════════════════
% HékatanLab Web — Ayuda
% ═══════════════════════════════════════════
%
% ATAJOS:
%   Ctrl+Enter = Ejecutar
%   Tab = Indentar
%
% SINTAXIS:
%   % comentario
%   x = 3.14          → variable
%   A = [1, 2; 3, 4]  → matriz
%   b = [5; 6]         → vector columna
%
% FUNCIONES MATEMÁTICAS:
%   sin, cos, tan, asin, acos, atan
%   sqrt, abs, exp, log, log2, log10
%   ceil, floor, round, mod
%   pi, e
%
% MATRICES:
%   inv(A), det(A), transpose(A), trace(A)
%   eigs(A), size(A), zeros(n,m), ones(n,m)
%   eye(n), diag(v)
%
% SIMBÓLICO (nerdamer):
%   sdiff('expr', 'x')    → derivada
%   sdiff2('expr', 'x')   → segunda derivada
%   sint('expr', 'x')     → integral
%   sdefint('expr','x',a,b) → integral definida
%   ssolve('expr', 'x')   → resolver ecuación
%   sexpand('expr')        → expandir
%   sfactor('expr')        → factorizar
%
% C++/WASM (próximamente):
%   solve_sparse(K, F)     → SparseLU
%   eigen_decompose(K, M)  → eigenvalores
`;
  run();
});

// ── Load default example ──
editor.value = TEMPLATES.basico;
run();
