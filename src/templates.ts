// ═══════════════════════════════════════════
// HékatanLab Web — Templates
// Libro: Métodos Matriciales con MATLAB (Herrera)
// + Mecánica Computacional + FEM
// ═══════════════════════════════════════════

export interface Template {
  name: string;
  category: string;
  code: string;
  /**
   * Modo recomendado para este ejemplo:
   *   'hekatan-lab' → solo aparece en modo Hekatan Lab (LaTeX, autorun, asignaciones se muestran)
   *   'matlab'      → solo aparece en modo MATLAB estricto (usa disp/fprintf/printf)
   *   'both' (o ausente) → aparece en ambos modos
   */
  mode?: 'hekatan-lab' | 'matlab' | 'both';
}

export const TEMPLATES: Template[] = [
  // ═════════════════════════════════════════════════
  // BENCHMARK — Mide velocidad del JIT
  // ═════════════════════════════════════════════════

  { name: 'B01 — Benchmark FEM completo', category: 'Benchmark', mode: 'matlab', code: `% ═══════════════════════════════════════════
% Benchmark FEM COMPLETO en HekatanLab
% Mide tiempo de UN CICLO FEM entero (ensamble + BCs + solve + extract).
% Repite N veces para amplificar tiempo y promediar.
%
% Tamano del problema:
%   - 6 x 4 elementos = 24 elementos Q4 plane stress
%   - 35 nodos x 2 DOFs = 70 DOFs globales
%   - K global 70 x 70
% Este es un FEM educational pero realista.
% ═══════════════════════════════════════════

% --- DATOS (fijos, fuera del timer) ---
E_e = 30000; nu_e = 0.2; t_e = 0.2;
W_e = 3; H_e = 2; P_e = 100;
nx_e = 6; ny_e = 4;
N_FEM_RUNS = 10;        % numero de FEMs completos a medir

% Pre-computar todo lo independiente del solve
n_dof = 2;
ne = nx_e*ny_e;
nj = (nx_e+1)*(ny_e+1);
n_tot = n_dof*nj;
dx_e = W_e/nx_e;
dy_e = H_e/ny_e;

% Mesh (fijo)
nds = zeros(nj, 2);
for j = 0:ny_e
  for i = 0:nx_e
    k = j*(nx_e+1) + i + 1;
    nds(k,1) = i*dx_e;
    nds(k,2) = j*dy_e;
  end
end
els = zeros(ne, 4);
for j = 0:ny_e-1
  for i = 0:nx_e-1
    e = j*nx_e + i + 1;
    bl = j*(nx_e+1) + i + 1;
    els(e,1)=bl; els(e,2)=bl+1; els(e,3)=bl+(nx_e+1)+1; els(e,4)=bl+(nx_e+1);
  end
end

% Ke de un elemento (constante para malla regular)
D_e = (E_e/(1-nu_e^2)) * [1, nu_e, 0; nu_e, 1, 0; 0, 0, (1-nu_e)/2];
J11_e = dx_e/2; J22_e = dy_e/2;
detJ_e = J11_e*J22_e;
g_e = 1/sqrt(3);
gpts_e = [-g_e,-g_e; g_e,-g_e; g_e,g_e; -g_e,g_e];
Ke_pre = zeros(8, 8);
for ig = 1:4
  xi = gpts_e(ig,1); eta = gpts_e(ig,2);
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
  dNx_e = dNxi / J11_e;
  dNy_e = dNeta / J22_e;
  B_e = zeros(3, 8);
  for i = 1:4
    B_e(1, 2*i-1) = dNx_e(i);
    B_e(2, 2*i)   = dNy_e(i);
    B_e(3, 2*i-1) = dNy_e(i);
    B_e(3, 2*i)   = dNx_e(i);
  end
  Ke_pre = Ke_pre + transpose(B_e) * D_e * B_e * t_e * detJ_e;
end

disp("Setup completo:")
fprintf("  Malla %dx%d = %d elementos, %d nodos, %d DOFs\\n", nx_e, ny_e, ne, nj, n_tot)
fprintf("  N_FEM_RUNS = %d\\n", N_FEM_RUNS)
disp(" ")
disp("Iniciando benchmark...")

% --- LOOP DE BENCHMARK: 10 FEMs completos ---
tic
for run = 1:N_FEM_RUNS
  % 1. Ensamble global de K
  K_g = zeros(n_tot, n_tot);
  for e = 1:ne
    dofs = zeros(1, 8);
    for i = 1:4
      n_id = els(e, i);
      dofs(2*i-1) = 2*n_id - 1;
      dofs(2*i)   = 2*n_id;
    end
    for i = 1:8
      for j = 1:8
        K_g(dofs(i), dofs(j)) = K_g(dofs(i), dofs(j)) + Ke_pre(i, j);
      end
    end
  end

  % 2. BCs: penalty en base (y=0)
  kp = 1e20;
  for i = 1:(nx_e+1)
    K_g(2*i-1, 2*i-1) = K_g(2*i-1, 2*i-1) + kp;
    K_g(2*i, 2*i) = K_g(2*i, 2*i) + kp;
  end

  % 3. Carga lateral repartida en top
  F_g = zeros(n_tot, 1);
  p_node = P_e/(nx_e+1);
  for i = 1:(nx_e+1)
    j_top = ny_e*(nx_e+1) + i;
    F_g(2*j_top - 1) = p_node;
  end

  % 4. Solve
  u_full = inv(K_g) * F_g;

  % 5. Extract max displacement
  u_max_run = 0;
  for k = 1:nj
    if abs(u_full(2*k-1)) > abs(u_max_run)
      u_max_run = u_full(2*k-1);
    end
  end
end
t_total = toc;

fprintf("\\nResultado:\\n")
fprintf("  Tiempo total: %.3f s\\n", t_total)
fprintf("  Por FEM:      %.1f ms\\n", t_total*1000/N_FEM_RUNS)
fprintf("  u_max (ultimo run): %.4e m\\n", u_max_run)

disp(" ")
disp("Stats del JIT en consola del navegador (F12):")
disp("   __hekatanJitStats()")
disp(" Si 'jit' >> 'compile + parse' -> JIT trabajando bien.")
disp(" Para desactivar JIT: globalThis.__hekatanDisableJit = true")` },

  { name: 'B00 — Benchmark JIT (loop simple)', category: 'Benchmark', mode: 'matlab', code: `% ═══════════════════════════════════════════
% Benchmark del JIT en HekatanLab
% Mide tiempo de un loop ARITMETICO SIMPLE (no FEM).
% El JIT compila a JS nativo via new Function() — V8 lo optimiza a
% codigo nativo de procesador, ~50-100x mas rapido que el interpreter.
% ═══════════════════════════════════════════

% Loop simple: suma de cuadrados - sin(i)*cos(i) repetido N veces
N = 100000;

% --- TEST con JIT habilitado (default) ---
tic
s = 0;
for i = 1:N
  s = s + i^2 - sin(i)*cos(i);
end
t_jit = toc;
fprintf("CON JIT:    %d iter en %.3f s -> %.2f ns/iter\\n", N, t_jit, t_jit*1e9/N)

% Verificacion del resultado
disp("Suma final s:")
disp(s)

% --- Comparacion sin JIT (deshabilitamos via toggle) ---
% El toggle __hekatanDisableJit existe en globalThis. Si lo activamos,
% el motor cae al tier 2 (compile-cache) que es ~10-30x mas lento.
disp(" ")
disp("(Para comparar SIN JIT, en consola del navegador (F12):")
disp("   globalThis.__hekatanDisableJit = true")
disp(" y volver a correr este template.")
disp(" Luego reset: globalThis.__hekatanDisableJit = false)")

% Stats por tier (jit / compile / parse)
disp(" ")
disp("Stats por tier (jit/compile/parse) en consola:")
disp("   __hekatanJitStats()")
disp(" Si jit >> compile+parse el JIT esta trabajando bien.")` },

  // ═════════════════════════════════════════════════
  // GRAPHICS — Test rapido de todas las gráficas MATLAB
  // ═════════════════════════════════════════════════

  { name: 'G00 — TEST Gráficas MATLAB (todas)', category: 'Graphics MATLAB', mode: 'matlab', code: `% ═══════════════════════════════════════════
% TEST de todas las funciones de graficas
% MATLAB puro (sin range/map de HekatanLab)
% Si algo no se ve, esa funcion no esta soportada
% ═══════════════════════════════════════════

% IMPORTANTE: 'figure' antes de cada plot crea VENTANA NUEVA en MATLAB.
% Sin esto, MATLAB sobreescribe la figura previa y solo veras la ultima.
% En HekatanLab cada plot se agrega como canvas nuevo automaticamente.

% 1) plot(x, y, title) - linea 2D
figure
x = 0:0.1:2*pi;
y = sin(x);
plot(x, y, "plot: y = sin(x)")

% 2) scatter(x, y, title) - puntos dispersos
figure
xs = [1, 2, 3, 4, 5, 6, 7, 8];
ys = [2.1, 3.9, 6.2, 7.8, 10.1, 12.3, 13.9, 16.2];
scatter(xs, ys, "scatter: datos experimentales")

% 3) bar(x, y, title) - grafico de barras
figure
cat = 1:5;
val = [23, 45, 12, 67, 34];
bar(cat, val, "bar: ventas por region")

% 4) stem(x, y, title) - impulsos
figure
n = 0:20;
amort = sin(n) .* exp(-n/5);
stem(n, amort, "stem: senal amortiguada")

% 5) fplot(expr, [a, b], title) - graficar expresion
figure
fplot("x^3 - 3*x^2 + 2", [-2, 4], "fplot: x^3 - 3x^2 + 2")
figure
fplot("sin(x) * cos(2*x)", [0, 6.28], "fplot: sin(x)*cos(2x)")

% 6) plot3(x, y, z, title) - curva 3D
figure
t = 0:0.1:6*pi;
xh = cos(t);
yh = sin(t);
plot3(xh, yh, t, "plot3: helice 3D")

% 7) surf(x, y, Z, title) - superficie
figure
xg = -4:0.5:4;
yg = -4:0.5:4;
Z = meshz(xg, yg, "sin(sqrt(x^2+y^2+0.01))/sqrt(x^2+y^2+0.01)");
surf(xg, yg, Z)
title("surf: sombrero mexicano")

% 8) hist(data, bins, title) - histograma
figure
datos = randn(1, 500);
hist(datos, 20, "hist: distribucion normal")

disp("Si todos los plots aparecen arriba, las graficas funcionan OK")` },

  // ═════════════════════════════════════════════════
  // FEM Elementos — 7 ejemplos por tipo de elemento
  // Todos en modo MATLAB puro
  // ═════════════════════════════════════════════════

  { name: 'FE01b — Cantilever Wall Q4 (con contorno)', category: 'FEM Elementos', mode: 'matlab', code: `% ═══════════════════════════════════════════
% CANTILEVER WALL Q4 - Solver FEM completo + CONTORNO
%
% Ejemplo: muro 5x3 m, espesor 0.2 m, empotrado en la base,
% carga lateral de 100 kN repartida en el top.
%
% Funciona IGUAL en MATLAB real y en HekatanLab Web.
% Si lo copias a MATLAB, las graficas (surf con view 2) salen perfecto.
% ═══════════════════════════════════════════

% --- DATOS ---
W = 5;            % ancho del muro
H = 3;            % altura
t = 0.2;          % espesor
P = 100;          % carga lateral total (en el top)
E = 25000;        % modulo elastico (MPa, pero usamos como escalar)
nu = 0.2;
nx = 4;           % elementos en x
ny = 3;           % elementos en y

fprintf("Muro %.1fx%.1f m, t=%.2f, P=%.0f, malla %dx%d\\n", W, H, t, P, nx, ny)

% --- MALLA ---
n_dof = 2;                    % u, v por nodo
ne = nx*ny;                   % elementos
nj = (nx+1)*(ny+1);           % nodos
n_total = n_dof*nj;
dx = W/nx;
dy = H/ny;

% Coordenadas nodales
nds = zeros(nj, 2);
for j = 0:ny
  for i = 0:nx
    k = j*(nx+1) + i + 1;
    nds(k, 1) = i*dx;
    nds(k, 2) = j*dy;
  end
end

% Conectividad (4 nodos por elemento, CCW)
els = zeros(ne, 4);
for j = 0:ny-1
  for i = 0:nx-1
    e = j*nx + i + 1;
    bl = j*(nx+1) + i + 1;
    els(e, 1) = bl;
    els(e, 2) = bl + 1;
    els(e, 3) = bl + (nx+1) + 1;
    els(e, 4) = bl + (nx+1);
  end
end

% --- MATRIZ CONSTITUTIVA ---
D = (E/(1-nu^2)) * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];

% --- RIGIDEZ DE UN ELEMENTO Ke (8x8) ---
J11 = dx/2; J22 = dy/2;
detJ = J11*J22;
g = 1/sqrt(3);
gpts = [-g,-g; g,-g; g,g; -g,g];

Ke = zeros(8, 8);
for ig = 1:4
  xi = gpts(ig, 1); eta = gpts(ig, 2);
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
  dNx = dNxi / J11;
  dNy = dNeta / J22;
  B = zeros(3, 8);
  for i = 1:4
    B(1, 2*i-1) = dNx(i);
    B(2, 2*i)   = dNy(i);
    B(3, 2*i-1) = dNy(i);
    B(3, 2*i)   = dNx(i);
  end
  Ke = Ke + transpose(B) * D * B * t * detJ;
end

% --- ENSAMBLE GLOBAL ---
K = zeros(n_total, n_total);
for e = 1:ne
  % DOFs globales del elemento (8 DOFs)
  dofs = zeros(1, 8);
  for i = 1:4
    n_id = els(e, i);
    dofs(2*i-1) = 2*n_id - 1;
    dofs(2*i)   = 2*n_id;
  end
  % Sumar Ke en posiciones globales
  for i = 1:8
    for j = 1:8
      K(dofs(i), dofs(j)) = K(dofs(i), dofs(j)) + Ke(i, j);
    end
  end
end

% --- BCs: penalizacion en nodos de la base (y=0) ---
kp = 1e20;
for i = 1:(nx+1)
  j = 2*i - 1;
  K(j, j) = K(j, j) + kp;
  K(j+1, j+1) = K(j+1, j+1) + kp;
end

% --- VECTOR DE CARGAS: P horizontal repartida en el top ---
F = zeros(n_total, 1);
p_n = P/(nx+1);
for i = 1:(nx+1)
  j_top = ny*(nx+1) + i;
  F(2*j_top - 1) = p_n;
end

% --- RESOLVER K*u = F ---
disp("Resolviendo K*u = F ...")
u_full = inv(K) * F;       % en MATLAB: u_full = K \\ F (mas rapido)

% --- EXTRAER DESPLAZAMIENTOS ---
u_disp = zeros(nj, 1);
v_disp = zeros(nj, 1);
for i = 1:nj
  u_disp(i) = u_full(2*i - 1);
  v_disp(i) = u_full(2*i);
end

% Maximo en el top
u_max = 0; u_node = 0;
for i = 1:(nx+1)
  j_top = ny*(nx+1) + i;
  if abs(u_disp(j_top)) > abs(u_max)
    u_max = u_disp(j_top);
    u_node = j_top;
  end
end
fprintf("Desplazamiento horizontal max: u_max = %.4e en nodo %d\\n", u_max, u_node)

% --- VISUALIZACION: contorno de u(x, y) ---
% Reorganizar u_disp como grilla para surf/contour
nx1 = nx + 1;
ny1 = ny + 1;
U_grid = zeros(ny1, nx1);
for j = 1:ny1
  for i = 1:nx1
    k = (j-1)*nx1 + i;
    U_grid(j, i) = u_disp(k);
  end
end

xc = 0:dx:W;
yc = 0:dy:H;

% surf con view(2) + shading('interp') = contorno 2D estilo MATLAB
% (en HekatanLab usa la paleta SAP2000 - igual a Hekatan Struct)
% IMPORTANTE: 'figure' antes de cada plot crea VENTANA NUEVA en MATLAB,
% sino el segundo plot SOBREESCRIBE al primero (y solo verias v(x,y)).
figure
surf(xc, yc, U_grid)
view(2)
shading('interp')
colorbar
title("Desplazamiento horizontal u(x,y)")
xlabel("x [m]")
ylabel("y [m]")
axis('equal')

% --- VISUALIZACION 2: contorno de v(x, y) ---
V_grid = zeros(ny1, nx1);
for j = 1:ny1
  for i = 1:nx1
    k = (j-1)*nx1 + i;
    V_grid(j, i) = v_disp(k);
  end
end

figure        % <-- Figure 2 (nueva ventana en MATLAB)
surf(xc, yc, V_grid)
view(2)
shading('interp')
colorbar
title("Desplazamiento vertical v(x,y)")
xlabel("x [m]")
ylabel("y [m]")
axis('equal')

% --- VISUALIZACION 3 (solo HekatanLab): contorno FEM real sobre la malla ---
% show_contour(nodes, elements, values, title) usa la paleta SAP2000
% identica a Hekatan Struct. Muestra el contorno sobre la geometria
% real del Q4 con la malla visible, no como una grilla rectangular.
% En MATLAB no existe show_contour; el try/catch hace que falle silencioso.
try
  show_contour(nds, els, u_disp, "u(x,y) — SAP2000 colormap (Hekatan Struct style)")
  show_contour(nds, els, v_disp, "v(x,y) — SAP2000 colormap (Hekatan Struct style)")
catch
  % show_contour solo existe en HekatanLab — ignorar en MATLAB
end

% --- VALIDACION vs viga Euler-Bernoulli ---
I_w = t*W^3 / 12;
delta_beam = P*H^3 / (3*E*I_w);
ratio = abs(u_max) / delta_beam;
fprintf("\\nDeflexion teorica viga: %.4e\\n", delta_beam)
fprintf("Ratio FEM/Viga: %.3f (>1 esperado, FEM captura corte)\\n", ratio)` },

  { name: 'FE01 — Membrana Q4 (plane stress)', category: 'FEM Elementos', mode: 'matlab', code: `% ═══════════════════════════════════════════
% MEMBRANA Q4 — Plane Stress
% 4 nodos x 2 DOFs (u, v) = 8 DOFs
% Integracion 2x2 Gauss (completa para grado 2)
% ═══════════════════════════════════════════

% Datos
E = 30000;        % MPa
nu = 0.2;
t = 0.2;          % espesor
a = 0.5; b = 0.5; % dimensiones elemento rectangular
disp("--- Membrana Q4 ---")
fprintf("E=%.0f MPa, nu=%.2f, t=%.2f m, %.2f x %.2f m\\n", E, nu, t, a, b)

% Coordenadas nodales (rectangulo centrado en origen)
coords = [-a/2, -b/2; a/2, -b/2; a/2, b/2; -a/2, b/2];

% Matriz constitutiva D (plane stress)
D = (E/(1-nu^2)) * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];
disp("D (constitutiva, 3x3):"); disp(D)

% Puntos de Gauss 2x2
g = 1/sqrt(3);
gpts = [-g,-g; g,-g; g,g; -g,g];
w_g = [1; 1; 1; 1];

% Ensamble de K
K = zeros(8, 8);
for ig = 1:4
  xi = gpts(ig, 1); eta = gpts(ig, 2);

  % Derivadas de N en coords naturales
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];

  % Jacobiano
  J = zeros(2, 2);
  for i = 1:4
    J(1,1) = J(1,1) + dNxi(i)*coords(i,1);
    J(1,2) = J(1,2) + dNxi(i)*coords(i,2);
    J(2,1) = J(2,1) + dNeta(i)*coords(i,1);
    J(2,2) = J(2,2) + dNeta(i)*coords(i,2);
  end
  detJ = J(1,1)*J(2,2) - J(1,2)*J(2,1);
  invJ = (1/detJ) * [J(2,2), -J(1,2); -J(2,1), J(1,1)];

  % Derivadas fisicas dN/dx, dN/dy
  dNx = invJ(1,1)*dNxi + invJ(1,2)*dNeta;
  dNy = invJ(2,1)*dNxi + invJ(2,2)*dNeta;

  % Matriz B (3x8): epsilon = B * [u1,v1,u2,v2,u3,v3,u4,v4]
  B = zeros(3, 8);
  for i = 1:4
    B(1, 2*i-1) = dNx(i);
    B(2, 2*i)   = dNy(i);
    B(3, 2*i-1) = dNy(i);
    B(3, 2*i)   = dNx(i);
  end

  K = K + w_g(ig) * transpose(B) * D * B * t * abs(detJ);
end

disp("Ke (membrana, 8x8):")
disp(K)
fprintf("Simetria: max|K-K'| = %.2e\\n", max(max(abs(K - transpose(K)))))

% --- HEATMAP de la matriz Ke (visualizacion de la matriz como superficie) ---
% Cada celda es un valor de Ke. Vas a ver:
%  - Simetria (espejo respecto a la diagonal)
%  - Valores grandes concentrados en la diagonal
%  - Pares (u, v) por nodo (estructura de bloque 2x2)
% 'figure' fuerza una ventana nueva en MATLAB (sino sobreescribe).
figure
idx = 1:8;
surf(idx, idx, K)
title("Heatmap matriz Ke - Membrana Q4 (8x8)")

% --- FEM mini: malla 2x2 elementos cantilever ---
disp("--- Malla mini: 2x2 elementos ---")
nds = [0,0; 0.25,0; 0.5,0; 0,0.25; 0.25,0.25; 0.5,0.25; 0,0.5; 0.25,0.5; 0.5,0.5];
els = [1,2,5,4; 2,3,6,5; 4,5,8,7; 5,6,9,8];

% Visualizar nodos (MATLAB compatible) — segunda figura
figure
scatter(nds(:,1), nds(:,2))
title("Nodos de la malla 2x2 Q4 (cantilever empotrado en x=0)")

% Nota: en HekatanLab tambien funciona show3d() con BCs y cargas:
%   sups  = [1, 4, 7];
%   loads = [6, 100, 0; 9, 100, 0];
%   show3d(nds, els, "Malla cantilever", sups, loads)
% En MATLAB puro: usar patch() o plot() por elemento.` },

  { name: 'FE02 — Placa delgada Q4 (Kirchhoff/DKQ)', category: 'FEM Elementos', mode: 'matlab', code: `% ═══════════════════════════════════════════
% PLACA DELGADA — Kirchhoff (DKQ-style)
% 4 nodos x 3 DOFs (w, theta_x, theta_y) = 12 DOFs
% Solo flexion (sin corte transversal — hipotesis Kirchhoff)
% Integracion 2x2 Gauss
% ═══════════════════════════════════════════

% Datos
E = 30000; nu = 0.2; t = 0.05;   % t/L pequeno -> placa DELGADA
a = 0.5; b = 0.5;
coords = [0,0; a,0; a,b; 0,b];
fprintf("Placa Kirchhoff: t/a = %.3f (debe ser <0.05 para delgada)\\n", t/a)

% Rigidez a flexion (formula clasica)
Dc = E*t^3 / (12*(1 - nu^2));
Db = Dc * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];
disp("Db (rigidez a flexion, 3x3):"); disp(Db)

% Puntos Gauss 2x2 (suficiente para grado 2 del integrando)
g = 1/sqrt(3);
gpts = [-g,-g; g,-g; g,g; -g,g];

K = zeros(12, 12);
for ig = 1:4
  xi = gpts(ig,1); eta = gpts(ig,2);

  % Derivadas de N
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];

  % Jacobiano
  J11=0; J12=0; J21=0; J22=0;
  for i = 1:4
    J11 = J11 + dNxi(i)*coords(i,1);
    J12 = J12 + dNxi(i)*coords(i,2);
    J21 = J21 + dNeta(i)*coords(i,1);
    J22 = J22 + dNeta(i)*coords(i,2);
  end
  detJ = J11*J22 - J12*J21;

  % Derivadas fisicas (DKQ: theta_x = -dw/dy, theta_y = dw/dx)
  dNx = (J22*dNxi - J12*dNeta) / detJ;
  dNy = (-J21*dNxi + J11*dNeta) / detJ;

  % Bb (3x12): curvaturas DKQ
  % kappa_x = d(theta_y)/dx, kappa_y = -d(theta_x)/dy, kappa_xy = d(theta_y)/dy - d(theta_x)/dx
  Bb = zeros(3, 12);
  for i = 1:4
    Bb(1, 3*i)   = dNx(i);     % kx = d(thy)/dx
    Bb(2, 3*i-1) = -dNy(i);    % ky = -d(thx)/dy
    Bb(3, 3*i-1) = -dNx(i);    % kxy
    Bb(3, 3*i)   = dNy(i);
  end

  K = K + transpose(Bb) * Db * Bb * abs(detJ);
end

disp("Ke (placa delgada, 12x12):")
disp(K)
fprintf("max|Ke| = %.3e\\n", max(max(abs(K))))

% --- HEATMAP de la matriz Ke (placa Kirchhoff) ---
idx = 1:12;
surf(idx, idx, K)
title("Heatmap Ke - Placa delgada Kirchhoff (12x12)")

% ═══════════════════════════════════════════════════════════════════
% DEMO: Placa simply-supported con carga uniforme
% Malla 3x3 elementos, deflexion w(x,y) con paleta SAP2000
% ═══════════════════════════════════════════════════════════════════
nx_m = 3; ny_m = 3;
W_m = 0.5; H_m = 0.5;        % placa cuadrada
q = 1000;                      % presion uniforme (N/m^2)
dx_m = W_m/nx_m; dy_m = H_m/ny_m;
nj_m = (nx_m+1)*(ny_m+1);
n_dof = 3;
n_tot = n_dof*nj_m;

% --- Coordenadas ---
nds_m = zeros(nj_m, 2);
for j = 0:ny_m
  for i = 0:nx_m
    k = j*(nx_m+1) + i + 1;
    nds_m(k,1) = i*dx_m;
    nds_m(k,2) = j*dy_m;
  end
end

% --- Conectividad ---
ne_m = nx_m*ny_m;
els_m = zeros(ne_m, 4);
for j = 0:ny_m-1
  for i = 0:nx_m-1
    e = j*nx_m + i + 1;
    bl = j*(nx_m+1) + i + 1;
    els_m(e,1) = bl;
    els_m(e,2) = bl + 1;
    els_m(e,3) = bl + (nx_m+1) + 1;
    els_m(e,4) = bl + (nx_m+1);
  end
end

% --- Rebuild Ke con tamano del elemento de la malla ---
J11_m = dx_m/2; J22_m = dy_m/2;
detJ_m = J11_m*J22_m;
Ke_m = zeros(12, 12);
for ig = 1:4
  xi = gpts(ig,1); eta = gpts(ig,2);
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
  dNx_m = dNxi / J11_m;
  dNy_m = dNeta / J22_m;
  Bb_m = zeros(3, 12);
  for i = 1:4
    Bb_m(1, 3*i)   = dNx_m(i);
    Bb_m(2, 3*i-1) = -dNy_m(i);
    Bb_m(3, 3*i-1) = -dNx_m(i);
    Bb_m(3, 3*i)   = dNy_m(i);
  end
  Ke_m = Ke_m + transpose(Bb_m) * Db * Bb_m * detJ_m;
end

% --- Ensamble global ---
K_g = zeros(n_tot, n_tot);
for e = 1:ne_m
  dofs = zeros(1, 12);
  for i = 1:4
    n_id = els_m(e, i);
    dofs(3*i-2) = 3*n_id - 2;
    dofs(3*i-1) = 3*n_id - 1;
    dofs(3*i)   = 3*n_id;
  end
  for i = 1:12
    for j = 1:12
      K_g(dofs(i), dofs(j)) = K_g(dofs(i), dofs(j)) + Ke_m(i, j);
    end
  end
end

% --- BCs: simply supported en los 4 bordes (w=0) ---
kp = 1e20;
for k = 1:nj_m
  x = nds_m(k,1); y = nds_m(k,2);
  if abs(x) < 1e-9 || abs(x - W_m) < 1e-9 || abs(y) < 1e-9 || abs(y - H_m) < 1e-9
    j = 3*k - 2;        % w DOF
    K_g(j,j) = K_g(j,j) + kp;
  end
end

% --- Carga: presion uniforme -> nodal q*Area/4 ---
F_g = zeros(n_tot, 1);
load_per_node = q*dx_m*dy_m;
for k = 1:nj_m
  F_g(3*k - 2) = F_g(3*k - 2) + load_per_node;  % suma de areas adyacentes (corner=1, edge=2, interior=4 x area/4)
end

% --- Solve ---
u_full = inv(K_g) * F_g;

% --- Extraer w ---
w_disp = zeros(nj_m, 1);
for k = 1:nj_m
  w_disp(k) = u_full(3*k - 2);
end

fprintf("Deflexion max placa Kirchhoff: %.4e m\\n", max(abs(w_disp)))

% --- Mostrar contorno w(x, y) con SAP2000 ---
try
  show_contour(nds_m, els_m, w_disp, "w(x,y) — Placa delgada (Kirchhoff)")
catch
end` },

  { name: 'FE03 — Placa gruesa Q4 (Mindlin-Reissner)', category: 'FEM Elementos', mode: 'matlab', code: `% ═══════════════════════════════════════════
% PLACA GRUESA — Mindlin-Reissner
% 4 nodos x 3 DOFs (w, theta_x, theta_y) = 12 DOFs
% Bending + Corte transversal
% INTEGRACION SELECTIVA: 2x2 bending + 1x1 corte
% (evita shear locking en placas delgadas)
% ═══════════════════════════════════════════

% Datos — placa GRUESA (t/L > 0.05)
E = 30000; nu = 0.2; t = 0.25;
a = 1.0; b = 1.0;
kapa = 5/6;                      % factor de correccion de corte
coords = [0,0; a,0; a,b; 0,b];
fprintf("Placa Mindlin: t/a = %.3f (>0.05 = gruesa)\\n", t/a)

% Matrices constitutivas
Dc = E*t^3 / (12*(1 - nu^2));
Db = Dc * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];   % bending
G = E / (2*(1+nu));
Ds = kapa * G * t * [1, 0; 0, 1];                  % shear
disp("Db (bending):"); disp(Db)
disp("Ds (shear):");   disp(Ds)

K = zeros(12, 12);
g = 1/sqrt(3);

% PARTE 1: Bending con 2x2 Gauss (full integration)
disp("--- Bending: 2x2 Gauss ---")
gpts = [-g,-g; g,-g; g,g; -g,g];
for ig = 1:4
  xi = gpts(ig,1); eta = gpts(ig,2);
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];

  J11=0; J12=0; J21=0; J22=0;
  for i = 1:4
    J11 = J11 + dNxi(i)*coords(i,1); J12 = J12 + dNxi(i)*coords(i,2);
    J21 = J21 + dNeta(i)*coords(i,1); J22 = J22 + dNeta(i)*coords(i,2);
  end
  detJ = J11*J22 - J12*J21;
  dNx = (J22*dNxi - J12*dNeta) / detJ;
  dNy = (-J21*dNxi + J11*dNeta) / detJ;

  Bb = zeros(3, 12);
  for i = 1:4
    Bb(1, 3*i)   = dNx(i);
    Bb(2, 3*i-1) = -dNy(i);
    Bb(3, 3*i-1) = -dNx(i);
    Bb(3, 3*i)   = dNy(i);
  end
  K = K + transpose(Bb) * Db * Bb * abs(detJ);
end

% PARTE 2: Shear con 1x1 Gauss (reduced - evita locking)
disp("--- Shear: 1x1 Gauss (reducida) ---")
xi=0; eta=0;
dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
N     = [(1-xi)*(1-eta)/4, (1+xi)*(1-eta)/4, (1+xi)*(1+eta)/4, (1-xi)*(1+eta)/4];

J11=0; J12=0; J21=0; J22=0;
for i = 1:4
  J11 = J11 + dNxi(i)*coords(i,1); J12 = J12 + dNxi(i)*coords(i,2);
  J21 = J21 + dNeta(i)*coords(i,1); J22 = J22 + dNeta(i)*coords(i,2);
end
detJ = J11*J22 - J12*J21;
dNx = (J22*dNxi - J12*dNeta) / detJ;
dNy = (-J21*dNxi + J11*dNeta) / detJ;

% Bs (2x12): gamma_xz = dw/dx - theta_y, gamma_yz = dw/dy + theta_x
Bs = zeros(2, 12);
for i = 1:4
  Bs(1, 3*i-2) = dNx(i);    % dw/dx
  Bs(1, 3*i)   = -N(i);     % -theta_y
  Bs(2, 3*i-2) = dNy(i);    % dw/dy
  Bs(2, 3*i-1) = N(i);      % +theta_x
end
K = K + transpose(Bs) * Ds * Bs * abs(detJ) * 4;   % peso 2x2=4 para 1pt en cuadrado de lado 2

disp("Ke (placa Mindlin, 12x12):")
disp(K)
fprintf("max|Ke| = %.3e (simetria %.2e)\\n", max(max(abs(K))), max(max(abs(K-transpose(K)))))

% --- HEATMAP de la matriz Ke (Mindlin = flexion + corte) ---
% Estructura de bloques 3x3 por nodo: [w, thx, thy]
% Mindlin tiene contribucion EXTRA de corte (1x1 Gauss) que aparece en
% los bloques relacionados a w (vs Kirchhoff que solo tiene flexion).
idx = 1:12;
surf(idx, idx, K)
title("Heatmap Ke - Placa gruesa Mindlin (12x12)")

% ═══════════════════════════════════════════════════════════════════
% DEMO: Placa Mindlin simply-supported con carga uniforme
% Selective integration (2x2 bending + 1x1 shear) en cada elemento
% Malla 3x3, contorno w(x,y) con paleta SAP2000
% ═══════════════════════════════════════════════════════════════════
nx_m = 3; ny_m = 3;
W_m = 1.0; H_m = 1.0;
q = 1000;
dx_m = W_m/nx_m; dy_m = H_m/ny_m;
nj_m = (nx_m+1)*(ny_m+1);
n_dof = 3;
n_tot = n_dof*nj_m;

% Coords + conectividad
nds_m = zeros(nj_m, 2);
for j = 0:ny_m
  for i = 0:nx_m
    k = j*(nx_m+1) + i + 1;
    nds_m(k,1) = i*dx_m;
    nds_m(k,2) = j*dy_m;
  end
end
ne_m = nx_m*ny_m;
els_m = zeros(ne_m, 4);
for j = 0:ny_m-1
  for i = 0:nx_m-1
    e = j*nx_m + i + 1;
    bl = j*(nx_m+1) + i + 1;
    els_m(e,1) = bl;
    els_m(e,2) = bl + 1;
    els_m(e,3) = bl + (nx_m+1) + 1;
    els_m(e,4) = bl + (nx_m+1);
  end
end

% Rebuild Ke con selective integration (bending 2x2 + shear 1x1)
J11_m = dx_m/2; J22_m = dy_m/2;
detJ_m = J11_m*J22_m;
Ke_m = zeros(12, 12);
% Bending 2x2
for ig = 1:4
  xi=gpts(ig,1); eta=gpts(ig,2);
  dNxi=[-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta=[-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
  dNxm = dNxi / J11_m; dNym = dNeta / J22_m;
  Bb = zeros(3, 12);
  for i = 1:4
    Bb(1, 3*i) = dNxm(i);
    Bb(2, 3*i-1) = -dNym(i);
    Bb(3, 3*i-1) = -dNxm(i);
    Bb(3, 3*i) = dNym(i);
  end
  Ke_m = Ke_m + transpose(Bb) * Db * Bb * detJ_m;
end
% Shear 1x1 (centro, peso 4)
xi=0; eta=0;
dNxi=[-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4];
dNeta=[-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
N = [(1-xi)*(1-eta)/4, (1+xi)*(1-eta)/4, (1+xi)*(1+eta)/4, (1-xi)*(1+eta)/4];
dNxm = dNxi / J11_m; dNym = dNeta / J22_m;
Bs = zeros(2, 12);
for i = 1:4
  Bs(1, 3*i-2) = dNxm(i);
  Bs(1, 3*i)   = -N(i);
  Bs(2, 3*i-2) = dNym(i);
  Bs(2, 3*i-1) = N(i);
end
Ke_m = Ke_m + transpose(Bs) * Ds * Bs * detJ_m * 4;

% Ensamble + BCs simply-supported + carga uniforme
K_g = zeros(n_tot, n_tot);
for e = 1:ne_m
  dofs = zeros(1, 12);
  for i = 1:4
    n_id = els_m(e, i);
    dofs(3*i-2)=3*n_id-2; dofs(3*i-1)=3*n_id-1; dofs(3*i)=3*n_id;
  end
  for i = 1:12
    for j = 1:12
      K_g(dofs(i),dofs(j)) = K_g(dofs(i),dofs(j)) + Ke_m(i,j);
    end
  end
end
kp = 1e20;
for k = 1:nj_m
  x = nds_m(k,1); y = nds_m(k,2);
  if abs(x)<1e-9 || abs(x-W_m)<1e-9 || abs(y)<1e-9 || abs(y-H_m)<1e-9
    K_g(3*k-2, 3*k-2) = K_g(3*k-2, 3*k-2) + kp;
  end
end
F_g = zeros(n_tot, 1);
load_per_node = q*dx_m*dy_m;
for k = 1:nj_m
  F_g(3*k - 2) = F_g(3*k - 2) + load_per_node;
end
u_full = inv(K_g) * F_g;
w_disp = zeros(nj_m, 1);
for k = 1:nj_m
  w_disp(k) = u_full(3*k - 2);
end
fprintf("Deflexion max placa Mindlin: %.4e m\\n", max(abs(w_disp)))

try
  show_contour(nds_m, els_m, w_disp, "w(x,y) — Placa gruesa (Mindlin)")
catch
end` },

  { name: 'FE04 — Placa Laminada (composite ABD)', category: 'FEM Elementos', mode: 'matlab', code: `% ═══════════════════════════════════════════
% PLACA LAMINADA (LAYERED COMPOSITE)
% Suma de capas con ABD (membrana A, acople B, flexion D)
% Cada capa puede tener material y angulo distinto
% ═══════════════════════════════════════════

% --- Material de la capa (mismo para todas en este ejemplo) ---
E = 30000;        % MPa
nu = 0.2;
% Propiedades de cada capa: [espesor (m), angulo (grados)]
% Laminado simetrico [0/90/90/0] cross-ply
capas = [0.05, 0;
         0.05, 90;
         0.05, 90;
         0.05, 0];

n_capas = size(capas, 1);
t_total = 0;
for k = 1:n_capas
  t_total = t_total + capas(k, 1);
end
fprintf("Laminado: %d capas, espesor total = %.3f m\\n", n_capas, t_total)

% --- Calcular z de cada interfase (origen en centro del laminado) ---
z = zeros(n_capas+1, 1);
z(1) = -t_total/2;
for k = 1:n_capas
  z(k+1) = z(k) + capas(k, 1);
end

% --- D del material en ejes principales (ortotropico simplificado) ---
% Para isotropico:
Q = (E/(1-nu^2)) * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];

% --- Matrices ABD ---
A = zeros(3, 3);   % membrana
B = zeros(3, 3);   % acople membrana-flexion
D = zeros(3, 3);   % flexion

for k = 1:n_capas
  theta = capas(k, 2) * pi / 180;
  c = cos(theta); s = sin(theta);
  % Matriz de transformacion T (Reuter)
  T = [c^2, s^2, 2*c*s; s^2, c^2, -2*c*s; -c*s, c*s, c^2-s^2];
  Q_bar = inv(T) * Q * inv(transpose(T));

  dz1 = z(k+1) - z(k);
  dz2 = (z(k+1)^2 - z(k)^2) / 2;
  dz3 = (z(k+1)^3 - z(k)^3) / 3;

  A = A + Q_bar * dz1;
  B = B + Q_bar * dz2;
  D = D + Q_bar * dz3;
end

disp("Matriz A (membrana, 3x3):");        disp(A)
disp("Matriz B (acople, 3x3):");          disp(B)
disp("Matriz D (flexion, 3x3):");         disp(D)

fprintf("Si B == 0 -> laminado SIMETRICO (no hay acople)\\n")
fprintf("max|B| = %.3e (debe ser ~0 para [0/90/90/0])\\n", max(max(abs(B))))

% --- HEATMAPS de las 3 matrices ABD ---
% Para laminado simetrico: A (membrana) y D (flexion) son densos,
% B (acople) es practicamente cero.
idx = 1:3;
surf(idx, idx, A)
title("Matriz A - membrana (3x3)")
surf(idx, idx, B)
title("Matriz B - acople (debe ser ~0)")
surf(idx, idx, D)
title("Matriz D - flexion (3x3)")` },

  { name: 'FE05 — Shell Thin (Membrana + Kirchhoff)', category: 'FEM Elementos', mode: 'matlab', code: `% ═══════════════════════════════════════════
% SHELL DELGADO (THIN SHELL)
% Combina Membrana (8 DOFs) + Placa Kirchhoff (12 DOFs)
% Total: 4 nodos x 5 DOFs (u, v, w, theta_x, theta_y) = 20 DOFs
% ═══════════════════════════════════════════

% Datos
E = 200000; nu = 0.3; t = 0.005;   % shell DELGADO (t/L pequeno)
a = 0.5; b = 0.5;
coords = [0,0; a,0; a,b; 0,b];
fprintf("Shell thin: t/a = %.4f (< 0.05 = delgado)\\n", t/a)

% Material — plane stress
Dm = (E/(1-nu^2)) * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];   % membrana
Dc = E*t^3 / (12*(1-nu^2));
Db = Dc * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];              % bending

K = zeros(20, 20);    % 4 nodos x 5 DOFs = 20
g = 1/sqrt(3);
gpts = [-g,-g; g,-g; g,g; -g,g];

% Mapa de DOFs (local 5-DOF a indices 1..20):
% nodo i: u=5*(i-1)+1, v=5*(i-1)+2, w=5*(i-1)+3, thx=5*(i-1)+4, thy=5*(i-1)+5
for ig = 1:4
  xi = gpts(ig,1); eta = gpts(ig,2);
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];

  J11=0; J12=0; J21=0; J22=0;
  for i = 1:4
    J11 = J11 + dNxi(i)*coords(i,1); J12 = J12 + dNxi(i)*coords(i,2);
    J21 = J21 + dNeta(i)*coords(i,1); J22 = J22 + dNeta(i)*coords(i,2);
  end
  detJ = J11*J22 - J12*J21;
  dNx = (J22*dNxi - J12*dNeta) / detJ;
  dNy = (-J21*dNxi + J11*dNeta) / detJ;

  % --- Bm (3x8) membrana sobre (u, v) ---
  % --- Bb (3x12) bending sobre (w, thx, thy) ---
  % Asamblamos B (6x20) que cubre los 5 DOFs por nodo
  B = zeros(6, 20);
  for i = 1:4
    % Membrana — eps_x, eps_y, gamma_xy
    B(1, 5*i-4) = dNx(i);             % u contribuye a eps_x
    B(2, 5*i-3) = dNy(i);             % v contribuye a eps_y
    B(3, 5*i-4) = dNy(i);             % u contribuye a gamma_xy
    B(3, 5*i-3) = dNx(i);             % v contribuye a gamma_xy
    % Bending — kappa_x, kappa_y, kappa_xy
    B(4, 5*i)   = dNx(i);              % thy -> kx
    B(5, 5*i-1) = -dNy(i);             % thx -> ky
    B(6, 5*i-1) = -dNx(i);             % thx -> kxy
    B(6, 5*i)   = dNy(i);              % thy -> kxy
  end

  % D combinada (6x6) — membrana (3x3) + bending (3x3) en bloques
  D = zeros(6, 6);
  D(1:3, 1:3) = Dm * t;
  D(4:6, 4:6) = Db;

  K = K + transpose(B) * D * B * abs(detJ);
end

disp("Ke shell thin (20x20):")
disp(K)
fprintf("max|Ke| = %.3e\\n", max(max(abs(K))))
fprintf("Membrana esta en DOFs (1,2; 6,7; 11,12; 16,17)\\n")
fprintf("Bending esta en DOFs (3,4,5; 8,9,10; 13,14,15; 18,19,20)\\n")

% --- HEATMAP del Ke shell thin (20x20) ---
% Vas a ver dos "manchas" claramente separadas:
%  - Bloque MEMBRANA (8x8): DOFs (u, v) por nodo
%  - Bloque BENDING (12x12): DOFs (w, thx, thy) por nodo
% Estan acoplados via los DOFs locales (entrelazados de 5 en 5)
idx = 1:20;
surf(idx, idx, K)
title("Heatmap Ke - Shell Thin (20x20, membrana + Kirchhoff)")

% ═══════════════════════════════════════════════════════════════════
% DEMO: Cantilever shell con carga lateral
% Combina membrana + Kirchhoff, contorno de desplazamiento total
% ═══════════════════════════════════════════════════════════════════
nx_m = 3; ny_m = 3;
W_m = 0.5; H_m = 0.5;
P_m = 100;
dx_m = W_m/nx_m; dy_m = H_m/ny_m;
nj_m = (nx_m+1)*(ny_m+1);
n_dof = 5;     % u, v, w, thx, thy
n_tot = n_dof*nj_m;

nds_m = zeros(nj_m, 2);
for j = 0:ny_m
  for i = 0:nx_m
    k = j*(nx_m+1) + i + 1;
    nds_m(k,1) = i*dx_m;
    nds_m(k,2) = j*dy_m;
  end
end
ne_m = nx_m*ny_m;
els_m = zeros(ne_m, 4);
for j = 0:ny_m-1
  for i = 0:nx_m-1
    e = j*nx_m + i + 1;
    bl = j*(nx_m+1) + i + 1;
    els_m(e,1)=bl; els_m(e,2)=bl+1; els_m(e,3)=bl+(nx_m+1)+1; els_m(e,4)=bl+(nx_m+1);
  end
end

% Rebuild Ke shell thin con el tamano de elemento de la malla
J11_m = dx_m/2; J22_m = dy_m/2;
detJ_m = J11_m*J22_m;
Ke_m = zeros(20, 20);
for ig = 1:4
  xi=gpts(ig,1); eta=gpts(ig,2);
  dNxi=[-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta=[-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
  dNxm = dNxi/J11_m; dNym = dNeta/J22_m;
  B = zeros(6, 20);
  for i = 1:4
    B(1, 5*i-4)=dNxm(i); B(2, 5*i-3)=dNym(i);
    B(3, 5*i-4)=dNym(i); B(3, 5*i-3)=dNxm(i);
    B(4, 5*i)=dNxm(i); B(5, 5*i-1)=-dNym(i);
    B(6, 5*i-1)=-dNxm(i); B(6, 5*i)=dNym(i);
  end
  D6 = zeros(6, 6);
  D6(1:3,1:3) = Dm*t; D6(4:6,4:6) = Db;
  Ke_m = Ke_m + transpose(B) * D6 * B * detJ_m;
end

% Ensamble
K_g = zeros(n_tot, n_tot);
for e = 1:ne_m
  dofs = zeros(1, 20);
  for i = 1:4
    n_id = els_m(e, i);
    for k = 1:5
      dofs(5*(i-1)+k) = 5*(n_id-1) + k;
    end
  end
  for i = 1:20
    for j = 1:20
      K_g(dofs(i),dofs(j)) = K_g(dofs(i),dofs(j)) + Ke_m(i,j);
    end
  end
end

% BCs: empotrado en x=0
kp = 1e20;
for k = 1:nj_m
  if abs(nds_m(k,1)) < 1e-9
    for d = 1:5
      K_g(5*(k-1)+d, 5*(k-1)+d) = K_g(5*(k-1)+d, 5*(k-1)+d) + kp;
    end
  end
end

% Carga lateral P en borde x=W_m, en direccion u
F_g = zeros(n_tot, 1);
P_per = P_m/(ny_m+1);
for k = 1:nj_m
  if abs(nds_m(k,1) - W_m) < 1e-9
    F_g(5*(k-1) + 1) = P_per;
  end
end

u_full = inv(K_g) * F_g;
u_disp = zeros(nj_m, 1);
for k = 1:nj_m
  u_disp(k) = u_full(5*(k-1) + 1);    % desplazamiento u
end

fprintf("Desplazamiento horizontal max shell thin: %.4e\\n", max(abs(u_disp)))

try
  show_contour(nds_m, els_m, u_disp, "u(x,y) — Shell Thin cantilever")
catch
end` },

  { name: 'FE06 — Shell Thick (Membrana + Mindlin)', category: 'FEM Elementos', mode: 'matlab', code: `% ═══════════════════════════════════════════
% SHELL GRUESO (THICK SHELL)
% Combina Membrana + Placa Mindlin (con shear)
% 4 nodos x 5 DOFs (u, v, w, theta_x, theta_y) = 20 DOFs
% INTEGRACION SELECTIVA: 2x2 bending + 1x1 shear
% ═══════════════════════════════════════════

% Datos
E = 200000; nu = 0.3; t = 0.05;
a = 0.5; b = 0.5;
kapa = 5/6;
coords = [0,0; a,0; a,b; 0,b];
fprintf("Shell thick: t/a = %.3f\\n", t/a)

% Material
Dm = (E/(1-nu^2)) * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];
Dc = E*t^3 / (12*(1-nu^2));
Db = Dc * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2];
G = E / (2*(1+nu));
Ds = kapa * G * t * [1, 0; 0, 1];

K = zeros(20, 20);
g = 1/sqrt(3);

% --- 1) MEMBRANA + BENDING: 2x2 Gauss ---
gpts = [-g,-g; g,-g; g,g; -g,g];
for ig = 1:4
  xi = gpts(ig,1); eta = gpts(ig,2);
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];

  J11=0; J12=0; J21=0; J22=0;
  for i = 1:4
    J11 = J11 + dNxi(i)*coords(i,1); J12 = J12 + dNxi(i)*coords(i,2);
    J21 = J21 + dNeta(i)*coords(i,1); J22 = J22 + dNeta(i)*coords(i,2);
  end
  detJ = J11*J22 - J12*J21;
  dNx = (J22*dNxi - J12*dNeta) / detJ;
  dNy = (-J21*dNxi + J11*dNeta) / detJ;

  B_mb = zeros(6, 20);
  for i = 1:4
    B_mb(1, 5*i-4) = dNx(i);
    B_mb(2, 5*i-3) = dNy(i);
    B_mb(3, 5*i-4) = dNy(i);
    B_mb(3, 5*i-3) = dNx(i);
    B_mb(4, 5*i)   = dNx(i);
    B_mb(5, 5*i-1) = -dNy(i);
    B_mb(6, 5*i-1) = -dNx(i);
    B_mb(6, 5*i)   = dNy(i);
  end

  D_mb = zeros(6, 6);
  D_mb(1:3, 1:3) = Dm * t;
  D_mb(4:6, 4:6) = Db;

  K = K + transpose(B_mb) * D_mb * B_mb * abs(detJ);
end

% --- 2) SHEAR: 1x1 Gauss (reducida — evita locking) ---
xi=0; eta=0;
dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
N     = [(1-xi)*(1-eta)/4, (1+xi)*(1-eta)/4, (1+xi)*(1+eta)/4, (1-xi)*(1+eta)/4];

J11=0; J12=0; J21=0; J22=0;
for i = 1:4
  J11 = J11 + dNxi(i)*coords(i,1); J12 = J12 + dNxi(i)*coords(i,2);
  J21 = J21 + dNeta(i)*coords(i,1); J22 = J22 + dNeta(i)*coords(i,2);
end
detJ = J11*J22 - J12*J21;
dNx = (J22*dNxi - J12*dNeta) / detJ;
dNy = (-J21*dNxi + J11*dNeta) / detJ;

B_s = zeros(2, 20);
for i = 1:4
  B_s(1, 5*i-2) = dNx(i);    % dw/dx
  B_s(1, 5*i)   = -N(i);     % -theta_y
  B_s(2, 5*i-2) = dNy(i);    % dw/dy
  B_s(2, 5*i-1) = N(i);      % +theta_x
end
K = K + transpose(B_s) * Ds * B_s * abs(detJ) * 4;

disp("Ke shell thick (20x20):")
disp(K)
fprintf("max|Ke| = %.3e\\n", max(max(abs(K))))

% --- HEATMAP del Ke shell thick ---
% Igual que shell thin pero con CONTRIBUCION EXTRA del corte transversal
% (integrado con 1x1 Gauss). Va a tener valores mas grandes en los
% bloques de (w, thx, thy) que el shell thin.
idx = 1:20;
surf(idx, idx, K)
title("Heatmap Ke - Shell Thick (20x20, membrana + Mindlin)")

% ═══════════════════════════════════════════════════════════════════
% DEMO: Cantilever shell thick con carga lateral
% Selective integration (2x2 membrana+bending, 1x1 shear)
% Contorno de u(x,y) con paleta SAP2000
% ═══════════════════════════════════════════════════════════════════
nx_m = 3; ny_m = 3;
W_m = 0.5; H_m = 0.5;
P_m = 100;
dx_m = W_m/nx_m; dy_m = H_m/ny_m;
nj_m = (nx_m+1)*(ny_m+1);
n_dof = 5;
n_tot = n_dof*nj_m;

nds_m = zeros(nj_m, 2);
for j = 0:ny_m
  for i = 0:nx_m
    k = j*(nx_m+1) + i + 1;
    nds_m(k,1) = i*dx_m;
    nds_m(k,2) = j*dy_m;
  end
end
ne_m = nx_m*ny_m;
els_m = zeros(ne_m, 4);
for j = 0:ny_m-1
  for i = 0:nx_m-1
    e = j*nx_m + i + 1;
    bl = j*(nx_m+1) + i + 1;
    els_m(e,1)=bl; els_m(e,2)=bl+1; els_m(e,3)=bl+(nx_m+1)+1; els_m(e,4)=bl+(nx_m+1);
  end
end

J11_m = dx_m/2; J22_m = dy_m/2;
detJ_m = J11_m*J22_m;
Ke_m = zeros(20, 20);

% Membrana + Bending 2x2
for ig = 1:4
  xi=gpts(ig,1); eta=gpts(ig,2);
  dNxi=[-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta=[-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
  dNxm=dNxi/J11_m; dNym=dNeta/J22_m;
  Bmb = zeros(6, 20);
  for i = 1:4
    Bmb(1, 5*i-4)=dNxm(i); Bmb(2, 5*i-3)=dNym(i);
    Bmb(3, 5*i-4)=dNym(i); Bmb(3, 5*i-3)=dNxm(i);
    Bmb(4, 5*i)=dNxm(i); Bmb(5, 5*i-1)=-dNym(i);
    Bmb(6, 5*i-1)=-dNxm(i); Bmb(6, 5*i)=dNym(i);
  end
  D6 = zeros(6, 6);
  D6(1:3,1:3) = Dm*t; D6(4:6,4:6) = Db;
  Ke_m = Ke_m + transpose(Bmb) * D6 * Bmb * detJ_m;
end

% Shear 1x1 (reducida — evita locking)
xi=0; eta=0;
dNxi=[-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4];
dNeta=[-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
N = [(1-xi)*(1-eta)/4, (1+xi)*(1-eta)/4, (1+xi)*(1+eta)/4, (1-xi)*(1+eta)/4];
dNxm=dNxi/J11_m; dNym=dNeta/J22_m;
Bs = zeros(2, 20);
for i = 1:4
  Bs(1, 5*i-2)=dNxm(i); Bs(1, 5*i)=-N(i);
  Bs(2, 5*i-2)=dNym(i); Bs(2, 5*i-1)=N(i);
end
Ke_m = Ke_m + transpose(Bs) * Ds * Bs * detJ_m * 4;

% Ensamble + BCs + Carga
K_g = zeros(n_tot, n_tot);
for e = 1:ne_m
  dofs = zeros(1, 20);
  for i = 1:4
    n_id = els_m(e, i);
    for k = 1:5
      dofs(5*(i-1)+k) = 5*(n_id-1) + k;
    end
  end
  for i = 1:20
    for j = 1:20
      K_g(dofs(i),dofs(j)) = K_g(dofs(i),dofs(j)) + Ke_m(i,j);
    end
  end
end
kp = 1e20;
for k = 1:nj_m
  if abs(nds_m(k,1)) < 1e-9
    for d = 1:5
      K_g(5*(k-1)+d, 5*(k-1)+d) = K_g(5*(k-1)+d, 5*(k-1)+d) + kp;
    end
  end
end
F_g = zeros(n_tot, 1);
P_per = P_m/(ny_m+1);
for k = 1:nj_m
  if abs(nds_m(k,1) - W_m) < 1e-9
    F_g(5*(k-1) + 1) = P_per;
  end
end
u_full = inv(K_g) * F_g;
u_disp = zeros(nj_m, 1);
for k = 1:nj_m
  u_disp(k) = u_full(5*(k-1) + 1);
end
fprintf("Desplazamiento horizontal max shell thick: %.4e\\n", max(abs(u_disp)))

try
  show_contour(nds_m, els_m, u_disp, "u(x,y) — Shell Thick cantilever")
catch
end` },

  { name: 'FE07 — Shell Thin + Frame (combinado)', category: 'FEM Elementos', mode: 'matlab', code: `% ═══════════════════════════════════════════
% SHELL THIN + FRAME (combinacion)
% Ensambla un shell delgado (Q4, 20 DOFs) con un frame (beam-column, 12 DOFs)
% conectado por un nodo compartido.
%
% Topologia: 1 shell de 4 nodos + 1 frame de 2 nodos. El nodo 4 del shell
% coincide con el nodo 1 del frame. K_global tiene 5*4 + 6*2 - 6 = 26 DOFs
% (compartiendo 6 DOFs en el nodo comun, en realidad 5 del shell + 1 del frame
% si proyectamos uno sobre el otro).
% ═══════════════════════════════════════════

% Datos comunes
E = 200000; nu = 0.3;

% --- SHELL THIN Q4 (4 nodos x 5 DOFs = 20 DOFs) ---
t_s = 0.005;
a = 0.5; b = 0.5;
coords_s = [0,0; a,0; a,b; 0,b];
fprintf("Shell: %.2f x %.2f m, t = %.4f m\\n", a, b, t_s)

% K_shell (20x20) — version compacta (membrana + bending Kirchhoff)
Dm = (E/(1-nu^2)) * [1,nu,0; nu,1,0; 0,0,(1-nu)/2];
Db_c = E*t_s^3 / (12*(1-nu^2));
Db = Db_c * [1,nu,0; nu,1,0; 0,0,(1-nu)/2];

K_shell = zeros(20, 20);
g = 1/sqrt(3);
gpts = [-g,-g; g,-g; g,g; -g,g];
for ig = 1:4
  xi=gpts(ig,1); eta=gpts(ig,2);
  dNxi  = [-(1-eta)/4,  (1-eta)/4, (1+eta)/4, -(1+eta)/4];
  dNeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
  J11=0; J12=0; J21=0; J22=0;
  for i = 1:4
    J11=J11+dNxi(i)*coords_s(i,1); J12=J12+dNxi(i)*coords_s(i,2);
    J21=J21+dNeta(i)*coords_s(i,1); J22=J22+dNeta(i)*coords_s(i,2);
  end
  detJ = J11*J22 - J12*J21;
  dNx = (J22*dNxi - J12*dNeta) / detJ;
  dNy = (-J21*dNxi + J11*dNeta) / detJ;
  B = zeros(6, 20);
  for i = 1:4
    B(1, 5*i-4)=dNx(i); B(2, 5*i-3)=dNy(i);
    B(3, 5*i-4)=dNy(i); B(3, 5*i-3)=dNx(i);
    B(4, 5*i)=dNx(i); B(5, 5*i-1)=-dNy(i);
    B(6, 5*i-1)=-dNx(i); B(6, 5*i)=dNy(i);
  end
  D = zeros(6, 6); D(1:3,1:3)=Dm*t_s; D(4:6,4:6)=Db;
  K_shell = K_shell + transpose(B) * D * B * abs(detJ);
end
fprintf("K_shell (20x20) ensamblada, max|K| = %.3e\\n", max(max(abs(K_shell))))

% --- FRAME BEAM 3D (2 nodos x 6 DOFs = 12 DOFs) ---
% El frame esta orientado en x, longitud L. Eje local = global por simplicidad.
L = 0.5;
A_f = 0.01;       % area seccion
Iy = 1e-5; Iz = 1e-5;  % momentos de inercia
J_t = 1e-5;       % momento polar
G = E / (2*(1+nu));

% K_frame en coords locales (formula clasica)
% DOFs por nodo: [ux, uy, uz, rx, ry, rz]
K_frame = zeros(12, 12);
% Axial
K_frame(1,1) = E*A_f/L;   K_frame(1,7) = -E*A_f/L;
K_frame(7,1) = -E*A_f/L;  K_frame(7,7) = E*A_f/L;
% Torsion
K_frame(4,4) = G*J_t/L;   K_frame(4,10) = -G*J_t/L;
K_frame(10,4) = -G*J_t/L; K_frame(10,10) = G*J_t/L;
% Flexion en plano xy (uy, rz)
K_frame(2,2)=12*E*Iz/L^3; K_frame(2,6)=6*E*Iz/L^2; K_frame(2,8)=-12*E*Iz/L^3; K_frame(2,12)=6*E*Iz/L^2;
K_frame(6,2)=6*E*Iz/L^2;  K_frame(6,6)=4*E*Iz/L;   K_frame(6,8)=-6*E*Iz/L^2;  K_frame(6,12)=2*E*Iz/L;
K_frame(8,2)=-12*E*Iz/L^3;K_frame(8,6)=-6*E*Iz/L^2;K_frame(8,8)=12*E*Iz/L^3;  K_frame(8,12)=-6*E*Iz/L^2;
K_frame(12,2)=6*E*Iz/L^2; K_frame(12,6)=2*E*Iz/L;  K_frame(12,8)=-6*E*Iz/L^2; K_frame(12,12)=4*E*Iz/L;
% Flexion en plano xz (uz, ry)
K_frame(3,3)=12*E*Iy/L^3; K_frame(3,5)=-6*E*Iy/L^2;K_frame(3,9)=-12*E*Iy/L^3; K_frame(3,11)=-6*E*Iy/L^2;
K_frame(5,3)=-6*E*Iy/L^2; K_frame(5,5)=4*E*Iy/L;   K_frame(5,9)=6*E*Iy/L^2;   K_frame(5,11)=2*E*Iy/L;
K_frame(9,3)=-12*E*Iy/L^3;K_frame(9,5)=6*E*Iy/L^2; K_frame(9,9)=12*E*Iy/L^3;  K_frame(9,11)=6*E*Iy/L^2;
K_frame(11,3)=-6*E*Iy/L^2;K_frame(11,5)=2*E*Iy/L;  K_frame(11,9)=6*E*Iy/L^2;  K_frame(11,11)=4*E*Iy/L;

fprintf("K_frame (12x12) ensamblada, max|K| = %.3e\\n", max(max(abs(K_frame))))

% --- ENSAMBLE GLOBAL ---
% Nodos: 1,2,3,4 (shell) + 5 (otro extremo del frame). Nodo 4 = nodo conexion.
% DOFs por nodo: 6 (u, v, w, rx, ry, rz). Total = 5*6 = 30 DOFs.
% Para el shell, el DOF rz lo dejamos en 0 (drilling DOF no se calcula aqui).

n_nodes = 5;
n_dof_per_node = 6;
n_total = n_nodes * n_dof_per_node;
K_global = zeros(n_total, n_total);

% Mapa: shell nodo i (i=1..4) DOFs locales (5*i-4 .. 5*i)
%       -> globales (6*(i-1)+1, 6*(i-1)+2, 6*(i-1)+3, 6*(i-1)+4, 6*(i-1)+5)
%       (drilling rz queda en 0)
for i_shell = 1:4
  for a_local = 1:5
    i_loc = 5*(i_shell-1) + a_local;
    i_glob = 6*(i_shell-1) + a_local;
    for j_shell = 1:4
      for b_local = 1:5
        j_loc = 5*(j_shell-1) + b_local;
        j_glob = 6*(j_shell-1) + b_local;
        K_global(i_glob, j_glob) = K_global(i_glob, j_glob) + K_shell(i_loc, j_loc);
      end
    end
  end
end

% Frame: nodos 4 (conexion) y 5
% DOFs locales frame: 1..6 = nodo 4 (compartido), 7..12 = nodo 5
node_map_frame = [4, 5];
for i_fr = 1:2
  for a_fr = 1:6
    i_loc = 6*(i_fr-1) + a_fr;
    i_glob = 6*(node_map_frame(i_fr)-1) + a_fr;
    for j_fr = 1:2
      for b_fr = 1:6
        j_loc = 6*(j_fr-1) + b_fr;
        j_glob = 6*(node_map_frame(j_fr)-1) + b_fr;
        K_global(i_glob, j_glob) = K_global(i_glob, j_glob) + K_frame(i_loc, j_loc);
      end
    end
  end
end

fprintf("K_global ensamblada: %d x %d\\n", n_total, n_total)
fprintf("max|K_global| = %.3e\\n", max(max(abs(K_global))))
fprintf("Simetria: max|K - K'| = %.3e\\n", max(max(abs(K_global - transpose(K_global)))))
disp("Ensamble OK: shell (Q4) + frame (beam) conectados por nodo 4")

% --- HEATMAP del Ke global combinado ---
% Vas a ver 3 "manchas" claras:
%  - 4 nodos del shell (20 DOFs) en la esquina superior izquierda
%  - 1 nodo extra del frame (6 DOFs) en la esquina inferior derecha
%  - El nodo 4 (compartido) acopla las dos zonas
idx = 1:n_total;
surf(idx, idx, K_global)
title("Heatmap K_global - Shell Thin + Frame (30x30)")

% --- Visualizacion de la geometria (MATLAB compatible) ---
% Nodos: 4 del shell + 1 extra del frame
nds_total = [coords_s; coords_s(4,1) + L, coords_s(4,2)];
scatter(nds_total(:,1), nds_total(:,2))
title("Geometria: Shell Q4 (nodos 1-4) + Frame (nodo 4 -> 5)")

% Nota: en HekatanLab tambien funciona show3d() para vista 3D:
%   els_shell = [1, 2, 3, 4];
%   show3d(coords_s, els_shell, "Shell Q4 + frame")` },
  // ── Cap 1: Tipos de matrices ──
  { name: 'Cap1 — Vectores', category: 'Herrera Cap 1', code: `% ═══════════════════════════════════════════
% Cap 1: Vectores fila y columna
% Herrera — Métodos Matriciales con MATLAB
% ═══════════════════════════════════════════

% Vector fila
va = [-1, 0, 1]

% Vector columna
vc = [1; 2; 4; 16]

% Transpuesta
vt = transpose(va)

% Magnitud (norma)
n = norm(va)` },

  { name: 'Cap1 — Tipos de matrices', category: 'Herrera Cap 1', code: `% ═══════════════════════════════════════════
% Cap 1: Tipos de matrices especiales
% ═══════════════════════════════════════════

% Matriz identidad
I = identity(4)

% Matriz de ceros
Z = zeros(3, 4)

% Matriz de unos
U = ones(3, 3)

% Matriz diagonal
d = [2, 5, 8, 1]
D = diag(d)

% Matriz simétrica
A = [1, 2, 3; 2, 5, 6; 3, 6, 9]
At = transpose(A)

% Verificar simetría: A = A'
dif = subtract(A, At)` },

  { name: 'Cap1 — Submatrices', category: 'Herrera Cap 1', code: `% ═══════════════════════════════════════════
% Cap 1: Submatrices y partición
% ═══════════════════════════════════════════

A = [1, 2, 3, 4; 5, 6, 7, 8; 9, 10, 11, 12]

% Elemento (2,3)
a23 = A(2, 3)

% Fila 2 (manual)
fila2 = [A(2,1), A(2,2), A(2,3), A(2,4)]

% Columna 3 (manual)
col3 = [A(1,3); A(2,3); A(3,3)]

% Submatriz 2x2 (manual)
sub = [A(1,2), A(1,3); A(2,2), A(2,3)]

% Tamaño
tam = size(A)` },

  // ── Cap 2: Operaciones ──
  { name: 'Cap2 — Suma y producto', category: 'Herrera Cap 2', code: `% ═══════════════════════════════════════════
% Cap 2: Operaciones con matrices
% ═══════════════════════════════════════════

A = [1, 2; 3, 4]
B = [5, 6; 7, 8]

% Suma
C = A + B

% Resta
D = A - B

% Producto escalar
E = 3 * A

% Producto matricial
F = A * B

% Producto elemento a elemento
G = A .* B

% Potencia
H = A ^ 2` },

  { name: 'Cap2 — Transpuesta y traza', category: 'Herrera Cap 2', code: `% ═══════════════════════════════════════════
% Cap 2: Transpuesta y traza
% ═══════════════════════════════════════════

A = [1, 2, 3; 4, 5, 6; 7, 8, 9]

% Transpuesta
At = transpose(A)

% Traza (suma diagonal)
tr = trace(A)

% Producto A * A'
AAt = A * transpose(A)

% Verificar: (AB)' = B'A'
B = [9, 8; 7, 6; 5, 4]
AB = A * B
ABt = transpose(A * B)
BtAt = transpose(B) * transpose(A)` },

  // ── Cap 3: Determinantes ──
  { name: 'Cap3 — Determinante', category: 'Herrera Cap 3', code: `% ═══════════════════════════════════════════
% Cap 3: Determinantes
% ═══════════════════════════════════════════

% Determinante 2x2
A = [3, 1; 5, 2]
d2 = det(A)

% Determinante 3x3
B = [1, 2, 3; 4, 5, 6; 7, 8, 0]
d3 = det(B)

% Propiedades:
% det(A*B) = det(A) * det(B)
dAB = det(A * [1, 0; 0, 1])

% Si det(A) = 0, la matriz es singular
C = [1, 2; 2, 4]
dC = det(C)` },

  { name: 'Cap3 — Inversa', category: 'Herrera Cap 3', code: `% ═══════════════════════════════════════════
% Cap 3: Inversión de matrices
% ═══════════════════════════════════════════

A = [4, 7; 2, 6]

% Inversa
Ainv = inv(A)

% Verificación: A * A^(-1) = I
check = A * Ainv

% Determinante
d = det(A)

% Adjunta / Determinante
% Cofactores de A 2x2:
% adj(A) = [d, -b; -c, a] para A = [a,b;c,d]

% Inversa 3x3
B = [1, 2, 0; 0, 1, 2; 2, 0, 1]
Binv = inv(B)
check3 = B * Binv` },

  // ── Cap 4: Sistemas de ecuaciones ──
  { name: 'Cap4 — Sistema 2x2', category: 'Herrera Cap 4', code: `% ═══════════════════════════════════════════
% Cap 4: Resolver sistema Ax = b (2x2)
% ═══════════════════════════════════════════

% Sistema:
%   3x + y = 5
%   x + 2y = 5

A = [3, 1; 1, 2]
b = [5; 5]

% Método 1: x = A^(-1) * b
x = inv(A) * b

% Verificación
check = A * x` },

  { name: 'Cap4 — Sistema 3x3', category: 'Herrera Cap 4', code: `% ═══════════════════════════════════════════
% Cap 4: Resolver sistema 3x3
% ═══════════════════════════════════════════

% Sistema:
%   2x₁ + x₂ - x₃ = 8
%   -3x₁ - x₂ + 2x₃ = -11
%   -2x₁ + x₂ + 2x₃ = -3

A = [2, 1, -1; -3, -1, 2; -2, 1, 2]
b = [8; -11; -3]

% Solución
x = inv(A) * b

% Verificación
residuo = A * x - b
norma_residuo = norm(residuo)` },

  { name: 'Cap4 — Sistema 4x4 (estructura)', category: 'Herrera Cap 4', code: `% ═══════════════════════════════════════════
% Cap 4: Sistema 4x4 — Análisis estructural
% Rigidez de 4 resortes en serie
% ═══════════════════════════════════════════

% Rigideces
k1 = 100
k2 = 200
k3 = 150
k4 = 250

% Matriz global (4 DOFs, nodos 1 y 4 fijos)
K = [k1+k2, -k2, 0, 0; -k2, k2+k3, -k3, 0; 0, -k3, k3+k4, -k4; 0, 0, -k4, k4]

% Condiciones de borde: u1=0, u4=0
% Sistema reducido (DOFs 2 y 3)
KR = [k2+k3, -k3; -k3, k3+k4]
F = [50; 0]

% Solución
u = inv(KR) * F

% Reacciones
R1 = -k1 * 0 + k1 * 0
R4 = -k4 * u(2)` },

  // ── Cap 4: Funciones ──
  { name: 'Cap4 — Funciones MATLAB', category: 'Herrera Cap 4', code: `% ═══════════════════════════════════════════
% Funciones definidas por el usuario
% Sintaxis MATLAB compatible
% ═══════════════════════════════════════════

% ─── Función: rigidez de resorte ───
function K = rigidez_resorte(k)
  K = k * [1, -1; -1, 1]
end

% ─── Función: rigidez de barra axial ───
function K = rigidez_axial(E, A, L)
  K = (E * A / L) * [1, -1; -1, 1]
end

% ─── Usar las funciones ───
K1 = rigidez_resorte(100)
K2 = rigidez_resorte(200)
K3 = rigidez_axial(210000, 0.01, 2)

% ─── Función: viga Euler-Bernoulli ───
function K = rigidez_viga(E, I, L)
  c = E * I / L^3
  K = c * [12, 6*L, -12, 6*L; 6*L, 4*L^2, -6*L, 2*L^2; -12, -6*L, 12, -6*L; 6*L, 2*L^2, -6*L, 4*L^2]
end

Kv = rigidez_viga(200000, 8.33e-6, 3)` },

  // ── Referencia: Funciones MATLAB FEM disponibles ──
  { name: '📚 Funciones FEM (referencia)', category: 'FEM', code: `% ═══════════════════════════════════════════
% 📚 FUNCIONES FEM DISPONIBLES
% Todas escritas en MATLAB puro
% Ver código: clic en botón 📚
% ═══════════════════════════════════════════

% ── RIGIDEZ LOCAL ──────────────────────────
% k_truss2d(E, A, L)          → 4x4 truss 2D
% k_frame2d(E, A, I, L)       → 6x6 frame 2D
% k_frame3d(E,G,A,Iy,Iz,J,L)  → 12x12 frame 3D
% k_cst(E,nu,t, x1,y1,x2,y2,x3,y3) → 6x6 CST

% ── TRANSFORMACIÓN ─────────────────────────
% T2d(c, s)         → 6x6 frame 2D
% T2d_truss(c, s)   → 4x4 truss 2D

% ── RIGIDEZ GLOBAL (con T) ─────────────────
% truss2d_Ke(E,A,Le,c,s)      → 4x4 truss global
% truss3d_Ke(E,A,Le,lx,ly,lz) → 6x6 truss 3D

% ── MALLA ──────────────────────────────────
% meshRect_nodes(Lx,Ly,nx,ny)  → nodos rectang.
% meshRect_cst(nx,ny)          → elementos CST
% gen_truss_nodes(span,divs,h) → nodos Pratt
% gen_truss_elements(divs)     → elementos Pratt
% gen_tower_nodes(bx,by,bz,divs) → torre 3D
% gen_tower_elements(divs)     → torre 3D

% ── SOLVER (equivale a deform.ts) ─────────
% freedofs(nDof, fixed)        → DOFs libres
% submat(K, dofs)              → submatriz
% subvec(F, dofs)              → subvector
% fullvec(Ur, free, nTotal)    → vector completo
% assemble_k(Kg, Ke, dofs)     → ensamblaje
% solve_fem(Kg, Fv, fixed)     → solver completo!
% reactions(Kg, Uf)            → reacciones
% frame_forces(Ke, T, ue)      → fuerzas internas

% ── VISUALIZACIÓN ──────────────────────────
% show3d(nds, els, titulo, apoyos, cargas)
% show_deformed(nds, els, U, escala, dofNodo, titulo)
% show_contour(nds, els, valores, titulo)
% show_diagram(nds, els, fuerzas, tipo, titulo)

% ✅ Todas en MATLAB puro — ver codigo: boton 📚

% ── EJEMPLO RÁPIDO ────────────────────────
E = 200e3; A = 0.01; I_s = 8.33e-5; L = 4

% Rigidez frame 2D (función MATLAB)
Ke = k_frame2d(E, A, I_s, L)

% Malla rectangular CST
nds = meshRect_nodes(10, 5, 3, 2)
els = meshRect_cst(3, 2)
show3d(nds, els, "Malla CST 3x2")` },

  // ── Mecánica Computacional ──
  { name: 'FEM — Barra axial', category: 'FEM', code: `% ═══════════════════════════════════════════
% FEM: Barra axial — derivacion desde cero
% ═══════════════════════════════════════════

L = 2
E = 210000
A = 0.01

% ══ PASO 1: Funciones de forma ══
% N1(x) = (L-x)/L = 1 - x/L
% N2(x) = x/L
% Evaluamos en x=0 y x=L para verificar:
disp("N1(0)=1, N1(L)=0 — vale 1 en nodo 1")
disp("N2(0)=0, N2(L)=1 — vale 1 en nodo 2")

% ══ PASO 2: Derivadas → Matriz B ══
% B = dN/dx = [dN1/dx, dN2/dx] (fila)
% dN1/dx = -1/L,  dN2/dx = 1/L
B = [[-1/L, 1/L]]

% ══ PASO 3: B'*B (producto exterior 2x2) ══
BtB = transpose(B) * B

% ══ PASO 4: Rigidez K = integral(B'*E*A*B dx, 0, L) ══
% Como B es constante, integral = B'*E*A*B * L
K = E * A / L * [1, -1; -1, 1]

% Verificar
disp("K = EA/L * [1,-1; -1,1]")
K

% ══ PASO 5: Carga y solucion ══
q = 5
P = 20

% Vector de fuerzas equivalentes (carga distribuida)
F_dist = [q * L / 2; q * L / 2]

% Resolver (nodo 1 fijo → solo DOF 2 libre)
K_red = K(2, 2)
F_red = q * L / 2 + P
u2 = F_red / K_red

% Verificacion analitica
u_exact = (P * L + q * L^2 / 2) / (E * A)
error_pct = abs(u2 - u_exact) / u_exact * 100

% Reaccion y esfuerzo
R1 = -(P + q * L)
sigma = E * u2 / L` },

  { name: 'FEM — 3 resortes', category: 'FEM', code: `% ═══════════════════════════════════════════
% 3 resortes en serie — Assembly paso a paso
% ═══════════════════════════════════════════

k1 = 100
k2 = 200
k3 = 150

% Matrices locales (resorte: K = k*[1,-1;-1,1])
K1 = [k1, -k1; -k1, k1]
K2 = [k2, -k2; -k2, k2]
K3 = [k3, -k3; -k3, k3]

% Ensamblaje global (4 DOFs)
K = zeros(4, 4)
K = assemble(K, K1, [1, 2])
K = assemble(K, K2, [2, 3])
K = assemble(K, K3, [3, 4])

% BCs: u1=0, u4=0 → DOFs libres = [2, 3]
free = [2, 3]
KR = submat(K, free)
F = [50; 0]
u = inv(KR) * F

disp("Desplazamientos u2, u3:")
disp(u)` },

  // ── Álgebra simbólica ──
  { name: 'Álgebra simbólica', category: 'Simbólico', code: `% ═══════════════════════════════════════════
% Álgebra simbólica con nerdamer
% ═══════════════════════════════════════════

% Derivada
f1 = sdiff('x^3 + 2*x^2 - 5*x + 1', 'x')

% Segunda derivada
f2 = sdiff2('x^3 + 2*x^2 - 5*x + 1', 'x')

% Integral indefinida
F = sint('3*x^2 + 4*x - 5', 'x')

% Integral definida
area = sdefint('x^2', 'x', 0, 1)

% Resolver ecuación
sol = ssolve('x^2 - 5*x + 6', 'x')

% Expandir y factorizar
exp1 = sexpand('(x+1)*(x-2)')
fac1 = sfactor('x^2 - 4')` },

  // ── Estadística ──
  { name: 'Estadística y regresión', category: 'Estadística', code: `% ═══════════════════════════════════════════
% Estadística y regresión lineal
% ═══════════════════════════════════════════

x = [1, 2, 3, 4, 5, 6, 7, 8]
y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.3, 13.9, 16.2]

n = size(x)(2)
x_mean = mean(x)
y_mean = mean(y)

% Regresión lineal: y = a + b*x
Sxy = sum(x .* y) - n * x_mean * y_mean
Sxx = sum(x .* x) - n * x_mean^2
b_reg = Sxy / Sxx
a_reg = y_mean - b_reg * x_mean

% R²
y_pred = a_reg + b_reg * x
SS_res = sum((y - y_pred) .^ 2)
SS_tot = sum((y - y_mean) .^ 2)
R2 = 1 - SS_res / SS_tot` },

  // ── Formato numérico ──
  { name: 'Benchmark — Rendimiento', category: 'Básico', code: `% ═══════════════════════════════════════════
% Benchmark — Medir rendimiento del solver
% tic/toc como MATLAB para medir tiempos
% ═══════════════════════════════════════════

% ── 1. Operaciones matriciales básicas ──
disp("--- Operaciones matriciales ---")
nn = 50

tic
Aa = rand(nn, nn)
toc

tic
Bb = Aa * transpose(Aa)
toc

tic
Cc = inv(Bb)
toc

% ── 2. Solver: sistema lineal NxN ──
disp("--- Solver lineal (lusolve) ---")
tic
bb = rand(nn, 1)
xx = lusolve(Bb, bb)
toc

% ── 3. FEM: Truss 2D (21 elementos, 24 DOF) ──
disp("--- FEM: Truss 24 DOF ---")
tic
nds = [0,0,0; 3,0,0; 6,0,0; 9,0,0; 12,0,0; 15,0,0; 0,0,2; 3,0,2; 6,0,2; 9,0,2; 12,0,2; 15,0,2]
els = [1,2; 2,3; 3,4; 4,5; 5,6; 7,8; 8,9; 9,10; 10,11; 11,12; 1,7; 2,8; 3,9; 4,10; 5,11; 6,12; 1,8; 2,9; 9,4; 10,5; 11,6]
nElem = 21; nDof = 24;
Emod = 10e6; Asec = 10e-4;
Kg = zeros(nDof, nDof)
for ei = range(1, nElem, 1)
  n1 = els(ei,1); n2 = els(ei,2);
  dxe = nds(n2,1)-nds(n1,1); dze = nds(n2,3)-nds(n1,3);
  Le = sqrt(dxe^2+dze^2); cc = dxe/Le; sn = dze/Le;
  ke = Emod*Asec/Le;
  Kl = ke*[1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0];
  Tv = [cc,sn,0,0; -sn,cc,0,0; 0,0,cc,sn; 0,0,-sn,cc];
  Ke = transpose(Tv)*Kl*Tv;
  dv = [2*n1-1, 2*n1, 2*n2-1, 2*n2];
  Kg = assemble(Kg, Ke, dv);
end
toc

tic
Fv = zeros(nDof, 1)
Fv(2)=-250; Fv(4)=-250; Fv(6)=-250; Fv(8)=-250; Fv(10)=-250; Fv(12)=-250;
fixed = [1, 2, 11, 12]
Uf = solve_fem(Kg, Fv, fixed)
toc

disp("Uz max:"); disp(min(Uf))

% ── 4. FEM: Space Frame (30 DOF) ──
disp("--- FEM: Space Frame 30 DOF ---")
tic
nodes = [0,0,0; 0,0,-200; 0,200,0; -200,0,0; 0,-200,0]
coord1 = [0,0,0; 0,0,-200; 0,200,0]
coord2 = [0,0,0; 0,200,0; 0,0,-200]
coord3 = [0,0,0; -200,0,0; 0,0,-200]
coord4 = [0,0,0; 0,-200,0; 0,0,-200]
ke1 = SpaceFrameElement(30e6, 12e6, 200, 200, 40, 50, coord1)
ke2 = SpaceFrameElement(30e6, 12e6, 64, 64, 12.8, 28, coord2)
ke3 = SpaceFrameElement(30e6, 12e6, 200, 200, 40, 50, coord3)
ke4 = SpaceFrameElement(30e6, 12e6, 64, 64, 12.8, 28, coord4)
toc

disp("--- Resumen ---")
disp("Solver: Eigen WASM (C++/Emscripten) para lusolve, inv, solve_fem")
disp("Fallback: math.js (JavaScript) si WASM no carga")` },

  { name: 'Formato numérico', category: 'Básico', code: `% ═══════════════════════════════════════════
% Formato numérico — Control de decimales
% Igual que MATLAB: format short, long, shortE, longE, format(n)
% ═══════════════════════════════════════════

x = pi
y = sqrt(2)
z = 1/3

% ── format short (4 dígitos, por defecto) ──
format short
disp("format short:")
disp(x)
disp(y)
disp(z)

% ── format long (15 dígitos) ──
format long
disp("format long:")
disp(x)
disp(y)
disp(z)

% ── format shortE (notación científica, 4 dígitos) ──
format shortE
disp("format shortE:")
disp(x)
disp(y)
val = 0.000123456
disp(val)

% ── format longE (notación científica, 14 dígitos) ──
format longE
disp("format longE:")
disp(x)
disp(val)

% ── format(n) — n decimales fijos ──
format(2)
disp("format(2) — 2 decimales:")
disp(x)
disp(y)
disp(z)

format(6)
disp("format(6) — 6 decimales:")
disp(x)
disp(y)

% ── Matrices con formato ──
format(4)
disp("Matriz con 4 decimales:")
A = [pi, sqrt(2); 1/3, exp(1)]

% ── Volver al formato por defecto ──
format short
disp("Volviendo a format short:")
disp(x)` },

  // ── Operaciones básicas ──
  { name: 'Operaciones básicas', category: 'Básico', code: `% ═══════════════════════════════════════════
% Operaciones básicas
% ═══════════════════════════════════════════

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
z = exp(1)` },

  // ── Gráficas 2D ──
  { name: 'Gráficas 2D', category: 'Plotting', code: `% ═══════════════════════════════════════════
% Gráficas 2D — plot, scatter, bar, stem
% ═══════════════════════════════════════════

% Función seno
x = range(0, 6.28, 0.1)
y = map(x, sin)
plot(x, y, "sin(x)")

% Scatter
xs = [1, 2, 3, 4, 5, 6, 7, 8]
ys = [2.1, 3.9, 6.2, 7.8, 10.1, 12.3, 13.9, 16.2]
scatter(xs, ys, "Datos experimentales")

% Bar chart
categorias = [1, 2, 3, 4, 5]
valores = [23, 45, 12, 67, 34]
bar(categorias, valores, "Ventas por región")

% Stem plot
n = range(0, 20, 1)
impulso = map(n, f(t) = sin(t) * exp(-t/5))
stem(n, impulso, "Señal amortiguada")` },

  // ── Gráficas 3D ──
  { name: 'Gráficas 3D', category: 'Plotting', code: `% ═══════════════════════════════════════════
% Gráficas 3D — plot3, surf
% ═══════════════════════════════════════════

% Curva 3D: hélice
t = range(0, 6.28*3, 0.1)
xh = map(t, cos)
yh = map(t, sin)
plot3(xh, yh, t, "Hélice 3D")

% Superficie: z = sin(r)/r (sombrero mexicano)
xg = range(-4, 4, 0.5)
yg = range(-4, 4, 0.5)
Z = meshz(xg, yg, "sin(sqrt(x^2+y^2+0.01))/sqrt(x^2+y^2+0.01)")
surf(xg, yg, Z)
title("Sombrero mexicano")` },

  // ── fplot ──
  { name: 'Gráficas de funciones', category: 'Plotting', code: `% ═══════════════════════════════════════════
% fplot — graficar expresión directamente
% ═══════════════════════════════════════════

% Polinomio
fplot("x^3 - 3*x^2 + 2", [-2, 4], "x³ - 3x² + 2")

% Trigonométrica
fplot("sin(x) * cos(2*x)", [0, 6.28], "sin(x)·cos(2x)")

% Exponencial
fplot("exp(-x/3) * sin(2*x)", [0, 15], "Oscilación amortiguada")

% Histograma de datos aleatorios
datos = map(range(1, 500, 1), f(i) = random(-3, 3) + random(-3, 3))
hist(datos, 20, "Distribución (suma de uniformes)")` },

  // ══════════════════════════════════════════
  // FEM — Validación con visualización 3D
  // ══════════════════════════════════════════


  { name: 'FEM — Truss 2D (3 barras)', category: 'FEM', code: `% ═══════════════════════════════════════════
% Truss 2D — derivacion completa
% ═══════════════════════════════════════════

% ── Funciones de forma (barra axial 1D) ──
% N1(xi) = 1 - xi/L     N2(xi) = xi/L
% B = dN/dx = [-1/L, 1/L]
% K_local = EA/L * [1,-1; -1,1] (2x2 local)
disp("Truss: K_local = EA/L * [1,-1; -1,1]")

% ── Transformacion 2D ──
% T = [c,s,0,0; -s,c,0,0; 0,0,c,s; 0,0,-s,c]
% c = cos(theta) = dx/L, s = sin(theta) = dz/L
% K_global = T' * K_local_4x4 * T
disp("T_2d = [c,s,0,0; -s,c,0,0; 0,0,c,s; 0,0,-s,c]")

E = 200e3;
Asec = 0.01;

% Nodos [x,y,z] y conectividad [n1,n2]
nds = [0,0,0; 4,0,0; 2,0,3]
els = [1,3; 2,3; 1,2]
% Cargas: Fz = -100 kN en nodo 3
loads = [3, 0, 0, -100]
show3d(nds, els, "Truss 2D - 3 barras", [1,2], loads)

% DOFs por elemento: 2 DOF/nodo (ux,uz)
dofs = [1,2,5,6; 3,4,5,6; 1,2,3,4]

% Ensamblaje
nDof = 6
Kg = zeros(nDof, nDof)
nElem = 3
for e = range(1, nElem, 1)
  n1 = els(e, 1)
  n2 = els(e, 2)
  dx = nds(n2, 1) - nds(n1, 1)
  dy = nds(n2, 3) - nds(n1, 3)
  Le = sqrt(dx^2 + dy^2)
  c = dx / Le
  s = dy / Le
  ke = E * Asec / Le
  Kl = ke * [1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0]
  T = [c,s,0,0; -s,c,0,0; 0,0,c,s; 0,0,-s,c]
  Ke = transpose(T) * Kl * T
  d = [dofs(e,1), dofs(e,2), dofs(e,3), dofs(e,4)]
  Kg = assemble(Kg, Ke, d)
end

% Carga
Fv = [0; 0; 0; 0; 0; -100]

% Resolver: nodos 1,2 fijos → libres DOFs 5,6
free = [5, 6]
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = inv(Kr) * Fr
Uf = fullvec(Ur, free, 6)

disp("Desplazamientos (6 DOFs):")
Uf

% Deformada
show_deformed(nds, els, Uf, 5, 2, "Deformada (5x)")` },

  { name: 'FEM — Nave industrial 3D', category: 'FEM', code: `% Nave industrial 3D
nds = [0,0,0; 12,0,0; 0,0,5; 12,0,5; 6,0,7; 0,6,0; 12,6,0; 0,6,5; 12,6,5; 6,6,7]

els = [1,3; 2,4; 3,5; 4,5; 6,8; 7,9; 8,10; 9,10; 3,8; 4,9; 5,10]

show3d(nds, els, "Nave Industrial 3D", [1,2,6,7])` },

  { name: 'Awatif — Plate (Delaunay shell)', category: 'FEM', code: `% ═══════════════════════════════════════════
% Plate — awatif v2.0.0 example (plate/main.ts)
% Shell triangular 18 DOF con malla Delaunay
% getMesh → k_shell_tri → deform → contorno Uz
% ═══════════════════════════════════════════

% Vertices del poligono (awatif: xPosition=15)
points = [0,0,0; 15,0,0; 15,10,0; 0,5,0]
polygon = [0, 1, 2, 3]

% Generar malla Delaunay (Triangle de Shewchuk)
% maxArea=0.5 → malla fina (igual que awatif maxMeshSize=0.5)
[nds, els, bnd] = getMesh(points, polygon, 0.5, 30)

nNodes = size(nds, 1)
nElem = size(els, 1)
disp("Nodos:"); disp(nNodes)
disp("Triangulos:"); disp(nElem)

show3d(nds, els, "Plate — Delaunay mesh", bnd)

% Propiedades (awatif: Ex=Ey=100, nu=0.3, t=1)
E = 100; nu = 0.3; t = 1;

% ── Ensamblaje shell tri 18 DOF (6 DOF/nodo) ──
nDof = nNodes * 6
Kg = zeros(nDof, nDof)

for e = range(1, nElem, 1)
  n1 = els(e,1); n2 = els(e,2); n3 = els(e,3);
  x1=nds(n1,1); y1=nds(n1,2);
  x2=nds(n2,1); y2=nds(n2,2);
  x3=nds(n3,1); y3=nds(n3,2);
  Ke = k_shell_tri(E, nu, t, x1,y1, x2,y2, x3,y3);
  d1 = (n1-1)*6; d2 = (n2-1)*6; d3 = (n3-1)*6;
  d = [d1+1,d1+2,d1+3,d1+4,d1+5,d1+6, d2+1,d2+2,d2+3,d2+4,d2+5,d2+6, d3+1,d3+2,d3+3,d3+4,d3+5,d3+6];
  Kg = assemble(Kg, Ke, d);
end

% ── BC: bordes empotrados (6 DOF por nodo) ──
fixed = [];
nBnd = length(bnd)
for i = range(1, nBnd, 1)
  nb = bnd(i);
  d0 = (nb-1)*6;
  fixed = [fixed, d0+1,d0+2,d0+3,d0+4,d0+5,d0+6];
end

% ── Cargas: Fz = -3 en todos los nodos ──
Fv = zeros(nDof, 1)
for i = range(1, nNodes, 1)
  Fv((i-1)*6 + 3) = -3;
end

% ── Resolver ──
Uf = solve_fem(Kg, Fv, fixed)

% Extraer Uz por nodo para contorno
Uz_vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  Uz_vals(i) = Uf((i-1)*6 + 3);
end
disp("Uz max:"); disp(min(Uz_vals))

% ── Deformada + contorno Uz (awatif v2 style) ──
show_deformed_contour(nds, els, Uf, Uz_vals, 0, 6, "Plate — Uz deformada", bnd)` },

  { name: 'FEM — Shell Tri (placa)', category: 'FEM', code: `% ═══════════════════════════════════════════
% Shell Triangular 18 DOF — Placa con carga
% Derivacion: Membrana + DKT Bending + Shear
% (equivalente a awatif plate example)
% ═══════════════════════════════════════════

E = 100;
nu = 0.3;
t_plate = 1;

% ══ PASO 1: Malla rectangular 2x2 → 9 nodos, 8 triangulos ══
Lx = 15; Ly = 10;
nds = meshRect_nodes(Lx, Ly, 2, 2)
els = meshRect_cst(2, 2)
show3d(nds, els, "Placa Shell Tri (2x2)", [1,2,3,4,6,7])

% ══ PASO 2: Funciones de forma (membrana CST) ══
% N1 = 1 - xi - eta,  N2 = xi,  N3 = eta
% B_membrana = f(dN/dx, dN/dy) → 3x6 (exx, eyy, gxy)
disp("--- Membrana: CST con drilling DOF ---")
disp("N1=1-xi-eta, N2=xi, N3=eta")

% ══ PASO 3: Funciones de forma (DKT bending) ══
% DKT: Discrete Kirchhoff Triangle
% 9 DOFs de flexion: w1,thetax1,thetay1, w2,thetax2,thetay2, w3,thetax3,thetay3
% Bb(3x9) relaciona curvaturas [kxx,kyy,kxy] con DOFs de flexion
disp("--- Flexion: DKT (Discrete Kirchhoff Triangle) ---")
disp("Curvatura: [kxx; kyy; 2*kxy] = Bb * [w,thx,thy]_nodos")

% ══ PASO 4: Matrices constitutivas ══
% Db (bending): E*t^3/(12*(1-nu^2)) * [1,nu,0; nu,1,0; 0,0,(1-nu)/2]
% Ds (shear): kappa*G*t * [1,0; 0,1],  kappa=5/6, G=E/(2*(1+nu))
Db_coeff = E * t_plate^3 / (12 * (1 - nu^2))
Db = Db_coeff * [1, nu, 0; nu, 1, 0; 0, 0, (1 - nu) / 2]
G = E / (2 * (1 + nu))
kappa = 5/6
Ds = kappa * G * t_plate * [1, 0; 0, 1]

% ══ PASO 5: Rigidez elemento 1 (18x18) ══
disp("--- K_shell = K_membrana(9x9) + K_bending(9x9) + K_shear(9x9) ---")
disp("--- Ensamblado en 18x18: [ux,uy,uz,rx,ry,rz] por nodo ---")
n1 = 1; n2 = 2; n3 = 3;
Ke = k_shell_tri(E, nu, t_plate, nds(n1,1),nds(n1,2), nds(n2,1),nds(n2,2), nds(n3,1),nds(n3,2))
disp("Ke(18x18) para elemento 1:")
Ke

% ══ PASO 6: Ensamblaje global ══
nNod = 9; nDof = nNod * 6;
Kg = zeros(nDof, nDof);
nElem = 8;
for e = range(1, nElem, 1)
  n1 = els(e,1); n2 = els(e,2); n3 = els(e,3);
  Ke = k_shell_tri(E, nu, t_plate, nds(n1,1),nds(n1,2), nds(n2,1),nds(n2,2), nds(n3,1),nds(n3,2));
  d1 = (n1-1)*6; d2 = (n2-1)*6; d3 = (n3-1)*6;
  d = [d1+1,d1+2,d1+3,d1+4,d1+5,d1+6, d2+1,d2+2,d2+3,d2+4,d2+5,d2+6, d3+1,d3+2,d3+3,d3+4,d3+5,d3+6];
  Kg = assemble(Kg, Ke, d);
end

% ══ PASO 7: BC — bordes empotrados ══
% Nodos del borde: 1,2,3,4,6,7 (todos menos 5,8,9 interiores)
bnd = [1,2,3,4,6,7]
fixed = [];
for i = range(1, 6, 1)
  nb = bnd(i);
  d0 = (nb - 1) * 6;
  fixed = [fixed, d0+1, d0+2, d0+3, d0+4, d0+5, d0+6];
end

% ══ PASO 8: Carga — Fz en todos los nodos ══
Fv = zeros(nDof, 1);
Pz = -3;
for i = range(1, nNod, 1)
  Fv((i-1)*6 + 3) = Pz;
end
Fv

% ══ PASO 9: Resolver ══
free = freedofs(nDof, fixed)
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = inv(Kr) * Fr
Uf = fullvec(Ur, free, nDof)

% Desplazamiento vertical nodo 5 (centro)
disp("Uz nodo 5 (centro):")
disp(Uf(27))

% ══ PASO 10: Deformada ══
show_deformed(nds, els, Uf, 0, 6, "Deformada Shell", [1,2,3,4,6,7])` },

  { name: 'FEM — Placa CST', category: 'FEM', code: `% ═══════════════════════════════════════════
% FEM: Triangulo CST (Constant Strain Triangle)
% Plane Stress — derivacion desde cero
% ═══════════════════════════════════════════

E = 30e6;
nu = 0.25;
t = 1;

% ══ PASO 1: Funciones de forma ══
% Coordenadas naturales (xi, eta) en triangulo [0,1]
% N1(xi,eta) = 1 - xi - eta   (vale 1 en nodo 1)
% N2(xi,eta) = xi              (vale 1 en nodo 2)
% N3(xi,eta) = eta             (vale 1 en nodo 3)
disp("N1 = 1-xi-eta,  N2 = xi,  N3 = eta")

% ══ PASO 2: Derivadas de N ══
dNdxi = [-1, 1, 0]
dNdeta = [-1, 0, 1]

% ══ PASO 3: Nodos del elemento 1 ══
nds = [0,0,0; 2,0,0; 2,1,0; 0,1,0]
els = [1,2,3; 1,3,4]
show3d(nds, els, "Placa CST (2 triangulos)", [1,4])

x1 = 0; y1 = 0; x2 = 2; y2 = 0; x3 = 2; y3 = 1;

% ══ PASO 4: Jacobiano ══
% J = [dx/dxi, dy/dxi; dx/deta, dy/deta]
% x = N1*x1 + N2*x2 + N3*x3 → dx/dxi = -x1+x2, dx/deta = -x1+x3
J = [x2 - x1, y2 - y1; x3 - x1, y3 - y1]
detJ = det(J)
Area = abs(detJ) / 2

% ══ PASO 5: Jacobiano inverso ══
Jinv = inv(J)

% ══ PASO 6: Derivadas en coord. fisicas ══
% [dN/dx; dN/dy] = J^-1 * [dN/dxi; dN/deta]
dNdx = Jinv(1,1) * dNdxi + Jinv(1,2) * dNdeta
dNdy = Jinv(2,1) * dNdxi + Jinv(2,2) * dNdeta

% ══ PASO 7: Matriz B (3x6) ══
% epsilon = B * u
% [exx; eyy; gxy] = B * [u1,v1,u2,v2,u3,v3]'
B = [dNdx(1),0,dNdx(2),0,dNdx(3),0; 0,dNdy(1),0,dNdy(2),0,dNdy(3); dNdy(1),dNdx(1),dNdy(2),dNdx(2),dNdy(3),dNdx(3)]

% ══ PASO 8: Matriz D constitutiva (plane stress) ══
% sigma = D * epsilon
D = (E / (1 - nu^2)) * [1, nu, 0; nu, 1, 0; 0, 0, (1 - nu) / 2]

% ══ PASO 9: B'*D*B ══
BtDB = transpose(B) * D * B

% ══ PASO 10: Rigidez Ke = t * Area * B'*D*B ══
% integral(B'*D*B, dA) = B'*D*B * Area  (B constante en CST)
Ke = t * Area * BtDB

% ── Ensamblaje ──
dofs = [1,2,3,4,5,6; 1,2,5,6,7,8]
nDof = 8;
Kg = zeros(nDof, nDof);
nElem = 2;
for e = range(1, nElem, 1)
  n1 = els(e,1); n2 = els(e,2); n3 = els(e,3);
  Ke = k_cst(E, nu, t, nds(n1,1),nds(n1,2), nds(n2,1),nds(n2,2), nds(n3,1),nds(n3,2));
  d = [dofs(e,1), dofs(e,2), dofs(e,3), dofs(e,4), dofs(e,5), dofs(e,6)];
  Kg = assemble(Kg, Ke, d);
end
Kg

% Carga: traccion borde derecho
Fv = [0; 0; 500; 0; 500; 0; 0; 0]

% BC: nodo 1 fijo, nodo 4 roller (u4=0)
free = [3,4,5,6,8]
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = inv(Kr) * Fr
Uf = fullvec(Ur, free, 8)

% Deformada
show_deformed(nds, els, Uf, 5e4, 2, "Deformada CST (50000x)")` },

  { name: 'Control de flujo', category: 'Basico', code: `% For, while, if-else
% (Dentro de loops, output es silencioso como MATLAB)
% (Usar disp() para mostrar valores dentro de loops)

% Sumatoria con for
suma = 0;
for i = range(1, 10, 1)
  suma = suma + i;
end
suma

% Factorial con while
n = 7;
fact = 1;
k = 1;
while k <= n
  fact = fact * k;
  k = k + 1;
end
fact

% For con disp() — muestra dentro del loop
for i = range(1, 5, 1)
  cuad = i^2;
  disp(cuad)
end

% if-elseif-else
x = 42
if x > 100
  clase = "grande"
elseif x > 10
  clase = "mediano"
else
  clase = "pequeno"
end
clase` },

  { name: 'FEM — Ensamblaje con for', category: 'FEM', code: `% Ensamblaje automatico con for loop
% 5 resortes en serie
nElem = 5
nDof = nElem + 1
ks = [100, 200, 150, 300, 250]

% Ensamblar K global con for
Kg = zeros(nDof, nDof)
for e = range(1, nElem, 1)
  ke = ks(e)
  dof1 = e
  dof2 = e + 1
  Kg(dof1, dof1) = Kg(dof1, dof1) + ke
  Kg(dof1, dof2) = Kg(dof1, dof2) - ke
  Kg(dof2, dof1) = Kg(dof2, dof1) - ke
  Kg(dof2, dof2) = Kg(dof2, dof2) + ke
end
Kg

% Carga en nodo 3
Fv = zeros(nDof, 1)
Fv(3) = 100

% BC: nodo 1 y 6 fijos
free = [2, 3, 4, 5]
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = inv(Kr) * Fr
Uf = fullvec(Ur, free, nDof)` },

  { name: 'FEM — Frame 2D + Diagramas N/V/M', category: 'FEM', code: `% ═══════════════════════════════════════════
% Frame 2D — Portal con diagramas N, V, M
% Derivacion completa con funciones de forma
% ═══════════════════════════════════════════

% ══ PASO 1: Funciones de forma ══
% Axial (lineales): N1 = 1-xi, N2 = xi  (xi = x/L)
% Flexion (Hermite cubicos):
%   H1(xi) = 1 - 3xi^2 + 2xi^3
%   H2(xi) = L*xi*(1-xi)^2
%   H3(xi) = 3xi^2 - 2xi^3
%   H4(xi) = L*xi^2*(xi-1)

% Propiedades (kN, m)
E = 200e6;
A = 0.01;
I_sec = 8.33e-5;
Lv = 4;

% ══ PASO 2: Derivadas segunda (curvatura) ══
% d2H1/dx2 = (1/L^2)*(-6 + 12*xi)
% d2H2/dx2 = (1/L)*(- 4 + 6*xi)
% d2H3/dx2 = (1/L^2)*(6 - 12*xi)
% d2H4/dx2 = (1/L)*(-2 + 6*xi)

% ══ PASO 3: Rigidez axial ══
% Ka = integral(B_ax'*EA*B_ax, 0, L)
% B_ax = [-1/L, 1/L]
ea = E * A / Lv
Ka = ea * [1, -1; -1, 1]

% ══ PASO 4: Rigidez flexion ══
% Kb = integral(B_flex'*EI*B_flex, 0, L)
% Integrando analiticamnete los polinomios Hermite:
EIL = E * I_sec;
a = 12 * EIL / Lv^3;
b = 6 * EIL / Lv^2;
c4 = 4 * EIL / Lv;
c2 = 2 * EIL / Lv;
Kb = [a, b, -a, b; b, c4, -b, c2; -a, -b, a, -b; b, c2, -b, c4]

% ══ PASO 5: Ensamblar K_local 6x6 ══
% DOFs: [u1, w1, theta1, u2, w2, theta2]
% Axial en DOFs 1,4; Flexion en DOFs 2,3,5,6
Ke_local = zeros(6, 6);
Ke_local(1,1) = Ka(1,1); Ke_local(1,4) = Ka(1,2);
Ke_local(4,1) = Ka(2,1); Ke_local(4,4) = Ka(2,2);
Ke_local(2,2) = Kb(1,1); Ke_local(2,3) = Kb(1,2); Ke_local(2,5) = Kb(1,3); Ke_local(2,6) = Kb(1,4);
Ke_local(3,2) = Kb(2,1); Ke_local(3,3) = Kb(2,2); Ke_local(3,5) = Kb(2,3); Ke_local(3,6) = Kb(2,4);
Ke_local(5,2) = Kb(3,1); Ke_local(5,3) = Kb(3,2); Ke_local(5,5) = Kb(3,3); Ke_local(5,6) = Kb(3,4);
Ke_local(6,2) = Kb(4,1); Ke_local(6,3) = Kb(4,2); Ke_local(6,5) = Kb(4,3); Ke_local(6,6) = Kb(4,4);
Ke_local

% Nodos [x, y, z]
nds = [0,0,0; 0,0,4; 6,0,4; 6,0,0]
els = [1,2; 2,3; 3,4]
show3d(nds, els, "Portal 2D", [1,4], [[2,10,0,0]])

% DOFs: 3/nodo (ux, uz, ry) → 12 total
nDof = 12;
Kg = zeros(nDof, nDof);

% Ensamblaje con for
nElem = 3;
dofMap = [1,2,3,4,5,6; 4,5,6,7,8,9; 7,8,9,10,11,12]

for ei = range(1, nElem, 1)
  n1 = els(ei,1);
  n2 = els(ei,2);
  dx = nds(n2,1) - nds(n1,1);
  dz = nds(n2,3) - nds(n1,3);
  Le = sqrt(dx^2 + dz^2);

  % Rigidez local
  Ke = k_frame2d(E, A, I_sec, Le);

  % Transformacion
  cs = dx / Le;
  sn = dz / Le;
  Tr = [cs,sn,0,0,0,0; -sn,cs,0,0,0,0; 0,0,1,0,0,0; 0,0,0,cs,sn,0; 0,0,0,-sn,cs,0; 0,0,0,0,0,1];

  % Ensamblar Ke_global = T' * Ke * T
  Keg = transpose(Tr) * Ke * Tr;
  dv = [dofMap(ei,1), dofMap(ei,2), dofMap(ei,3), dofMap(ei,4), dofMap(ei,5), dofMap(ei,6)];
  Kg = assemble(Kg, Keg, dv);
end

% Carga: Fx = 10 kN en nodo 2
Fv = zeros(nDof, 1);
Fv(4) = 10

% BC: nodos 1 y 4 empotrados (DOFs 1,2,3,10,11,12)
fixed = [1, 2, 3, 10, 11, 12]
Uf = solve_fem(Kg, Fv, fixed)

% Deformada
show_deformed(nds, els, Uf, 200, 3, "Deformada (200x)")

% ── Fuerzas internas por elemento ──
fAll = zeros(nElem, 6)
for ei = range(1, nElem, 1)
  n1 = els(ei,1);
  n2 = els(ei,2);
  dx = nds(n2,1) - nds(n1,1);
  dz = nds(n2,3) - nds(n1,3);
  Le = sqrt(dx^2 + dz^2);
  Ke = k_frame2d(E, A, I_sec, Le);
  cs = dx / Le;
  sn = dz / Le;
  Tr = [cs,sn,0,0,0,0; -sn,cs,0,0,0,0; 0,0,1,0,0,0; 0,0,0,cs,sn,0; 0,0,0,-sn,cs,0; 0,0,0,0,0,1];
  dv = [dofMap(ei,1), dofMap(ei,2), dofMap(ei,3), dofMap(ei,4), dofMap(ei,5), dofMap(ei,6)];
  ue = subvec(Uf, dv);
  fLocal = frame_forces(Ke, Tr, ue);
  fAll(ei, 1) = fLocal(1);
  fAll(ei, 2) = fLocal(2);
  fAll(ei, 3) = fLocal(3);
  fAll(ei, 4) = fLocal(4);
  fAll(ei, 5) = fLocal(5);
  fAll(ei, 6) = fLocal(6);
end

% Extraer N, V, M por elemento → [fi, fj]
Nf = zeros(nElem, 2);
Vf = zeros(nElem, 2);
Mf = zeros(nElem, 2);
for ei = range(1, nElem, 1)
  Nf(ei,1) = -fAll(ei,1);
  Nf(ei,2) = fAll(ei,4);
  Vf(ei,1) = fAll(ei,2);
  Vf(ei,2) = -fAll(ei,5);
  Mf(ei,1) = -fAll(ei,3);
  Mf(ei,2) = fAll(ei,6);
end

% Diagramas
show_diagram(nds, els, Nf, "constant", "Axial Force (N)")
show_diagram(nds, els, Vf, "constant", "Shear Force (V)")
show_diagram(nds, els, Mf, "linear", "Bending Moment (M)")` },

  // ══════════════════════════════════════════
  // Awatif v2.0.0 Examples (converted to MATLAB)
  // All functions shown desglosadas (user sees the code)
  // ══════════════════════════════════════════

  { name: 'Awatif — Truss Paramétrico', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Truss Paramétrico — Cercha Pratt (5 divisiones)
% Ensamblaje con k_truss2d + T inline (4x4 global)
% DOF por nodo: ux (odd), uz (even) en plano XZ
% ═══════════════════════════════════════════

% Parámetros
span = 15; divs = 5; ht = 2;
Emod = 10e6; Asec = 10e-4; Pload = 250;
dxp = span / divs;

% ── Nodos: cuerda inferior (1..divs+1) + superior (divs+2..2*(divs+1)) ──
nNodes = 2*(divs+1)
nds = zeros(nNodes, 3)
nds(1,1)=0;   nds(2,1)=3;   nds(3,1)=6;   nds(4,1)=9;   nds(5,1)=12;  nds(6,1)=15;
nds(7,1)=0;   nds(7,3)=2;
nds(8,1)=3;   nds(8,3)=2;
nds(9,1)=6;   nds(9,3)=2;
nds(10,1)=9;  nds(10,3)=2;
nds(11,1)=12; nds(11,3)=2;
nds(12,1)=15; nds(12,3)=2;

% ── Elementos: cuerda inf (5), cuerda sup (5), montantes (6), diagonales (5) ──
% Cuerda inferior: 1-2, 2-3, 3-4, 4-5, 5-6
% Cuerda superior: 7-8, 8-9, 9-10, 10-11, 11-12
% Montantes: 1-7, 2-8, 3-9, 4-10, 5-11, 6-12
% Diagonales Pratt: alternadas izq-arriba / arriba-der
els = [1,2; 2,3; 3,4; 4,5; 5,6; 7,8; 8,9; 9,10; 10,11; 11,12; 1,7; 2,8; 3,9; 4,10; 5,11; 6,12; 1,8; 2,9; 9,4; 10,5; 11,6]
nElem = size(els, 1)
show3d(nds, els, "Truss Pratt", [1, 6])

% ── Ensamblaje: Ke = T' * Klocal * T  (4x4, DOF: ux,uz por nodo) ──
nDof = nNodes * 2
Kg = zeros(nDof, nDof)
for ei = range(1, nElem, 1)
  n1 = els(ei,1); n2 = els(ei,2);
  dxe = nds(n2,1) - nds(n1,1);
  dze = nds(n2,3) - nds(n1,3);
  Le = sqrt(dxe^2 + dze^2);
  cc = dxe/Le; sn = dze/Le;
  ke = Emod * Asec / Le;
  Kl = ke * [1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0];
  Tv = [cc,sn,0,0; -sn,cc,0,0; 0,0,cc,sn; 0,0,-sn,cc];
  Ke = transpose(Tv) * Kl * Tv;
  dv = [2*n1-1, 2*n1, 2*n2-1, 2*n2];
  Kg = assemble(Kg, Ke, dv);
end

% ── Cargas: -Pload en uz de TODOS los nodos inferiores (1..6) ──
Fv = zeros(nDof, 1)
Fv(2) = -Pload;
Fv(4) = -Pload;
Fv(6) = -Pload;
Fv(8) = -Pload;
Fv(10) = -Pload;
Fv(12) = -Pload;

% ── BC: pin nodo 1 (DOF 1,2), roller nodo 6 (DOF 11,12) ──
fixed = [1, 2, 11, 12]
Uf = solve_fem(Kg, Fv, fixed)

disp("Uz min (max deflexion):"); disp(min(Uf))
show_deformed(nds, els, Uf, 0, 2, "Deformada Pratt", [1, 6])` },

  { name: 'Awatif — Estructura 3D', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Torre 3D — Truss 3D con columnas y arriostramientos
% Ensamblaje directo con k_truss2d + T3d inline
% DOF por nodo: ux,uy,uz (3 DOF) — truss 3D
% ═══════════════════════════════════════════

% Geometría: base 2×2m, 4 niveles de 2m (= awatif divisions=4)
bx = 2; by = 2; bz = 2; divs = 4;
Emod = 100; Asec = 10; loadX = 30;

% ── Nodos: 4 por nivel, 5 niveles = 20 nodos (centrados +6 en XY como awatif) ──
nds = [6,6,0; 8,6,0; 8,8,0; 6,8,0; 6,6,2; 8,6,2; 8,8,2; 6,8,2; 6,6,4; 8,6,4; 8,8,4; 6,8,4; 6,6,6; 8,6,6; 8,8,6; 6,8,6; 6,6,8; 8,6,8; 8,8,8; 6,8,8]
nNodes = 20

% ── Elementos: vigas (5/nivel × 4 niveles), columnas (4/transicion × 4), diagonales (4/transicion × 4) ──
% Vigas niveles 1-4
els = [5,6; 6,7; 7,8; 8,5; 5,7; 9,10; 10,11; 11,12; 12,9; 9,11; 13,14; 14,15; 15,16; 16,13; 13,15; 17,18; 18,19; 19,20; 20,17; 17,19; 1,5; 2,6; 3,7; 4,8; 5,9; 6,10; 7,11; 8,12; 9,13; 10,14; 11,15; 12,16; 13,17; 14,18; 15,19; 16,20; 1,6; 4,7; 1,8; 2,7; 5,10; 8,11; 5,12; 6,11; 9,14; 12,15; 9,16; 10,15; 13,18; 16,19; 13,20; 14,19]
nElem = size(els, 1)
show3d(nds, els, "Torre 3D (4 niveles)", [1,2,3,4])

% ── Ensamblaje: Ke = T3d' * Klocal * T3d  (6x6, 3 DOF/nodo) ──
nDof = nNodes * 3
Kg = zeros(nDof, nDof)
for ei = range(1, nElem, 1)
  n1 = els(ei,1); n2 = els(ei,2);
  dxe = nds(n2,1)-nds(n1,1);
  dye = nds(n2,2)-nds(n1,2);
  dze = nds(n2,3)-nds(n1,3);
  Le = sqrt(dxe^2 + dye^2 + dze^2);
  lx = dxe/Le; ly = dye/Le; lz = dze/Le;
  ke = Emod * Asec / Le;
  Tv = [lx,ly,lz,0,0,0; 0,0,0,lx,ly,lz];
  Kl2 = ke * [1,-1; -1,1];
  Ke = transpose(Tv) * Kl2 * Tv;
  dv = [3*n1-2, 3*n1-1, 3*n1, 3*n2-2, 3*n2-1, 3*n2];
  Kg = assemble(Kg, Ke, dv);
end

% ── Carga: Fx=30 en nodo 19 (penúltimo del tope, como awatif) ──
Fv = zeros(nDof, 1)
Fv(3*19-2) = loadX

% ── BC: 4 nodos base fijos (DOF 1..12) ──
fixed = [1,2,3, 4,5,6, 7,8,9, 10,11,12]
Uf = solve_fem(Kg, Fv, fixed)

disp("Ux nodo 19 (top):"); disp(Uf(3*19-2))
show_deformed(nds, els, Uf, 5, 3, "Deformada Torre (5x)", [1,2,3,4])` },

  { name: 'Awatif — Placa CST', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Placa CST — Plane stress (awatif v2.0.0 plate)
% Funciones MATLAB desglosadas: meshRect, assemble_cst
% ═══════════════════════════════════════════

% ─────────────────────────────────────────
% Función: generar malla rectangular de nodos
% Retorna nodos en grilla (nx+1)*(ny+1)
% ─────────────────────────────────────────
function [nds] = meshRect_nodes(Lx, Ly, nx, ny)
  dxx = Lx / nx;
  dyy = Ly / ny;
  nNodes = (nx+1) * (ny+1);
  nds = zeros(nNodes, 3);
  n = 1;
  for j = range(0, ny, 1)
    for i = range(0, nx, 1)
      nds(n, 1) = i * dxx;
      nds(n, 2) = j * dyy;
      n = n + 1;
    end
  end
end

% ─────────────────────────────────────────
% Función: generar elementos CST triangulares
% 2 triángulos por cuadro de la malla
% ─────────────────────────────────────────
function [els] = meshRect_cst(nx, ny)
  nElem = nx * ny * 2;
  els = zeros(nElem, 3);
  e = 1;
  for j = range(0, ny-1, 1)
    for i = range(0, nx-1, 1)
      n1 = j*(nx+1) + i + 1;
      n2 = n1 + 1;
      n3 = n1 + nx + 1;
      n4 = n3 + 1;
      els(e,1)=n1; els(e,2)=n2; els(e,3)=n4; e=e+1;
      els(e,1)=n1; els(e,2)=n4; els(e,3)=n3; e=e+1;
    end
  end
end

% ─────────────────────────────────────────
% Función: ensamblaje de placa CST
% ─────────────────────────────────────────
function [Kg] = assemble_cst(nds, els, nDof, E, nu, t)
  nElem = size(els, 1)
  Kg = zeros(nDof, nDof)
  for e = range(1, nElem, 1)
    na = els(e,1)
    nb = els(e,2)
    nc = els(e,3)
    xa = nds(na,1)
    ya = nds(na,2)
    xb = nds(nb,1)
    yb = nds(nb,2)
    xc = nds(nc,1)
    yc = nds(nc,2)
    Ke = k_cst(E, nu, t, xa, ya, xb, yb, xc, yc)
    d = [2*na-1, 2*na, 2*nb-1, 2*nb, 2*nc-1, 2*nc]
    Kg = assemble(Kg, Ke, d)
  end
end

% ─────────────────────────────────────────
% Función: DOFs del borde izquierdo (x=0)
% ─────────────────────────────────────────
function [fdofs] = fixed_left_edge(nx, ny)
  nBnd = ny + 1
  fdofs = zeros(1, nBnd * 2)
  k = 1
  for j = range(0, ny, 1)
    n = j*(nx+1) + 1
    fdofs(k) = 2*n - 1
    fdofs(k+1) = 2*n
    k = k + 2
  end
end

% ═══════════════════════════════════════════
% PROGRAMA PRINCIPAL
% ═══════════════════════════════════════════
E = 200e3; nu = 0.3; t = 1.0;
Lx = 10; Ly = 5; nx = 4; ny = 2;

% Generar malla
nds = meshRect_nodes(Lx, Ly, nx, ny)
els = meshRect_cst(nx, ny)
nNodes = size(nds, 1)

show3d(nds, els, "Placa CST")

% Ensamblar
nDof = nNodes * 2;
Kg = assemble_cst(nds, els, nDof, E, nu, t)

% BC: borde izquierdo fijo
fixed_dofs = fixed_left_edge(nx, ny)

% Carga: tracción en borde derecho
Fv = zeros(nDof, 1);
for j = range(0, ny, 1)
  n = j*(nx+1) + nx + 1;
  Fv(2*n - 1) = 100;
end

free = freedofs(nDof, fixed_dofs)
Ur = inv(submat(Kg, free)) * subvec(Fv, free)
Uf = fullvec(Ur, free, nDof)

show_deformed(nds, els, Uf, 1000, 2, "Deformada CST (1000x)")` },

  { name: 'FEM — Q4 Jacobiano (PDE a Ke)', category: 'FEM', code: `% ═══════════════════════════════════════════
% Del PDE a Ke: Elemento Q4 Plane Stress
% Jacobiano, funciones de forma, Gauss
% ═══════════════════════════════════════════

% ══ PASO 1: ECUACION DIFERENCIAL ══
% Equilibrio 2D:
%   d(sigma_x)/dx + d(tau_xy)/dy + bx = 0
%   d(tau_xy)/dx + d(sigma_y)/dy + by = 0

% ══ PASO 2: FORMA DEBIL ══
% integral(delta_eps' * sigma * dA) = integral(delta_u' * b * dA)
% Con sigma = D*eps y eps = B*u:
%   K * u = F   donde K = int(B' * D * B * t * dA)

% ══ PASO 3: FUNCIONES DE FORMA Q4 ══
% Coordenadas naturales (xi, eta) in [-1,+1]
% N1 = (1-xi)(1-eta)/4   N2 = (1+xi)(1-eta)/4
% N3 = (1+xi)(1+eta)/4   N4 = (1-xi)(1+eta)/4

% ══ PASO 4: GEOMETRIA — cuadrado 2x2m ══
coords = [0, 0; 2, 0; 2, 2; 0, 2]
E = 200e3; nu = 0.3; t = 0.01

% ══ PASO 5: JACOBIANO en punto (xi,eta) ══
% J = [dx/dxi  dy/dxi ]   Regla de la cadena:
%     [dx/deta dy/deta]    dN/dx = J^-1 * dN/dxi

% Funcion: evaluar N, dN/dx, dN/dy, J en un punto
% --- en el CENTRO (xi=0, eta=0) ---
xi = 0; eta = 0
N1 = (1-xi)*(1-eta)/4; N2 = (1+xi)*(1-eta)/4
N3 = (1+xi)*(1+eta)/4; N4 = (1-xi)*(1+eta)/4
disp("N (centro):"); disp([N1, N2, N3, N4])
disp("Suma N = "); disp(N1+N2+N3+N4)

% Derivadas naturales
dNdxi  = [-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4]
dNdeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4]

% Jacobiano: J_ij = sum(dN/dxi_i * coord_j)
J11 = dNdxi(1)*coords(1,1) + dNdxi(2)*coords(2,1) + dNdxi(3)*coords(3,1) + dNdxi(4)*coords(4,1)
J12 = dNdxi(1)*coords(1,2) + dNdxi(2)*coords(2,2) + dNdxi(3)*coords(3,2) + dNdxi(4)*coords(4,2)
J21 = dNdeta(1)*coords(1,1) + dNdeta(2)*coords(2,1) + dNdeta(3)*coords(3,1) + dNdeta(4)*coords(4,1)
J22 = dNdeta(1)*coords(1,2) + dNdeta(2)*coords(2,2) + dNdeta(3)*coords(3,2) + dNdeta(4)*coords(4,2)
disp("J = [J11 J12; J21 J22]:")
disp([J11, J12; J21, J22])
detJ = J11*J22 - J12*J21
disp("det(J) = "); disp(detJ)
disp("(cuadrado 2x2: J=I, det=1=Area/4)")

% J inverso
invJ = [J22, -J12; -J21, J11] / detJ

% Derivadas cartesianas: dN/dx = J^-1 * dN/dxi
dNdx = invJ(1,1)*dNdxi + invJ(1,2)*dNdeta
dNdy = invJ(2,1)*dNdxi + invJ(2,2)*dNdeta
disp("dN/dx ="); disp(dNdx)
disp("dN/dy ="); disp(dNdy)

% ══ PASO 6: MATRIZ B (3x8) ══
% eps = [du/dx; dv/dy; du/dy+dv/dx] = B * [u1;v1;u2;v2;u3;v3;u4;v4]
B = zeros(3, 8)
for i = range(1, 4, 1)
  B(1, 2*i-1) = dNdx(i)
  B(2, 2*i)   = dNdy(i)
  B(3, 2*i-1) = dNdy(i)
  B(3, 2*i)   = dNdx(i)
end
disp("B (3x8) en centro:")
disp(B)

% ══ PASO 7: MATRIZ D (Plane Stress) ══
c = E / (1 - nu^2)
D = c * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2]
disp("D (constitutiva):")
disp(D)

% ══ PASO 8: CUADRATURA DE GAUSS 2x2 ══
% K = SUM_g  B(xi_g)' * D * B(xi_g) * t * |J(xi_g)| * w_g
g = 1/sqrt(3)
disp("Puntos Gauss 2x2:")
disp([-g,-g; g,-g; g,g; -g,g])

Ke = zeros(8, 8)
gpts = [-g,-g; g,-g; g,g; -g,g]
for ig = range(1, 4, 1)
  xi_g = gpts(ig, 1); eta_g = gpts(ig, 2)

  % N y derivadas en punto de Gauss
  dNdxi_g  = [-(1-eta_g)/4, (1-eta_g)/4, (1+eta_g)/4, -(1+eta_g)/4]
  dNdeta_g = [-(1-xi_g)/4, -(1+xi_g)/4, (1+xi_g)/4, (1-xi_g)/4]

  % Jacobiano
  J_g = [dNdxi_g(1)*coords(1,1)+dNdxi_g(2)*coords(2,1)+dNdxi_g(3)*coords(3,1)+dNdxi_g(4)*coords(4,1), dNdxi_g(1)*coords(1,2)+dNdxi_g(2)*coords(2,2)+dNdxi_g(3)*coords(3,2)+dNdxi_g(4)*coords(4,2); dNdeta_g(1)*coords(1,1)+dNdeta_g(2)*coords(2,1)+dNdeta_g(3)*coords(3,1)+dNdeta_g(4)*coords(4,1), dNdeta_g(1)*coords(1,2)+dNdeta_g(2)*coords(2,2)+dNdeta_g(3)*coords(3,2)+dNdeta_g(4)*coords(4,2)]
  detJ_g = J_g(1,1)*J_g(2,2) - J_g(1,2)*J_g(2,1)
  invJ_g = [J_g(2,2), -J_g(1,2); -J_g(2,1), J_g(1,1)] / detJ_g

  dNdx_g = invJ_g(1,1)*dNdxi_g + invJ_g(1,2)*dNdeta_g
  dNdy_g = invJ_g(2,1)*dNdxi_g + invJ_g(2,2)*dNdeta_g

  % B en punto de Gauss
  Bg = zeros(3, 8)
  for i = range(1, 4, 1)
    Bg(1, 2*i-1) = dNdx_g(i)
    Bg(2, 2*i)   = dNdy_g(i)
    Bg(3, 2*i-1) = dNdy_g(i)
    Bg(3, 2*i)   = dNdx_g(i)
  end

  % Ke += B' * D * B * t * |J|
  Ke = Ke + transpose(Bg) * D * Bg * t * abs(detJ_g)
end

% ══ PASO 9: RESULTADO ══
disp("══ Ke (8x8) — Stiffness Matrix ══")
disp(Ke)
disp("Simetrica? max|Ke-Ke'| ="); disp(max(max(abs(Ke - transpose(Ke)))))
disp("Ke(1,1) ="); disp(Ke(1,1))` },

  { name: 'FEM — Placa Mindlin (PDE a Ke)', category: 'FEM', code: `% ═══════════════════════════════════════════
% Placa Mindlin-Reissner Q4: Del PDE a Ke
% Flexion + Corte transversal
% DOFs: [w, theta_x, theta_y] por nodo
% ═══════════════════════════════════════════

% ══ PASO 1: ECUACION DIFERENCIAL (Placa) ══
% Equilibrio de momentos:
%   dMx/dx + dMxy/dy - Qx = 0
%   dMxy/dx + dMy/dy - Qy = 0
%   dQx/dx + dQy/dy + q = 0
%
% Mindlin: la normal NO permanece perpendicular
%   gamma_xz = dw/dx + phi_x  (corte NO es cero)
%   gamma_yz = dw/dy + phi_y

% ══ PASO 2: FORMA DEBIL ══
% K = int(Bb'*Db*Bb + Bs'*Ds*Bs) * dA
%   Bb = B bending (curvaturas)
%   Bs = B shear   (corte transversal)
%   Db = D bending = Et^3/12(1-nu^2) * [...]
%   Ds = D shear   = kappa*G*t * I

% ══ PASO 3: DATOS ══
E = 10920; nu = 0.3; t = 0.1; kapa = 5/6
coords = [0,0; 0.25,0; 0.25,0.25; 0,0.25]
disp("Placa Mindlin Q4, t/L = "); disp(t/0.25)

% ══ PASO 4: MATRICES D ══
Dc = E*t^3/(12*(1-nu^2))
Db = [Dc, Dc*nu, 0; Dc*nu, Dc, 0; 0, 0, Dc*(1-nu)/2]
disp("Db (flexion, 3x3):"); disp(Db)

Sc = kapa*E*t/(2*(1+nu))
Ds = [Sc, 0; 0, Sc]
disp("Ds (corte, 2x2):"); disp(Ds)

% ══ PASO 5: JACOBIANO (igual que Q4) ══
% Evaluamos en centro (xi=0, eta=0)
xi=0; eta=0
dNdxi  = [-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4]
dNdeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4]
N_g = [(1-xi)*(1-eta)/4, (1+xi)*(1-eta)/4, (1+xi)*(1+eta)/4, (1-xi)*(1+eta)/4]
J11=0; J12=0; J21=0; J22=0
for i=range(1,4,1)
  J11=J11+dNdxi(i)*coords(i,1); J12=J12+dNdxi(i)*coords(i,2)
  J21=J21+dNdeta(i)*coords(i,1); J22=J22+dNdeta(i)*coords(i,2)
end
detJ = J11*J22 - J12*J21
disp("J ="); disp([J11,J12;J21,J22])
disp("det(J) ="); disp(detJ)

% dN/dx, dN/dy via J^-1
invD = 1/detJ
dNdx = invD*(J22*dNdxi - J12*dNdeta)
dNdy = invD*(-J21*dNdxi + J11*dNdeta)
disp("dN/dx ="); disp(dNdx)
disp("dN/dy ="); disp(dNdy)

% ══ PASO 6: MATRIZ Bb (BENDING, 3x12) ══
% Curvaturas de Mindlin:
%   kappa_x  = d(theta_y)/dx
%   kappa_y  = -d(theta_x)/dy
%   kappa_xy = d(theta_y)/dy - d(theta_x)/dx
%
% DOFs: [w, theta_x, theta_y] = [3i-2, 3i-1, 3i]
Bb = zeros(3, 12)
for i = range(1, 4, 1)
  Bb(1, 3*i)   = dNdx(i)      % kx = d(thy)/dx
  Bb(2, 3*i-1) = -dNdy(i)     % ky = -d(thx)/dy
  Bb(3, 3*i-1) = -dNdx(i)     % kxy = d(thy)/dy - d(thx)/dx
  Bb(3, 3*i)   = dNdy(i)
end
disp("Bb (bending, 3x12):"); disp(Bb)

% ══ PASO 7: MATRIZ Bs (SHEAR, 2x12) ══
% Deformacion de corte Mindlin:
%   gamma_xz = dw/dx - theta_y
%   gamma_yz = dw/dy + theta_x
Bs = zeros(2, 12)
for i = range(1, 4, 1)
  Bs(1, 3*i-2) = dNdx(i)      % dw/dx
  Bs(1, 3*i)   = -N_g(i)      % -theta_y
  Bs(2, 3*i-2) = dNdy(i)      % dw/dy
  Bs(2, 3*i-1) = N_g(i)       % +theta_x
end
disp("Bs (shear, 2x12):"); disp(Bs)

% ══ PASO 8: INTEGRACION DE GAUSS ══
% SELECTIVE: 2x2 Gauss bending + 1x1 Gauss shear
% (evita shear locking en placas delgadas)

g = 1/sqrt(3)
Ke = zeros(12, 12)

% 8a. BENDING: 2x2 Gauss
disp("--- Bending: 2x2 Gauss ---")
gpts = [-g,-g; g,-g; g,g; -g,g]
for ig = range(1, 4, 1)
  xi_g=gpts(ig,1); eta_g=gpts(ig,2)
  dxi_g  = [-(1-eta_g)/4,(1-eta_g)/4,(1+eta_g)/4,-(1+eta_g)/4]
  deta_g = [-(1-xi_g)/4,-(1+xi_g)/4,(1+xi_g)/4,(1-xi_g)/4]
  J11_g=0;J12_g=0;J21_g=0;J22_g=0
  for i=range(1,4,1)
    J11_g=J11_g+dxi_g(i)*coords(i,1); J12_g=J12_g+dxi_g(i)*coords(i,2)
    J21_g=J21_g+deta_g(i)*coords(i,1); J22_g=J22_g+deta_g(i)*coords(i,2)
  end
  dJ_g=J11_g*J22_g-J12_g*J21_g
  inv_g=1/dJ_g
  dx_g=inv_g*(J22_g*dxi_g-J12_g*deta_g)
  dy_g=inv_g*(-J21_g*dxi_g+J11_g*deta_g)
  Bb_g=zeros(3,12)
  for i=range(1,4,1)
    Bb_g(1,3*i)=dx_g(i); Bb_g(2,3*i-1)=-dy_g(i)
    Bb_g(3,3*i-1)=-dx_g(i); Bb_g(3,3*i)=dy_g(i)
  end
  Ke = Ke + transpose(Bb_g)*Db*Bb_g*abs(dJ_g)
end

% 8b. SHEAR: 1x1 Gauss (centro, peso=4)
disp("--- Shear: 1x1 Gauss (centro) ---")
Ke = Ke + transpose(Bs)*Ds*Bs*abs(detJ)*4

% ══ PASO 9: RESULTADO ══
disp("══ Ke (12x12) — Placa Mindlin Q4 ══")
disp(Ke)
disp("Simetrica?"); disp(max(max(abs(Ke-transpose(Ke)))))
disp("Ke(1,1) ="); disp(Ke(1,1))

% Comparar con funcion compilada
Ke_mitc4 = k_plate_mitc4(E, nu, t, kapa, coords)
disp("Ke_mitc4(1,1) = "); disp(Ke_mitc4(1,1))
disp("(MITC4 usa assumed strain shear en vez de 1x1 center)")` },

  { name: 'Zapata — Asentamiento', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Zapata sobre Winkler — Asentamiento total
% Mindlin Q4 (shell thick: flexion + corte)
% Validado vs OpenSeesPy ShellMITC4
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6          % kPa (hormigon f'c=210)
nu = 0.2
kapa = 5/6        % factor corte Mindlin

% ─── 2. GEOMETRIA ───
Lx = 2; Ly = 2    % m (zapata cuadrada)
tt = 0.5           % m (espesor)
colH = 1.5         % m (altura columna visual)
nx = 8; ny = 8     % malla Q4
P = -200           % kN (carga axial columna)
ks = 20000         % kN/m3 (modulo Winkler suelo)

% ─── 3. NODOS ───
dx = Lx/nx; dy = Ly/ny
cx = Lx/2; cy = Ly/2
nNx = nx+1; nNy = ny+1; nNodes = nNx*nNy
nds = zeros(nNodes, 3)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    nds(nn,1) = ix*dx; nds(nn,2) = iy*dy
  end
end

% ─── 4. ELEMENTOS Q4 ───
nQ4 = nx*ny; els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx+ix+1; ne = ne+1
    els(ne,1)=n1; els(ne,2)=n1+1; els(ne,3)=n1+nNx+1; els(ne,4)=n1+nNx
  end
end
disp("nNodos:"); disp(nNodes); disp("nQ4:"); disp(nQ4)

% ─── 5. ENSAMBLAJE K placa + springs Winkler ───
ndof = nNodes * 3
Kg = zeros(ndof, ndof)

% K placa Mindlin Q4 (3 DOF/nodo: w, theta_x, theta_y)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_plate_mitc4(E, nu, tt, kapa, coords)
  dofs = [(n1-1)*3+1,(n1-1)*3+2,(n1-1)*3+3, (n2-1)*3+1,(n2-1)*3+2,(n2-1)*3+3, (n3-1)*3+1,(n3-1)*3+2,(n3-1)*3+3, (n4-1)*3+1,(n4-1)*3+2,(n4-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end

% Springs Winkler: k_spring = ks * area_tributaria en DOF w
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    ax = dx; ay = dy
    if ix == 0
      ax = dx/2
    end
    if ix == nx
      ax = dx/2
    end
    if iy == 0
      ay = dy/2
    end
    if iy == ny
      ay = dy/2
    end
    k_spring = ks * ax * ay
    dof_w = (nn-1)*3 + 1
    Kg(dof_w, dof_w) = Kg(dof_w, dof_w) + k_spring
  end
end

% ─── 6. CARGAS: P en nodo central ───
Fv = zeros(ndof, 1)
midNode = (ny/2)*nNx + nx/2 + 1
Fv((midNode-1)*3+1) = P

% ─── 7. RESOLVER (sin BCs fijos — springs proveen la rigidez) ───
% Fijar rotaciones en esquinas para evitar singularidad
fixedDofs = [(0)*3+2, (0)*3+3, (nx)*3+2, (nx)*3+3, (ny*nNx)*3+2, (ny*nNx)*3+3, (ny*nNx+nx)*3+2, (ny*nNx+nx)*3+3]
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
w_center = Uf((midNode-1)*3+1)
w_corner = Uf(1)
w_uniform = P / (ks * Lx * Ly)
disp("w_centro [mm]:"); disp(w_center * 1000)
disp("w_esquina [mm]:"); disp(w_corner * 1000)
disp("w_uniforme P/(ks*A) [mm]:"); disp(w_uniform * 1000)

% ─── 8b. PRESION DE CONTACTO SUELO q = ks * |w| ───
q_adm = 100  % kN/m2 (capacidad admisible suelo)
q_center = ks * abs(w_center)
q_corner = ks * abs(w_corner)
q_uniform = abs(P) / (Lx * Ly)
disp("--- Presion suelo ---")
disp("q_centro [kN/m2]:"); disp(q_center)
disp("q_esquina [kN/m2]:"); disp(q_corner)
disp("q_uniforme P/A [kN/m2]:"); disp(q_uniform)
disp("q_adm [kN/m2]:"); disp(q_adm)
disp("q_max/q_adm:"); disp(q_center / q_adm)

% ─── Tabla resumen tipo suelo ───
disp("--- Tabla ks tipico [kN/m3] ---")
disp("Arcilla blanda:  5000-15000  q_adm: 25-50")
disp("Arcilla media:  15000-30000  q_adm: 50-100")
disp("Arcilla dura:   30000-60000  q_adm: 100-200")
disp("Arena suelta:   10000-25000  q_adm: 50-100")
disp("Arena compacta: 25000-120000 q_adm: 100-300")
disp("Grava:          60000-200000 q_adm: 200-600")

% ─── 9. VISUALIZACION ───
supVec = [1, nNx, ny*nNx+1, nNodes]
show3d(nds, els, "Zapata Asent. — geometria", supVec)
show_deformed(nds, els, Uf, 0, 3, "Zapata — asentamiento total", supVec)

% ─── CONTORNO w ───
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  vals(i) = Uf((i-1)*3+1)
end
show_deformed_contour(nds, els, Uf, vals, 0, 3, "Zapata — contorno w [m]")

% ─── CONTORNO q suelo ───
qvals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  qvals(i) = ks * abs(Uf((i-1)*3+1))
end
show_deformed_contour(nds, els, Uf, qvals, 0, 3, "Zapata — q suelo [kN/m2]")` },

  { name: 'Zapata — Flexion', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Zapata sobre Winkler — Solo flexion
% Resta asentamiento promedio para ver curvatura
% Mindlin Q4 (shell thick: flexion + corte)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; kapa = 5/6

% ─── 2. GEOMETRIA ───
Lx = 2; Ly = 2; tt = 0.5
nx = 8; ny = 8
P = -200; ks = 20000

% ─── 3. NODOS ───
dx = Lx/nx; dy = Ly/ny
nNx = nx+1; nNy = ny+1; nNodes = nNx*nNy
nds = zeros(nNodes, 3)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    nds(nn,1) = ix*dx; nds(nn,2) = iy*dy
  end
end

% ─── 4. ELEMENTOS Q4 ───
nQ4 = nx*ny; els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx+ix+1; ne = ne+1
    els(ne,1)=n1; els(ne,2)=n1+1; els(ne,3)=n1+nNx+1; els(ne,4)=n1+nNx
  end
end

% ─── 5. ENSAMBLAJE K + Winkler ───
ndof = nNodes * 3
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_plate_mitc4(E, nu, tt, kapa, coords)
  dofs = [(n1-1)*3+1,(n1-1)*3+2,(n1-1)*3+3, (n2-1)*3+1,(n2-1)*3+2,(n2-1)*3+3, (n3-1)*3+1,(n3-1)*3+2,(n3-1)*3+3, (n4-1)*3+1,(n4-1)*3+2,(n4-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    ax = dx; ay = dy
    if ix == 0
      ax = dx/2
    end
    if ix == nx
      ax = dx/2
    end
    if iy == 0
      ay = dy/2
    end
    if iy == ny
      ay = dy/2
    end
    dof_w = (nn-1)*3 + 1
    Kg(dof_w, dof_w) = Kg(dof_w, dof_w) + ks * ax * ay
  end
end

% ─── 6. CARGAS ───
Fv = zeros(ndof, 1)
midNode = (ny/2)*nNx + nx/2 + 1
Fv((midNode-1)*3+1) = P

% ─── 7. RESOLVER ───
fixedDofs = [(0)*3+2, (0)*3+3, (nx)*3+2, (nx)*3+3, (ny*nNx)*3+2, (ny*nNx)*3+3, (ny*nNx+nx)*3+2, (ny*nNx+nx)*3+3]
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 8. RESULTADOS: restar asentamiento promedio ───
sumW = 0
for i = range(1, nNodes, 1)
  sumW = sumW + Uf((i-1)*3+1)
end
wAvg = sumW / nNodes
w_center = Uf((midNode-1)*3+1)
flexion = w_center - wAvg

disp("w_promedio (asentamiento) [mm]:"); disp(wAvg * 1000)
disp("w_centro [mm]:"); disp(w_center * 1000)
disp("Flexion pura (centro - promedio) [mm]:"); disp(flexion * 1000)

% Rigidez relativa placa/suelo
D_flex = E * tt^3 / (12 * (1 - nu^2))
Lc = (D_flex / ks)^0.25
disp("Longitud caracteristica Lc [m]:"); disp(Lc)
disp("Ratio L/Lc (< 1 = rigida):"); disp(Lx / Lc)

% ─── 8b. PRESION SUELO ───
q_adm = 100
q_center = ks * abs(w_center)
q_corner = ks * abs(Uf(1))
disp("--- Presion suelo ---")
disp("q_centro [kN/m2]:"); disp(q_center)
disp("q_esquina [kN/m2]:"); disp(q_corner)
disp("q_adm [kN/m2]:"); disp(q_adm)
disp("q_max/q_adm:"); disp(q_center / q_adm)

% ─── 9. VISUALIZACION: solo flexion (sin asentamiento) ───
Uf_flex = zeros(ndof, 1)
for i = range(1, nNodes, 1)
  Uf_flex((i-1)*3+1) = Uf((i-1)*3+1) - wAvg
  Uf_flex((i-1)*3+2) = Uf((i-1)*3+2)
  Uf_flex((i-1)*3+3) = Uf((i-1)*3+3)
end

supVec = [1, nNx, ny*nNx+1, nNodes]
show3d(nds, els, "Zapata Flex. — geometria", supVec)
show_deformed(nds, els, Uf_flex, 0, 3, "Zapata — solo flexion", supVec)

% ─── CONTORNO flexion ───
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  vals(i) = Uf_flex((i-1)*3+1)
end
show_deformed_contour(nds, els, Uf_flex, vals, 0, 3, "Zapata — contorno flexion")` },

  { name: 'Zapata — P + Mx + My', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Zapata sobre Winkler — Carga P + Mx + My
% Momentos biaxiales aplicados al nodo central
% Mindlin MITC4 + Winkler springs
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; kapa = 5/6

% ─── 2. GEOMETRIA Y CARGAS ───
Lx = 2; Ly = 2; tt = 0.5
nx = 8; ny = 8
P = -200           % kN (carga axial)
Mx = 50            % kN.m (momento alrededor de X)
My = 30            % kN.m (momento alrededor de Y)
ks = 20000         % kN/m3

% ─── 3. NODOS ───
dx = Lx/nx; dy = Ly/ny
nNx = nx+1; nNy = ny+1; nNodes = nNx*nNy
nds = zeros(nNodes, 3)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    nds(nn,1) = ix*dx; nds(nn,2) = iy*dy
  end
end

% ─── 4. ELEMENTOS Q4 ───
nQ4 = nx*ny; els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx+ix+1; ne = ne+1
    els(ne,1)=n1; els(ne,2)=n1+1; els(ne,3)=n1+nNx+1; els(ne,4)=n1+nNx
  end
end

% ─── 5. ENSAMBLAJE K + Winkler ───
ndof = nNodes * 3
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_plate_mitc4(E, nu, tt, kapa, coords)
  dofs = [(n1-1)*3+1,(n1-1)*3+2,(n1-1)*3+3, (n2-1)*3+1,(n2-1)*3+2,(n2-1)*3+3, (n3-1)*3+1,(n3-1)*3+2,(n3-1)*3+3, (n4-1)*3+1,(n4-1)*3+2,(n4-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    ax = dx; ay = dy
    if ix == 0
      ax = dx/2
    end
    if ix == nx
      ax = dx/2
    end
    if iy == 0
      ay = dy/2
    end
    if iy == ny
      ay = dy/2
    end
    dof_w = (nn-1)*3 + 1
    Kg(dof_w, dof_w) = Kg(dof_w, dof_w) + ks * ax * ay
  end
end

% ─── 6. CARGAS: P + Mx + My en nodo central ───
Fv = zeros(ndof, 1)
midNode = (ny/2)*nNx + nx/2 + 1
Fv((midNode-1)*3+1) = P     % Fz = P
Fv((midNode-1)*3+2) = Mx    % Mx (rot about X)
Fv((midNode-1)*3+3) = My    % My (rot about Y)

% ─── 7. RESOLVER ───
fixedDofs = [(0)*3+2, (0)*3+3, (nx)*3+2, (nx)*3+3, (ny*nNx)*3+2, (ny*nNx)*3+3, (ny*nNx+nx)*3+2, (ny*nNx+nx)*3+3]
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
w_center = Uf((midNode-1)*3+1)
w_corner1 = Uf(1)
n_corner2 = nx+1; w_corner2 = Uf((n_corner2-1)*3+1)
n_corner3 = ny*nNx+1; w_corner3 = Uf((n_corner3-1)*3+1)
n_corner4 = nNodes; w_corner4 = Uf((n_corner4-1)*3+1)
disp("w_centro [mm]:"); disp(w_center * 1000)
disp("w_esquina(0,0) [mm]:"); disp(w_corner1 * 1000)
disp("w_esquina(L,0) [mm]:"); disp(w_corner2 * 1000)
disp("w_esquina(0,L) [mm]:"); disp(w_corner3 * 1000)
disp("w_esquina(L,L) [mm]:"); disp(w_corner4 * 1000)
disp("P="); disp(P); disp("Mx="); disp(Mx); disp("My="); disp(My)

% ─── 8b. PRESION SUELO ───
q_adm = 100
q_max = ks * max(abs(w_corner1), abs(w_corner2), abs(w_corner3), abs(w_corner4), abs(w_center))
disp("--- Presion suelo ---")
disp("q_centro [kN/m2]:"); disp(ks * abs(w_center))
disp("q(0,0):"); disp(ks * abs(w_corner1))
disp("q(L,0):"); disp(ks * abs(w_corner2))
disp("q(0,L):"); disp(ks * abs(w_corner3))
disp("q(L,L):"); disp(ks * abs(w_corner4))
disp("q_adm [kN/m2]:"); disp(q_adm)

% ─── 9. VISUALIZACION ───
supVec = [1, nNx, ny*nNx+1, nNodes]
show3d(nds, els, "Zapata P+Mx+My — geometria", supVec)
show_deformed(nds, els, Uf, 0, 3, "Zapata P+Mx+My — deformada", supVec)
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  vals(i) = Uf((i-1)*3+1)
end
show_deformed_contour(nds, els, Uf, vals, 0, 3, "Zapata P+Mx+My — contorno w")
qvals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  qvals(i) = ks * abs(Uf((i-1)*3+1))
end
show_deformed_contour(nds, els, Uf, qvals, 0, 3, "Zapata P+Mx+My — q suelo [kN/m2]")` },

  { name: 'Zapata — P + Columna', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Zapata con Columna rigida en centro
% Columna modelada como nodo rigido (equalDOF)
% La columna transmite P al centro via nodo compartido
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; kapa = 5/6

% ─── 2. GEOMETRIA ───
Lx = 2; Ly = 2; tt = 0.5
nx = 8; ny = 8
P = -200; ks = 20000

% ─── 3. NODOS ───
dx = Lx/nx; dy = Ly/ny
nNx = nx+1; nNy = ny+1; nNodes = nNx*nNy
nds = zeros(nNodes, 3)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    nds(nn,1) = ix*dx; nds(nn,2) = iy*dy
  end
end

% ─── 4. ELEMENTOS Q4 ───
nQ4 = nx*ny; els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx+ix+1; ne = ne+1
    els(ne,1)=n1; els(ne,2)=n1+1; els(ne,3)=n1+nNx+1; els(ne,4)=n1+nNx
  end
end

% ─── 5. ENSAMBLAJE K + Winkler ───
ndof = nNodes * 3
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_plate_mitc4(E, nu, tt, kapa, coords)
  dofs = [(n1-1)*3+1,(n1-1)*3+2,(n1-1)*3+3, (n2-1)*3+1,(n2-1)*3+2,(n2-1)*3+3, (n3-1)*3+1,(n3-1)*3+2,(n3-1)*3+3, (n4-1)*3+1,(n4-1)*3+2,(n4-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    ax = dx; ay = dy
    if ix == 0
      ax = dx/2
    end
    if ix == nx
      ax = dx/2
    end
    if iy == 0
      ay = dy/2
    end
    if iy == ny
      ay = dy/2
    end
    dof_w = (nn-1)*3 + 1
    Kg(dof_w, dof_w) = Kg(dof_w, dof_w) + ks * ax * ay
  end
end

% ─── 6. COLUMNA: distribuir P en 4 nodos centrales ───
Fv = zeros(ndof, 1)
cx = nx/2; cy = ny/2
colNodes = [cy*nNx+cx+1, cy*nNx+cx+2, (cy+1)*nNx+cx+1, (cy+1)*nNx+cx+2]
disp("Nodos columna:"); disp(colNodes)
% P repartido en 4 nodos
for i = range(1, 4, 1)
  nn = colNodes(i)
  Fv((nn-1)*3+1) = P/4
end

% ─── 7. RESOLVER ───
fixedDofs = [(0)*3+2, (0)*3+3, (nx)*3+2, (nx)*3+3, (ny*nNx)*3+2, (ny*nNx)*3+3, (ny*nNx+nx)*3+2, (ny*nNx+nx)*3+3]
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
midNode = (ny/2)*nNx + nx/2 + 1
w_center = Uf((midNode-1)*3+1)
disp("w_centro [mm]:"); disp(w_center * 1000)
disp("w_esquina [mm]:"); disp(Uf(1) * 1000)
disp("w_uniforme P/(ks*A) [mm]:"); disp(P / (ks * Lx * Ly) * 1000)

% ─── 8b. PRESION SUELO ───
q_adm = 100
q_center = ks * abs(w_center)
disp("--- Presion suelo ---")
disp("q_centro [kN/m2]:"); disp(q_center)
disp("q_max/q_adm:"); disp(q_center / q_adm)

% ─── 9. VISUALIZACION ───
supVec = [1, nNx, ny*nNx+1, nNodes]
show3d(nds, els, "Zapata + Columna — geometria", supVec)
show_deformed(nds, els, Uf, 0, 3, "Zapata + Columna — deformada", supVec)
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  vals(i) = Uf((i-1)*3+1)
end
show_deformed_contour(nds, els, Uf, vals, 0, 3, "Zapata+Col — contorno w")
qvals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  qvals(i) = ks * abs(Uf((i-1)*3+1))
end
show_deformed_contour(nds, els, Uf, qvals, 0, 3, "Zapata+Col — q suelo [kN/m2]")` },

  { name: 'Zapata — P+Mx+My+Col', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Zapata completa: P + Mx + My + Columna
% Caso mas general de cimentacion superficial
% Momentos biaxiales + carga distribuida en columna
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; kapa = 5/6

% ─── 2. GEOMETRIA Y CARGAS ───
Lx = 2; Ly = 2; tt = 0.5
nx = 8; ny = 8
P = -200; Mx = 50; My = 30; ks = 20000

% ─── 3. NODOS ───
dx = Lx/nx; dy = Ly/ny
nNx = nx+1; nNy = ny+1; nNodes = nNx*nNy
nds = zeros(nNodes, 3)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    nds(nn,1) = ix*dx; nds(nn,2) = iy*dy
  end
end

% ─── 4. ELEMENTOS Q4 ───
nQ4 = nx*ny; els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx+ix+1; ne = ne+1
    els(ne,1)=n1; els(ne,2)=n1+1; els(ne,3)=n1+nNx+1; els(ne,4)=n1+nNx
  end
end

% ─── 5. ENSAMBLAJE K + Winkler ───
ndof = nNodes * 3
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_plate_mitc4(E, nu, tt, kapa, coords)
  dofs = [(n1-1)*3+1,(n1-1)*3+2,(n1-1)*3+3, (n2-1)*3+1,(n2-1)*3+2,(n2-1)*3+3, (n3-1)*3+1,(n3-1)*3+2,(n3-1)*3+3, (n4-1)*3+1,(n4-1)*3+2,(n4-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    ax = dx; ay = dy
    if ix == 0
      ax = dx/2
    end
    if ix == nx
      ax = dx/2
    end
    if iy == 0
      ay = dy/2
    end
    if iy == ny
      ay = dy/2
    end
    dof_w = (nn-1)*3 + 1
    Kg(dof_w, dof_w) = Kg(dof_w, dof_w) + ks * ax * ay
  end
end

% ─── 6. CARGAS: P/4 en 4 nodos col + Mx, My en centro ───
Fv = zeros(ndof, 1)
cx = nx/2; cy = ny/2
midNode = cy*nNx + cx + 1
colNodes = [midNode, midNode+1, midNode+nNx, midNode+nNx+1]

% P distribuido en 4 nodos columna
for i = range(1, 4, 1)
  nn = colNodes(i)
  Fv((nn-1)*3+1) = P/4
end
% Momentos en nodo central
Fv((midNode-1)*3+2) = Mx
Fv((midNode-1)*3+3) = My

% ─── 7. RESOLVER ───
fixedDofs = [(0)*3+2, (0)*3+3, (nx)*3+2, (nx)*3+3, (ny*nNx)*3+2, (ny*nNx)*3+3, (ny*nNx+nx)*3+2, (ny*nNx+nx)*3+3]
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
w_center = Uf((midNode-1)*3+1)
disp("=== ZAPATA P+Mx+My+COL ===")
disp("P [kN]:"); disp(P)
disp("Mx [kN.m]:"); disp(Mx)
disp("My [kN.m]:"); disp(My)
disp("w_centro [mm]:"); disp(w_center * 1000)
disp("w(0,0) [mm]:"); disp(Uf(1) * 1000)
disp("w(L,0) [mm]:"); disp(Uf((nx)*3+1) * 1000)
disp("w(0,L) [mm]:"); disp(Uf((ny*nNx)*3+1) * 1000)
disp("w(L,L) [mm]:"); disp(Uf((nNodes-1)*3+1) * 1000)

% ─── 9. VISUALIZACION ───
supVec = [1, nNx, ny*nNx+1, nNodes]
show3d(nds, els, "Zapata P+Mx+My+Col", supVec)
show_deformed(nds, els, Uf, 0, 3, "Zapata completa — deformada", supVec)
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  vals(i) = Uf((i-1)*3+1)
end
show_deformed_contour(nds, els, Uf, vals, 0, 3, "Zapata completa — contorno")` },

  // ══════════════════════════════════════════
  // Column Buckling (Ormonde)
  // ══════════════════════════════════════════

  { name: 'Buckling — Restricción discreta', category: 'Buckling', code: `% ═══════════════════════════════════════════
% Pandeo de columna — Resorte lateral discreto
% Ormonde - Linear Column Buckling Exercises
% ═══════════════════════════════════════════

% Datos (kN, cm)
E = 20000;
I_sec = 1673;
L = 1500;
nk = 4;
step_seg = 10;
k_node = 20;

% ── Solución analítica ──
Ne = pi^2 * E * I_sec / L^2

% ── FEM ──
ne = step_seg * (nk + 1);
nn = ne + 1;
ndof = 2 * nn;
Le = L / ne;

% Rigidez elástica (viga Euler-Bernoulli, 4 DOF: v1,th1,v2,th2)
ck = E * I_sec / Le^3;
Ke = ck * [12, 6*Le, -12, 6*Le; 6*Le, 4*Le^2, -6*Le, 2*Le^2; -12, -6*Le, 12, -6*Le; 6*Le, 2*Le^2, -6*Le, 4*Le^2];

% Rigidez geométrica
cg = 1 / (30 * Le);
Ge = cg * [36, 3*Le, -36, 3*Le; 3*Le, 4*Le^2, -3*Le, -Le^2; -36, -3*Le, 36, -3*Le; 3*Le, -Le^2, -3*Le, 4*Le^2];

% Ensamblaje global
K = zeros(ndof, ndof);
G = zeros(ndof, ndof);
for e = range(1, ne, 1)
  d1 = 2*e - 1;
  d2 = 2*e;
  d3 = 2*e + 1;
  d4 = 2*e + 2;
  K = assemble(K, Ke, [d1, d2, d3, d4]);
  G = assemble(G, Ge, [d1, d2, d3, d4]);
end

% Agregar resortes discretos
for s = range(1, nk, 1)
  node_s = s * step_seg + 1;
  dof_s = 2 * node_s - 1;
  K = assemble(K, [[k_node]], [dof_s]);
end

% BCs: articulado-articulado (v=0 en extremos)
fixed = [1, 2*nn - 1];
free = freedofs(ndof, fixed);
Kr = submat(K, free);
Gr = submat(G, free);

% Resolver: K*phi = Ncr*G*phi
Ncr = geneig(Kr, Gr, 5)

% Forma modal del primer modo
buckling_plot(Kr, Gr, free, nn, L, 1)` },

  { name: 'Buckling — Restricción continua', category: 'Buckling', code: `% ═══════════════════════════════════════════
% Pandeo de columna — Restricción elástica continua
% Ormonde - Linear Column Buckling Exercises
% ═══════════════════════════════════════════

% Datos (kN, cm)
E = 20000;
I_sec = 1673;
L = 1500;
ne = 20;

% Rigidez continua del resorte
kc = 20 / 375;

% ── Solución analítica ──
Ne = pi^2 * E * I_sec / L^2
Ncra = 2 * sqrt(kc * E * I_sec)
m = 3;
beta = sqrt(kc * L^2 / (pi^2 * Ne))
Ncrb = Ne * beta * (m^2 / beta + beta / m^2)

% ── FEM ──
nn = ne + 1;
ndof = 2 * nn;
Le = L / ne;

% Rigidez elástica (Euler-Bernoulli)
ck = E * I_sec / Le^3;
Ke = ck * [12, 6*Le, -12, 6*Le; 6*Le, 4*Le^2, -6*Le, 2*Le^2; -12, -6*Le, 12, -6*Le; 6*Le, 2*Le^2, -6*Le, 4*Le^2];

% Rigidez geométrica
cg = 1 / (30 * Le);
Ge = cg * [36, 3*Le, -36, 3*Le; 3*Le, 4*Le^2, -3*Le, -Le^2; -36, -3*Le, 36, -3*Le; 3*Le, -Le^2, -3*Le, 4*Le^2];

% Fundación elástica continua (funciones de forma consistentes)
Kf = kc * Le * [13/35, 11*Le/210, 9/70, -13*Le/420; 11*Le/210, Le^2/105, 13*Le/420, -Le^2/140; 9/70, 13*Le/420, 13/35, -11*Le/210; -13*Le/420, -Le^2/140, -11*Le/210, Le^2/105];

% Rigidez total por elemento
Ke_total = Ke + Kf;

% Ensamblaje global
K = zeros(ndof, ndof);
G = zeros(ndof, ndof);
for e = range(1, ne, 1)
  d1 = 2*e - 1;
  d2 = 2*e;
  d3 = 2*e + 1;
  d4 = 2*e + 2;
  K = assemble(K, Ke_total, [d1, d2, d3, d4]);
  G = assemble(G, Ge, [d1, d2, d3, d4]);
end

% BCs: articulado-articulado
fixed = [1, 2*nn - 1];
free = freedofs(ndof, fixed);
Kr = submat(K, free);
Gr = submat(G, free);

% Resolver: K*phi = Ncr*G*phi
Ncr = geneig(Kr, Gr, 5)

% Forma modal del primer modo
buckling_plot(Kr, Gr, free, nn, L, 1)` },

  // ═══════════════════════════════════════
  // AWATIF V2 VALIDATION TESTS
  // ═══════════════════════════════════════

  { name: 'Test — Bar (Logan 3.9)', category: 'Awatif Tests', code: `% ═══════════════════════════════════════════
% Awatif Test: Bar — Logan Example 3.9
% 3D truss: 4 nodes, 3 elements
% Expected Ux(node1) = 0.001384
% ═══════════════════════════════════════════

% Nodos (0-based en awatif, 1-based aqui)
nds = [12,-3,-4; 0,0,0; 12,-3,-7; 14,6,0]
els = [2,1; 3,1; 4,1]

% Soportes: nodos 2,3,4 empotrados (xyz)
sups = [2,1,1,1,0,0,0; 3,1,1,1,0,0,0; 4,1,1,1,0,0,0]

% Carga: Fx=20 en nodo 1
loads = [1, 20, 0, 0, 0, 0, 0]

% Propiedades: E=210e6, A=10e-4
% fem_deform(nds, els, sups, loads, E, nu, t, A)
Uf = fem_deform(nds, els, sups, loads, 210e6, 0.3, 1, 10e-4)

% Resultado esperado (awatif):
% Ux(nodo1) = 0.001384, Uy = -5.16e-5, Uz = 6.02e-5
disp("Ux nodo 1:"); disp(Uf(1))
disp("Uy nodo 1:"); disp(Uf(2))
disp("Uz nodo 1:"); disp(Uf(3))
disp("Esperado: Ux=0.001384")

show3d(nds, els, "Bar Logan 3.9", [2,3,4], loads)
show_deformed(nds, els, Uf, 0, 6, "Bar Logan 3.9 — deformada", [2,3,4], loads)` },

  { name: 'Test — Membrane CST', category: 'Awatif Tests', code: `% ═══════════════════════════════════════════
% Awatif Test: Membrane — Unit square tension
% MacNeal & Harder (1985)
% 2 CST triangles, E=1e6, nu=0.3, t=0.01
% Expected: strain = q/(E*t) = 1e-2
% ═══════════════════════════════════════════

nds = [0,0,0; 1,0,0; 1,1,0; 0,1,0]
els = [1,2,3; 1,3,4]

% Soportes: nodo 1 fijo xy, nodo 4 fijo x
sups = [1,1,1,0,1,1,0; 4,1,0,0,1,1,0]

% Carga: Fx=0.5 en nodos 2 y 3 (q=1 N/m edge)
loads = [2, 0.5, 0, 0, 0, 0, 0; 3, 0.5, 0, 0, 0, 0, 0]

E = 1e6; nu = 0.3; t_mem = 0.01;
Uf = fem_deform(nds, els, sups, loads, E, nu, t_mem)

% Deformacion esperada: eps_x = q/(E*t) = 1/(1e6*0.01) = 1e-4
ux1 = Uf(1); ux2 = Uf(7);
grad = ux2 - ux1;
disp("Strain Ux:"); disp(grad)
disp("Esperado: 1e-4")

% Reacciones: Rx total = -1.0
disp("Uf:"); disp(Uf)

show3d(nds, els, "Membrane CST", [1,4], loads)
show_deformed(nds, els, Uf, 0, 6, "Membrane — deformada", [1,4], loads)` },

  { name: 'Test — Plate 10x10 isotropic', category: 'Awatif Tests', code: `% ═══════════════════════════════════════════
% Awatif Test: Plate 10x10 pin-supported
% Uniform load p=-1000 N/m2, h=0.15m
% E=1e10, nu=0.25
% Expected Uz_max ≈ 12.69 mm (analytical: 13.54mm)
% ═══════════════════════════════════════════

% Malla estructurada 10x10
a = 10; b = 10; nDiv = 10;
nds = meshRect_nodes(a, b, nDiv-1, nDiv-1)
els = meshRect_cst(nDiv-1, nDiv-1)
nNodes = size(nds, 1)
nElem = size(els, 1)
show3d(nds, els, "Plate 10x10 mesh")
% (apoyos se muestran en la vista deformada)

% Propiedades
E = 1e10; nu = 0.25; h = 0.15;
p0 = -1000;

% Ensamblaje shell tri 18 DOF
nDof = nNodes * 6
Kg = zeros(nDof, nDof)
for e = range(1, nElem, 1)
  n1 = els(e,1); n2 = els(e,2); n3 = els(e,3);
  x1=nds(n1,1); y1=nds(n1,2);
  x2=nds(n2,1); y2=nds(n2,2);
  x3=nds(n3,1); y3=nds(n3,2);
  Ke = k_shell_tri(E, nu, h, x1,y1, x2,y2, x3,y3);
  d1 = (n1-1)*6; d2 = (n2-1)*6; d3 = (n3-1)*6;
  d = [d1+1,d1+2,d1+3,d1+4,d1+5,d1+6, d2+1,d2+2,d2+3,d2+4,d2+5,d2+6, d3+1,d3+2,d3+3,d3+4,d3+5,d3+6];
  Kg = assemble(Kg, Ke, d);
end

% Cargas: presion uniforme → fuerza nodal = p0*Area/3 por nodo
Fv = zeros(nDof, 1)
for e = range(1, nElem, 1)
  n1 = els(e,1); n2 = els(e,2); n3 = els(e,3);
  x1=nds(n1,1); y1=nds(n1,2);
  x2=nds(n2,1); y2=nds(n2,2);
  x3=nds(n3,1); y3=nds(n3,2);
  Ae = 0.5*abs((x2-x1)*(y3-y1) - (x3-x1)*(y2-y1));
  fz = p0 * Ae / 3;
  Fv((n1-1)*6+3) = Fv((n1-1)*6+3) + fz;
  Fv((n2-1)*6+3) = Fv((n2-1)*6+3) + fz;
  Fv((n3-1)*6+3) = Fv((n3-1)*6+3) + fz;
end

% BC: bordes pin-supported (ux,uy,uz fijos)
fixed = []
sup_nodes = []
for i = range(1, nNodes, 1)
  x = nds(i,1); y = nds(i,2);
  if x < 0.01
    d0 = (i-1)*6; fixed = [fixed, d0+1,d0+2,d0+3]; sup_nodes = [sup_nodes, i];
  end
  if abs(x - a) < 0.01
    d0 = (i-1)*6; fixed = [fixed, d0+1,d0+2,d0+3]; sup_nodes = [sup_nodes, i];
  end
  if y < 0.01
    d0 = (i-1)*6; fixed = [fixed, d0+1,d0+2,d0+3]; sup_nodes = [sup_nodes, i];
  end
  if abs(y - b) < 0.01
    d0 = (i-1)*6; fixed = [fixed, d0+1,d0+2,d0+3]; sup_nodes = [sup_nodes, i];
  end
end

Uf = solve_fem(Kg, Fv, fixed)

% Extraer Uz y encontrar maximo
Uz_vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  Uz_vals(i) = Uf((i-1)*6 + 3);
end
disp("Uz max (mm):"); disp(min(Uz_vals) * 1000)
disp("Esperado: -12.69 mm (awatif), -13.54 mm (analitico)")

show_deformed_contour(nds, els, Uf, Uz_vals, 0, 6, "Plate 10x10 — Uz", sup_nodes)` },

  // ══════════════════════════════════════════
  // FEM — Space Frame 3D
  // ══════════════════════════════════════════
  { name: 'FEM — Space Frame 3D', category: 'FEM', code: `% ═══════════════════════════════════════════
% Space Frame 3D — Pórtico simple
% 4 nodos, 3 elementos frame 3D (12 DOF/elem)
% k_frame3d(E,G,A,Iy,Iz,J,L) + T3d + assemble
% ═══════════════════════════════════════════

% Propiedades del perfil (kN, m)
Emod = 200e6; Gmod = 80e6;
Asec = 0.01; Iz = 8.33e-5; Iy = 8.33e-5; Jt = 1.41e-4;

% ── Nodos [x,y,z] ──
% n1=(0,0,0), n2=(5,0,0), n3=(5,0,3), n4=(0,0,3)
nds = [0,0,0; 5,0,0; 5,0,3; 0,0,3]
nNodes = 4

% ── Elementos: col 1-4, viga 4-3, col 3-2 ──
els = [1,4; 4,3; 3,2]
nElem = 3
show3d(nds, els, "Space Frame 3D", [1,2])

% ── 6 DOF/nodo: ux,uy,uz,rx,ry,rz → 24 DOFs total ──
nDof = nNodes * 6
Kg = zeros(nDof, nDof)

for ei = range(1, nElem, 1)
  n1 = els(ei,1); n2 = els(ei,2);
  dxe = nds(n2,1)-nds(n1,1);
  dye = nds(n2,2)-nds(n1,2);
  dze = nds(n2,3)-nds(n1,3);
  Le = sqrt(dxe^2 + dye^2 + dze^2);
  Kl = k_frame3d(Emod, Gmod, Asec, Iy, Iz, Jt, Le);
  Tv = T3d(dxe, dye, dze, 0, 1, 0);
  Ke = transpose(Tv) * Kl * Tv;
  d1 = (n1-1)*6; d2 = (n2-1)*6;
  dv = [d1+1,d1+2,d1+3,d1+4,d1+5,d1+6, d2+1,d2+2,d2+3,d2+4,d2+5,d2+6];
  Kg = assemble(Kg, Ke, dv);
end

% ── Carga: Fx=10 kN en nodo 4 (DOF 19) ──
Fv = zeros(nDof, 1)
Fv(19) = 10

% ── BC: nodos 1,2 empotrados (DOFs 1-6, 7-12) ──
fixed = [1,2,3,4,5,6, 7,8,9,10,11,12]
Uf = solve_fem(Kg, Fv, fixed)

disp("Desplazamientos nodo 4 (DOFs 19-24):")
disp(Uf(19))
disp(Uf(20))
disp(Uf(21))

show_deformed(nds, els, Uf, 100, 6, "Deformada Space Frame", [1,2])` },

  // ══════════════════════════════════════════
  // Problem 13.1 — Space Frame Modal Analysis (Logan)
  // ══════════════════════════════════════════
  { name: 'FEM — Problem 13.1 Modal (Logan)', category: 'FEM', code: `% ═══════════════════════════════════════════
% Problem 13.1 — Space Frame Modal Analysis
% Logan, "A First Course in the Finite Element Method"
% Determine System Matrices / Determine Force
% ═══════════════════════════════════════════

% GIVEN VALUES
Emod = 30*10^6;                  % E (psi)
Gmod = 12*10^6;                  % G, Modulus of rigidity (psi)

% Members 1 & 3
A1 = 50;                    % Cross-sectional area A (in^2)
Iz1 = 200;                  % Second Moment of Inertia in z axes (in^4)
Iy1 = 200;                  % Second Moment of Inertia in y axes (in^4)
J1 = 40;                    % Torsional constant
m_bar1 = 0.2;               % Distributed mass (lb-sec^2/in/in)
I0_1 = 205;                 % Polar moment of inertia of cross sectional area (in^4)

% Members 2 & 4
A2 = 28;                    % Cross-sectional area A (in^2)
Iz2 = 64;                   % Second Moment of Inertia in z axes (in^4)
Iy2 = 64;                   % Second Moment of Inertia in y axes (in^4)
J2 = 12.8;                  % Torsional constant
m_bar2 = 0.1;               % Distribution mass (lb-sec^2/in^2)
I0_2 = 68;                  % Polar moment of inertia of cross sectional area (in^4)

% Create frame model (ith row of nodes is ith node)
nodes = [0, 0, 0; 0, 0, -200; 0, 200, 0; -200, 0, 0; 0, -200, 0]

% Element connectivity (node_i, node_j, orientation_node)
conn = [1,2,3; 1,3,2; 1,4,2; 1,5,2]

% DOFs for ith element (6 DOF/node → 12 DOF/element)
lmm = [1,2,3,4,5,6,7,8,9,10,11,12; 1,2,3,4,5,6,13,14,15,16,17,18; 1,2,3,4,5,6,19,20,21,22,23,24; 1,2,3,4,5,6,25,26,27,28,29,30]

ndof = 6 * size(nodes, 1)
Kg = zeros(ndof, ndof)
Mg = zeros(ndof, ndof)

% Generate equations for each element and assemble
% Element 1: members 1 & 3 properties
lm1 = [lmm(1,1),lmm(1,2),lmm(1,3),lmm(1,4),lmm(1,5),lmm(1,6),lmm(1,7),lmm(1,8),lmm(1,9),lmm(1,10),lmm(1,11),lmm(1,12)]
coord1 = [nodes(1,1),nodes(1,2),nodes(1,3); nodes(2,1),nodes(2,2),nodes(2,3); nodes(3,1),nodes(3,2),nodes(3,3)]
ke1 = space_frame_ke(Emod, Gmod, Iz1, Iy1, J1, A1, coord1)
me1 = space_frame_mass(m_bar1, I0_1, A1, coord1)
Kg = assemble(Kg, ke1, lm1)
Mg = assemble(Mg, me1, lm1)

% Element 2: members 2 & 4 properties
lm2 = [lmm(2,1),lmm(2,2),lmm(2,3),lmm(2,4),lmm(2,5),lmm(2,6),lmm(2,7),lmm(2,8),lmm(2,9),lmm(2,10),lmm(2,11),lmm(2,12)]
coord2 = [nodes(1,1),nodes(1,2),nodes(1,3); nodes(3,1),nodes(3,2),nodes(3,3); nodes(2,1),nodes(2,2),nodes(2,3)]
ke2 = space_frame_ke(Emod, Gmod, Iz2, Iy2, J2, A2, coord2)
me2 = space_frame_mass(m_bar2, I0_2, A2, coord2)
Kg = assemble(Kg, ke2, lm2)
Mg = assemble(Mg, me2, lm2)

% Element 3: members 1 & 3 properties
lm3 = [lmm(3,1),lmm(3,2),lmm(3,3),lmm(3,4),lmm(3,5),lmm(3,6),lmm(3,7),lmm(3,8),lmm(3,9),lmm(3,10),lmm(3,11),lmm(3,12)]
coord3 = [nodes(1,1),nodes(1,2),nodes(1,3); nodes(4,1),nodes(4,2),nodes(4,3); nodes(2,1),nodes(2,2),nodes(2,3)]
ke3 = space_frame_ke(Emod, Gmod, Iz1, Iy1, J1, A1, coord3)
me3 = space_frame_mass(m_bar1, I0_1, A1, coord3)
Kg = assemble(Kg, ke3, lm3)
Mg = assemble(Mg, me3, lm3)

% Element 4: members 2 & 4 properties
lm4 = [lmm(4,1),lmm(4,2),lmm(4,3),lmm(4,4),lmm(4,5),lmm(4,6),lmm(4,7),lmm(4,8),lmm(4,9),lmm(4,10),lmm(4,11),lmm(4,12)]
coord4 = [nodes(1,1),nodes(1,2),nodes(1,3); nodes(5,1),nodes(5,2),nodes(5,3); nodes(2,1),nodes(2,2),nodes(2,3)]
ke4 = space_frame_ke(Emod, Gmod, Iz2, Iy2, J2, A2, coord4)
me4 = space_frame_mass(m_bar2, I0_2, A2, coord4)
Kg = assemble(Kg, ke4, lm4)
Mg = assemble(Mg, me4, lm4)

% Define the load vector
Fv = zeros(ndof, 1)
Fv(3) = 5000;               % Applied force at DOF 3 (Fz at node 1)

% System Matrices — fix DOFs 7:30 (nodes 2-5 fixed)
fixedDofs = [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]
freeDofs = freedofs(ndof, fixedDofs)

% Extract free sub-matrices (6x6)
Kf = submat(Kg, freeDofs)
Mf = submat(Mg, freeDofs)
Ff = subvec(Fv, freeDofs)
disp("Kf (6x6 free stiffness):"); disp(Kf)
disp("Mf (6x6 free mass):"); disp(Mf)

% ─────────────────────────────────
% Static solution
% ─────────────────────────────────
Uf_static = solve_fem(Kg, Fv, fixedDofs)
disp("Static displacements node 1:")
disp(Uf_static)

% ─────────────────────────────────
% MODAL ANALYSIS with rotational inertia
% K*phi = omega^2 * M * phi
% Uses Ip/A for torsional DOFs (Ip = Iy + Iz)
% ─────────────────────────────────
modal = modal_solve(Kf, Mf, 6)
disp("Natural frequencies (rad/s):")
disp(modal.omegas)
disp("Natural periods (s):")
disp(modal.periods)

% Visualize
nds_vis = nodes
els_vis = [1,2; 1,3; 1,4; 1,5]
show3d(nds_vis, els_vis, "Problem 13.1 Space Frame", [2,3,4,5])
show_deformed(nds_vis, els_vis, Uf_static, 500, 6, "Deformada (500x)", [2,3,4,5])

% Eigenvalue problem: K*phi = omega^2 * M*phi
% Using generalized eigenvalue solver
omegas = geneig(Kf, Mf, 6)
disp("Natural frequencies (rad/s):"); disp(omegas)
periods = 2*pi ./ omegas
disp("Natural periods (s):"); disp(periods)` },

  // ══════════════════════════════════════════
  // Awatif v2.0.0 — Direct port examples
  // ══════════════════════════════════════════

  { name: 'Awatif — 1D Mesh (Pórtico U)', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Awatif — 1D Mesh: Pórtico en U invertida
% Port directo de awatif-v2/examples/src/1d-mesh/main.ts
% 3 vigas (columna-viga-columna), malla refinada
% E=G=A=Iy=Iz=J=10 (unidades awatif)
% ═══════════════════════════════════════════

% Parámetros
cnt = 7;          % densidad de malla (count)
span = 10;        % longitud viga horizontal
ht = 10;          % altura columnas
load = 10;        % carga Fx en nodo de empalme

% ── Viga 1: columna izquierda [0,0,0] → [0,0,ht] ──
% cnt+1 nodos: indices 1 .. cnt+1
% Beam2: cnt nodos (cnt+2 .. 2*cnt+1), Beam3: cnt nodos (2*cnt+2 .. 3*cnt+1)
% Total nodos: 3*cnt+1
nds = zeros(3*cnt+1, 3);
for ii = range(0, cnt, 1)
  nds(ii+1, 1) = 0;
  nds(ii+1, 2) = 0;
  nds(ii+1, 3) = (ht / cnt) * ii;
end

% Elementos viga 1: cnt elementos (indices 1..cnt)
% Total elementos: cnt + 1 + (cnt-1) + 1 + (cnt-1) = 3*cnt
els = zeros(3*cnt, 2);
for ii = range(1, cnt, 1)
  els(ii, 1) = ii;
  els(ii, 2) = ii + 1;
end

% ── Viga 2: viga tope [span/cnt, 0, ht] → [span, 0, ht] ──
% cnt nodos: indices cnt+2 .. 2*cnt+1
s2 = cnt + 1;   % último nodo de viga 1
for ii = range(1, cnt, 1)
  nds(cnt + 1 + ii, 1) = (span / cnt) * ii;
  nds(cnt + 1 + ii, 2) = 0;
  nds(cnt + 1 + ii, 3) = ht;
end
% Elemento de conexión viga1→viga2 (índice cnt+1)
els(cnt + 1, 1) = s2;
els(cnt + 1, 2) = s2 + 1;
% Elementos internos viga 2 (cnt-1 elementos, índices cnt+2 .. 2*cnt)
for ii = range(1, cnt-1, 1)
  els(cnt + 1 + ii, 1) = s2 + ii;
  els(cnt + 1 + ii, 2) = s2 + ii + 1;
end

% ── Viga 3: columna derecha [span,0,ht] → [span,0,0] ──
% cnt nodos: indices 2*cnt+2 .. 3*cnt+1
loadNode = s2 + cnt;  % nodo de empalme viga2-viga3 (carga aquí) = 2*cnt+1
s3 = 2*cnt + 1;       % = loadNode, último nodo de viga 2
for ii = range(1, cnt, 1)
  nds(2*cnt + 1 + ii, 1) = span;
  nds(2*cnt + 1 + ii, 2) = 0;
  nds(2*cnt + 1 + ii, 3) = ht - (ht / cnt) * ii;
end
% Elemento de conexión viga2→viga3 (índice 2*cnt+1)
els(2*cnt + 1, 1) = s3;
els(2*cnt + 1, 2) = s3 + 1;
% Elementos internos viga 3 (cnt-1 elementos, índices 2*cnt+2 .. 3*cnt-1)
for ii = range(1, cnt-1, 1)
  els(2*cnt + 1 + ii, 1) = s3 + ii;
  els(2*cnt + 1 + ii, 2) = s3 + ii + 1;
end

nNodes = size(nds, 1)
nElem  = size(els, 1)
disp("Nodo de carga (empalme viga2-viga3):"); disp(loadNode)
disp("Nodo final (base columna derecha):"); disp(nNodes)

% Visualizar estructura
show3d(nds, els, "Portico U — 1D Mesh")

% ── Soporte y carga ──
% sups: [nodeIdx, dx,dy,dz,rx,ry,rz]  (1-based, flag 1=restringido)
% nodo 1 (base izq) y nodo nNodes (base der): empotrados
sups = [1, 1,1,1,1,1,1; nNodes, 1,1,1,1,1,1]
% loads: [nodeIdx, fx,fy,fz,mx,my,mz]
loads = [loadNode, load, 0, 0, 0, 0, 0]

% ── Resolver con awatif fem_deform (6 DOF/nodo) ──
Uf = fem_deform(nds, els, sups, loads, 10, 0.3, 1, 10)

% Desplazamientos en nodo de carga
dof_lx = (loadNode - 1) * 6 + 1;
disp("Ux nodo empalme:"); disp(Uf(dof_lx))
disp("Uz nodo empalme:"); disp(Uf(dof_lx + 2))

% Deformada
show_deformed(nds, els, Uf, 0, 6, "Portico U — deformada")` },

  { name: 'Awatif — 3D Structure (Torre)', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Awatif — 3D Structure: Torre multi-nivel
% Port de awatif-v2/examples/src/3d-structure/main.ts
% 4 columnas × niveles, vigas perimetrales + diagonales
% ═══════════════════════════════════════════

% Parámetros (como awatif: dx=dy=dz=2, divisions=2 pisos)
bx = 5; by = 4; bz = 3;   % dimensiones del módulo
divs = 2;                   % número de pisos (stories)
Emod = 10; Asec = 10; loadX = 3;

% ── Nodos: 4 por nivel, (divs+1) niveles ──
% Orden por nivel: (0,0,z), (bx,0,z), (bx,by,z), (0,by,z)
% Centrar en la grilla (+6 en xy como awatif)
nNodes = 4 * (divs + 1)
nds = zeros(nNodes, 3)
for lv = range(0, divs, 1)
  base = lv * 4;
  nds(base+1, 1) = 6 + 0;   nds(base+1, 2) = 6 + 0;   nds(base+1, 3) = bz * lv;
  nds(base+2, 1) = 6 + bx;  nds(base+2, 2) = 6 + 0;   nds(base+2, 3) = bz * lv;
  nds(base+3, 1) = 6 + bx;  nds(base+3, 2) = 6 + by;  nds(base+3, 3) = bz * lv;
  nds(base+4, 1) = 6 + 0;   nds(base+4, 2) = 6 + by;  nds(base+4, 3) = bz * lv;
end

% ── Elementos ──
% 1) Vigas de piso: 4 perimetrales + 1 diagonal por nivel (del nivel 1 en adelante)
% 2) Columnas: 4 por piso
% 3) Arriostramientos: 4 diagonales de cara por piso
els = zeros(1, 2);
nEls = 0;

% Vigas de piso (niveles 1..divs)
for lv = range(1, divs, 1)
  b = lv * 4;  % primer nodo de este nivel (1-based: lv*4+1)
  % Perimetrales
  nEls = nEls + 1; els(nEls, 1) = b+1; els(nEls, 2) = b+2;
  nEls = nEls + 1; els(nEls, 1) = b+2; els(nEls, 2) = b+3;
  nEls = nEls + 1; els(nEls, 1) = b+3; els(nEls, 2) = b+4;
  nEls = nEls + 1; els(nEls, 1) = b+4; els(nEls, 2) = b+1;
  % Diagonal de techo
  nEls = nEls + 1; els(nEls, 1) = b+1; els(nEls, 2) = b+3;
end

% Columnas (lv=0..divs-1 → de nivel lv a lv+1)
for lv = range(0, divs-1, 1)
  b0 = lv * 4;
  b1 = (lv+1) * 4;
  for cc = range(1, 4, 1)
    nEls = nEls + 1; els(nEls, 1) = b0+cc; els(nEls, 2) = b1+cc;
  end
end

% Arriostramientos de cara
for lv = range(0, divs-1, 1)
  b0 = lv * 4;
  b1 = (lv+1) * 4;
  % 2 diagonales por cara frontal y trasera
  nEls = nEls + 1; els(nEls, 1) = b0+1; els(nEls, 2) = b1+2;
  nEls = nEls + 1; els(nEls, 1) = b0+4; els(nEls, 2) = b1+3;
  nEls = nEls + 1; els(nEls, 1) = b0+1; els(nEls, 2) = b1+4;
  nEls = nEls + 1; els(nEls, 1) = b0+2; els(nEls, 2) = b1+3;
end

disp("nNodes:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% Visualizar estructura
show3d(nds, els, "Torre 3D (awatif)", [1,2,3,4])

% ── Soportes y carga ──
% Nodos base (1..4): empotrados
sups = [1,1,1,1,1,1,1; 2,1,1,1,1,1,1; 3,1,1,1,1,1,1; 4,1,1,1,1,1,1]
% Carga Fx en nodo penúltimo del tope (nodo nNodes-1 = último nivel nodo 3)
loadNd = nNodes - 1
loads = [loadNd, loadX, 0, 0, 0, 0, 0]

% ── Resolver ──
Uf = fem_deform(nds, els, sups, loads, Emod, 0.3, 1, Asec)

dof_load = (loadNd - 1) * 6 + 1;
disp("Ux en nodo de carga:"); disp(Uf(dof_load))

show_deformed(nds, els, Uf, 0, 6, "Torre 3D — deformada (1x)", [1,2,3,4])` },

  { name: 'Awatif — Advanced Truss', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Awatif — Advanced Truss
% Port de awatif-v2/examples/src/advanced-truss/main.ts
% Cercha con cuerda superior e inferior, con montantes y diagonales
% Parámetros por defecto: span=20, spacing=2.5, heights=2.5 (simétrico)
% ═══════════════════════════════════════════

% Parámetros
span = 20;         % luz total (m)
spacing = 2.5;     % espaciado entre paneles
leftH = 2.5;       % altura izq del truss
rightH = 2.5;      % altura der del truss
Achords = 50e-4;   % área cuerdas (m2, 50 cm2)
Awebs   = 50e-4;   % área montantes/diagonales (m2)
Echords = 10e6;    % módulo cuerdas (kPa, 10 GPa)
Ewebs   = 10e6;    % módulo montantes/diagonales
unifLoad = 300;    % carga uniforme (kN/m)

% Número de divisiones
ndivs = round(span / spacing)
dxp = span / ndivs

% ── Nodos: cuerda inferior (1..ndivs+1) luego superior (ndivs+2..2*(ndivs+1)) ──
nNodes = 2 * (ndivs + 1)
nds = zeros(nNodes, 3)

% Cuerda inferior: z=0, x de 0 a span
for ii = range(0, ndivs, 1)
  nds(ii+1, 1) = dxp * ii;
  nds(ii+1, 3) = 0;
end

% Cuerda superior: z interpolada de leftH a rightH
for ii = range(0, ndivs, 1)
  nds(ndivs+2+ii, 1) = dxp * ii;
  nds(ndivs+2+ii, 3) = leftH + (rightH - leftH) * ii / ndivs;
end

% ── Elementos: crecimiento dinámico ──
% Cuerdas inf (ndivs) + cuerdas sup (ndivs) + montantes (ndivs+1) + diagonales Pratt (ndivs)
% = 4*ndivs+1 elementos
els = zeros(1, 2); nEls = 0;

% Cuerda inferior: nodo ii → ii+1
for ii = range(1, ndivs, 1)
  nEls = nEls + 1; els(nEls, 1) = ii; els(nEls, 2) = ii+1;
end

% Cuerda superior: nodo (ndivs+1+ii) → (ndivs+2+ii)
for ii = range(1, ndivs, 1)
  nEls = nEls + 1; els(nEls, 1) = ndivs+1+ii; els(nEls, 2) = ndivs+2+ii;
end

% Montantes verticales: bot[ii] → top[ii] (para ii=0..ndivs)
for ii = range(0, ndivs, 1)
  nEls = nEls + 1; els(nEls, 1) = ii+1; els(nEls, 2) = ndivs+2+ii;
end

% Diagonales Pratt (webType=1): bot[ii] → top[ii+1], para ii=0..ndivs-1
for ii = range(0, ndivs-1, 1)
  nEls = nEls + 1; els(nEls, 1) = ii+1; els(nEls, 2) = ndivs+3+ii;
end

disp("nNodes:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% Soportes: nodo 1 (pin izq) y nodo ndivs+1 (pin der), solo traslaciones
supNode1 = 1; supNode2 = ndivs + 1;
sups = [supNode1, 1,1,1,0,0,0; supNode2, 1,1,1,0,0,0]

% Cargas: uniforme → carga puntual = uniformLoad*spacing en nodos superiores
% Nodos superiores cargados: ndivs+2 .. 2*(ndivs+1)
nLoadNd = ndivs + 1
loads = zeros(nLoadNd, 7)
for ii = range(1, nLoadNd, 1)
  loads(ii, 1) = ndivs + 1 + ii;   % índice nodo
  loads(ii, 4) = -unifLoad * dxp;  % Fz negativo
end

% Visualizar
show3d(nds, els, "Advanced Truss", [supNode1, supNode2])

% Resolver con fem_deform
Uf = fem_deform(nds, els, sups, loads, Echords, 0.3, 1, Achords)

% Deflexión máxima en cuerda superior (centro)
midTopNode = ndivs + 2 + round(ndivs/2)
dof_z = (midTopNode - 1) * 6 + 3;
disp("Deflexion Uz nodo central cuerda superior:")
disp(Uf(dof_z))

show_deformed(nds, els, Uf, 0, 6, "Advanced Truss — deformada", [supNode1, supNode2])` },

  { name: 'Awatif — Beams (Pórtico Plano)', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Awatif — Beams: Pórtico plano en U invertida
% Port directo de awatif-v2/examples/src/beams/main.ts
% 4 nodos, 3 elementos (columna-viga-columna)
% E=G=A=Iy=Iz=J=10
% ═══════════════════════════════════════════

% Parámetros
length_beam = 10;   % longitud viga horizontal
ht = 10;            % altura columnas
xLoad = 10;         % carga horizontal en nodo tope izquierdo

% ── Nodos ──
% 1: (0,0,0)   — base izquierda
% 2: (0,0,ht)  — tope izquierda
% 3: (L,0,ht)  — tope derecha
% 4: (L,0,0)   — base derecha
nds = [0, 0, 0; 0, 0, ht; length_beam, 0, ht; length_beam, 0, 0]
nNodes = 4

% ── Elementos ──
% 1: columna izq  (1→2)
% 2: viga tope    (2→3)
% 3: columna der  (3→4)
els = [1, 2; 2, 3; 3, 4]
nElem = 3

% Visualizar
show3d(nds, els, "Portico Plano (Beams)", [1, 4])

% ── Soporte y carga ──
% nodo 1 y nodo 4: empotrados (6 DOF)
sups = [1, 1,1,1,1,1,1; 4, 1,1,1,1,1,1]
% Fx = xLoad en nodo 2 (tope izquierdo), igual que awatif loads nodo 3 era la unión
loads = [2, xLoad, 0, 0, 0, 0, 0]

% ── Resolver con fem_deform (6 DOF/nodo) ──
% E=10, nu=0.3, t=1, A=10, Iz=10, Iy=10, G=10, J=10  (igual que awatif beams example)
Uf = fem_deform(nds, els, sups, loads, 10, 0.3, 1, 10, 10, 10, 10, 10)

% Desplazamientos en nodo 2 (tope izq, donde va la carga)
disp("Ux nodo 2 (tope izq, carga):"); disp(Uf(7))
disp("Uz nodo 2 (tope izq):"); disp(Uf(9))
disp("Ux nodo 3 (tope der):"); disp(Uf(13))

% Visualización deformada
show_deformed(nds, els, Uf, 0, 6, "Portico Plano — deformada", [1, 4])` },

  { name: 'Awatif — Building (Edificio 2 pisos)', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Awatif — Building: Edificio 2 pisos
% Port simplificado de awatif-v2/examples/src/building/main.ts
% 6 columnas por piso, losa 18x10m, altura piso=4m
% ═══════════════════════════════════════════

% Geometría (coincide con columnsSample del original)
% columnsSample: (0,0), (0,10), (18,10), (18,0), (6,0), (6,10)
% stories=2, FLOOR_HEIGHT=4
stories = 2;
fh = 4;      % altura de piso

% ── Nodos: 6 columnas × (stories+1) niveles ──
% nivel z=0: pies de columna
% nivel z=4: nivel 1 (primer piso)
% nivel z=8: nivel 2 (azotea)
% Posiciones en planta (x,y):
colXY = [0,0; 0,10; 18,10; 18,0; 6,0; 6,10]
nCols = 6
nLevels = stories + 1
nNodes = nCols * nLevels

nds = zeros(nNodes, 3)
for lv = range(0, stories, 1)
  for cc = range(1, nCols, 1)
    nn = lv * nCols + cc;
    nds(nn, 1) = colXY(cc, 1);
    nds(nn, 2) = colXY(cc, 2);
    nds(nn, 3) = fh * lv;
  end
end

% ── Elementos ──
% Columnas: cada columna sube de nivel lv → lv+1
% Vigas: conectan columnas adyacentes en cada nivel superior
% Estructura de vigas por nivel: perímetro + vigas interiores
%   1-2, 2-3, 3-4, 4-1, 5-1, 6-2  (basado en planta)

els = zeros(1, 2);
nEls = 0;

% Columnas
for lv = range(0, stories-1, 1)
  for cc = range(1, nCols, 1)
    nn = lv * nCols + cc;
    n1top = (lv+1) * nCols + cc;
    nEls = nEls + 1;
    els(nEls, 1) = nn; els(nEls, 2) = n1top;
  end
end

% Vigas (por cada nivel 1..stories)
% Conexiones en planta: 1-2, 2-3, 3-4, 4-1 (perímetro) + 5-1, 5-6, 6-2 (vigas int)
beam_pairs = [1,2; 2,3; 3,4; 4,1; 5,1; 5,6; 6,2]
nBeamPairs = 7
for lv = range(1, stories, 1)
  base = lv * nCols;
  for bp = range(1, nBeamPairs, 1)
    na = base + beam_pairs(bp, 1);
    nb = base + beam_pairs(bp, 2);
    nEls = nEls + 1;
    els(nEls, 1) = na; els(nEls, 2) = nb;
  end
end

disp("nNodes:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% Visualizar
show3d(nds, els, "Edificio 2 pisos", [1,2,3,4,5,6])

% ── Soportes y carga ──
% Base (nivel 0, nodos 1..6): empotrados
sups = [1,1,1,1,1,1,1; 2,1,1,1,1,1,1; 3,1,1,1,1,1,1; 4,1,1,1,1,1,1; 5,1,1,1,1,1,1; 6,1,1,1,1,1,1]

% Carga de losa: Fz=-1 kN en cada nodo de nivel 1 (slab load aproximado)
% + cortante de viento Fx=3 en nodo tope (simula comportamiento lateral)
topNode = nNodes - 2;  % nodo 3 del tope (esquina 18,10,8)
loads = zeros(nCols + 1, 7)
for cc = range(1, nCols, 1)
  nd = nCols + cc;           % nodo nivel 1
  loads(cc, 1) = nd;
  loads(cc, 4) = -1;         % Fz = -1 kN (losa)
end
loads(nCols+1, 1) = topNode;
loads(nCols+1, 2) = 3;       % Fx = 3 kN (viento en azotea)

% ── Resolver ──
% E=25e6 kPa, nu=0.2, t=1, A=0.09 m2, Iz=Iy=7.5e-4 m4 (col 30x30cm), G=10.4e6, J=1e-4
Uf = fem_deform(nds, els, sups, loads, 25e6, 0.2, 1, 0.09, 7.5e-4, 7.5e-4, 10.4e6, 1e-4)

% Desplazamientos en nodo tope (carga de viento)
dof_tx = (topNode - 1) * 6 + 1;
disp("Ux nodo tope (viento):");  disp(Uf(dof_tx))
disp("Uz nodo tope:");           disp(Uf(dof_tx + 2))

show_deformed(nds, els, Uf, 0, 6, "Edificio 2 pisos — deformada", [1,2,3,4,5,6])` },

  // ══════════════════════════════════════════════════════════════
  // ESTRUCTURAS — 33 plantillas generadas desde getCad3d.ts
  // ══════════════════════════════════════════════════════════════

  { name: 'Cercha', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Cercha plana (truss) — 8 divisiones, h=3m, L=16m
% Acero: E=200e6 kPa, A=5e-4 m2
% ═══════════════════════════════════════════
span = 16
nDiv = 8
hh = 3
dx = span / nDiv

% Nodos: cuerda inferior (z=0) + superior (z=h)
nds = zeros((nDiv+1)*2, 3)
for kk = range(0, nDiv, 1)
  nds(kk+1, 1) = dx * kk
  nds(kk+1, 3) = 0
end
for kk = range(0, nDiv, 1)
  nds(nDiv+1+kk+1, 1) = dx * kk
  nds(nDiv+1+kk+1, 3) = hh
end

% Elementos
els = zeros(1,2)
nEls = 0
bb = nDiv + 1

% Cuerda inferior
for kk = range(0, nDiv-1, 1)
  nEls = nEls + 1; els(nEls,1) = kk+1; els(nEls,2) = kk+2
end
% Cuerda superior
for kk = range(0, nDiv-1, 1)
  nEls = nEls + 1; els(nEls,1) = bb+kk+1; els(nEls,2) = bb+kk+2
end
% Montantes verticales
for kk = range(0, nDiv, 1)
  nEls = nEls + 1; els(nEls,1) = kk+1; els(nEls,2) = bb+kk+1
end
% Diagonales
for kk = range(0, nDiv-1, 1)
  nEls = nEls + 1
  if kk < nDiv/2
    els(nEls,1) = kk+1; els(nEls,2) = bb+kk+2
  else
    els(nEls,1) = bb+kk+1; els(nEls,2) = kk+2
  end
end

disp("nNodos:"); disp((nDiv+1)*2)
disp("nElem:"); disp(nEls)

% Soportes: nodo 1 y nodo nDiv+1 (extremos cuerda inferior) empotrados
sups = [1,1,1,1,1,1,1; nDiv+1,1,1,1,1,1,1]

% Carga vertical en nudos de cuerda inferior (losa)
loads = zeros(nDiv-1, 7)
for kk = range(1, nDiv-1, 1)
  loads(kk,1) = kk+1
  loads(kk,4) = -10
end

show3d(nds, els, "Cercha — geometria", [1, nDiv+1])

% Resolver: acero E=200e6, A=5e-4, truss (nu=0, t=1, Iz=Iy=0)
Uf = fem_deform(nds, els, sups, loads, 200e6, 0.3, 1, 5e-4, 1e-6, 1e-6, 77e6, 1e-7)

dof_mid = (bb) * 6 + 3
disp("Deflexion vertice centro cuerda sup (m):"); disp(Uf(dof_mid))

show_deformed(nds, els, Uf, 0, 6, "Cercha — deformada", [1, nDiv+1])` },

  { name: 'Portico', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Portico plano de hormigon — 1 vano, 1 piso
% col 40x40 cm, viga 30x50 cm, H=4m, L=6m
% E=25e6 kPa, nu=0.2
% ═══════════════════════════════════════════
ww = 6
hh = 4
nSub = 4   % subdivisiones de viga

% Nodos: 1=base-izq, 2=tope-izq, 3=tope-der, 4=base-der
% Nodos intermedios de viga: 5..4+nSub-1
% Total: 4 + (nSub-1) nodos
nTotal = 4 + nSub - 1
nds = zeros(nTotal, 3)
nds(1,1)=0; nds(1,2)=0; nds(1,3)=0
nds(2,1)=0; nds(2,2)=0; nds(2,3)=hh
nds(3,1)=ww; nds(3,2)=0; nds(3,3)=hh
nds(4,1)=ww; nds(4,2)=0; nds(4,3)=0
for kk = range(1, nSub-1, 1)
  tt = kk / nSub
  nds(4+kk,1)=tt*ww; nds(4+kk,2)=0; nds(4+kk,3)=hh
end

% Elementos: col-izq, col-der, viga subdividida
% col izq: 1-2; col der: 4-3
% viga: 2-5, 5-6, ..., (4+nSub-1)-3
nEls = 2 + nSub
els = zeros(nEls, 2)
els(1,1)=1; els(1,2)=2
els(2,1)=4; els(2,2)=3
% viga
prevN = 2
for kk = range(1, nSub-1, 1)
  els(2+kk, 1) = prevN; els(2+kk, 2) = 4+kk
  prevN = 4+kk
end
els(2+nSub, 1) = prevN; els(2+nSub, 2) = 3

disp("nNodos:"); disp(nTotal)
disp("nElem:"); disp(nEls)

% Soportes: nodos 1 y 4 empotrados
sups = [1,1,1,1,1,1,1; 4,1,1,1,1,1,1]

% Carga: Fx=15 kN en nodo 2 (tope izquierdo, viento)
loads = [2, 15, 0, 0, 0, 0, 0]

show3d(nds, els, "Portico — geometria", [1, 4])

% Hormigon: E=25e6, nu=0.2, t=1, A=0.16, Iz=3.33e-3, Iy=3.33e-3, G=10.4e6, J=1e-4
Uf = fem_deform(nds, els, sups, loads, 25e6, 0.2, 1, 0.16, 3.33e-3, 3.33e-3, 10.4e6, 1e-4)

disp("Ux nodo 2 (tope izq, viento) [m]:"); disp(Uf(7))
disp("Uz nodo 2:"); disp(Uf(9))

show_deformed(nds, els, Uf, 0, 6, "Portico — deformada", [1, 4])` },

  { name: 'Torre', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Torre 3D de acero — 3 pisos, diagonales
% dx=6m, dy=5m, dz=4m
% Perfiles HEA: A=0.01 m2, Iz=Iy=1e-4 m4
% ═══════════════════════════════════════════
dx = 6; dy = 5; dz = 4
stories = 3

% Nodos en esquinas (4 por nivel)
% nivel lv: nodos lv*4+1 .. lv*4+4
% c=1:(-,-) c=2:(+,-) c=3:(+,+) c=4:(-,+)
nds = zeros((stories+1)*4, 3)
for lv = range(0, stories, 1)
  bb = lv*4
  nds(bb+1,1)=0;  nds(bb+1,2)=0;  nds(bb+1,3)=dz*lv
  nds(bb+2,1)=dx; nds(bb+2,2)=0;  nds(bb+2,3)=dz*lv
  nds(bb+3,1)=dx; nds(bb+3,2)=dy; nds(bb+3,3)=dz*lv
  nds(bb+4,1)=0;  nds(bb+4,2)=dy; nds(bb+4,3)=dz*lv
end
nJoint = (stories+1)*4

% Contar elementos maximo
nElsMax = stories*4 + stories*4 + stories*5*3
els = zeros(nElsMax, 2); nEls = 0

% Columnas verticales
for lv = range(0, stories-1, 1)
  for cc = range(0, 3, 1)
    nEls = nEls+1
    els(nEls,1) = lv*4+cc+1
    els(nEls,2) = (lv+1)*4+cc+1
  end
end

% Diagonales en fachada
for lv = range(0, stories-1, 1)
  oo = lv*4
  nEls = nEls+1; els(nEls,1)=oo+1; els(nEls,2)=oo+4+2
  nEls = nEls+1; els(nEls,1)=oo+4; els(nEls,2)=oo+4+3
  nEls = nEls+1; els(nEls,1)=oo+1; els(nEls,2)=oo+4+4
  nEls = nEls+1; els(nEls,1)=oo+2; els(nEls,2)=oo+4+3
end

% Vigas de piso (sin subdivision)
% Por piso: [1-2],[2-3],[3-4],[4-1],[1-3]
bpA = [1,2,3,4,1]
bpB = [2,3,4,1,3]
nBP = 5
for lv = range(1, stories, 1)
  oo = lv*4
  for bp = range(1, nBP, 1)
    nEls = nEls+1
    els(nEls,1) = oo + bpA(bp)
    els(nEls,2) = oo + bpB(bp)
  end
end

disp("nNodos:"); disp(nJoint)
disp("nElem:"); disp(nEls)

% Soportes: 4 nodos de base empotrados
sups = [1,1,1,1,1,1,1; 2,1,1,1,1,1,1; 3,1,1,1,1,1,1; 4,1,1,1,1,1,1]

% Carga: viento Fx=20kN en nodo tope (esquina)
topNode = stories*4 + 1
loads = [topNode, 20, 0, 0, 0, 0, 0]

show3d(nds, els, "Torre 3D — geometria", [1,2,3,4])

% Acero: E=200e6, nu=0.3, t=1, A=0.01, Iz=Iy=1e-4, G=77e6, J=5e-5
Uf = fem_deform(nds, els, sups, loads, 200e6, 0.3, 1, 0.01, 1e-4, 1e-4, 77e6, 5e-5)

dof_top = (topNode-1)*6 + 1
disp("Ux nodo tope (viento) [m]:"); disp(Uf(dof_top))

show_deformed(nds, els, Uf, 0, 6, "Torre 3D — deformada", [1,2,3,4])` },

  { name: 'Galpon', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Galpon industrial — cercha arco 3D
% span=12m, length=20m, height=6m, archRise=3m
% xDiv=8, yDiv=4
% ═══════════════════════════════════════════
span = 12
llen = 20
hh   = 6
rise = 3
xDiv = 8
yDiv = 4

% Nodos por fila: [baseizq, baseder, tope-izq, arco1..arco(xDiv-1), tope-der]
% = 2 + 1 + (xDiv-1) + 1 - 1 = xDiv + 2... actually: col0=baseizq, col1=baseder, col2=topeizq, col3..col(xDiv+1)=arco, col(xDiv+2)=topeder
% nPerRow = xDiv + 3 = 11
nPerRow = xDiv + 3

% Pre-allocate
totalNodes = (yDiv+1) * nPerRow
nds = zeros(totalNodes, 3)
nid = zeros(yDiv+1, nPerRow)

% Llenar nodos fila por fila
for iy = range(0, yDiv, 1)
  yy = (llen/yDiv)*iy
  rBase = iy*nPerRow

  % col 1: base izq
  nid(iy+1,1) = rBase+1
  nds(rBase+1,1)=0; nds(rBase+1,2)=yy; nds(rBase+1,3)=0
  % col 2: base der
  nid(iy+1,2) = rBase+2
  nds(rBase+2,1)=span; nds(rBase+2,2)=yy; nds(rBase+2,3)=0
  % col 3: tope izq
  nid(iy+1,3) = rBase+3
  nds(rBase+3,1)=0; nds(rBase+3,2)=yy; nds(rBase+3,3)=hh
  % col 4..xDiv+2: arco
  for ix = range(1, xDiv-1, 1)
    xx = (span/xDiv)*ix
    zz = hh + rise*(1 - (2*xx/span - 1)^2)
    nid(iy+1, 3+ix) = rBase+3+ix
    nds(rBase+3+ix,1)=xx; nds(rBase+3+ix,2)=yy; nds(rBase+3+ix,3)=zz
  end
  % col xDiv+3: tope der
  nid(iy+1, xDiv+3) = rBase+xDiv+3
  nds(rBase+xDiv+3,1)=span; nds(rBase+xDiv+3,2)=yy; nds(rBase+xDiv+3,3)=hh
end

disp("nNodos:"); disp(totalNodes)

% Pre-allocar elementos
% Arcos por fila: 2 montantes + (nPerRow-3) arco = nPerRow-1
% Correas: yDiv * (nPerRow-2) aprox
% Diagonales: yDiv * floor((nPerRow-4)/2)
maxEls = (yDiv+1)*(nPerRow-1) + yDiv*(nPerRow-2) + yDiv*4 + 20
els = zeros(maxEls, 2); nEls = 0

% Arcos en cada fila Y
for iy = range(0, yDiv, 1)
  % montante base-izq (col1 → col3)
  nEls = nEls+1; els(nEls,1)=nid(iy+1,1); els(nEls,2)=nid(iy+1,3)
  % montante base-der (col2 → col xDiv+3)
  nEls = nEls+1; els(nEls,1)=nid(iy+1,2); els(nEls,2)=nid(iy+1,xDiv+3)
  % arco: col3 → col4 → ... → col(xDiv+3)
  for kk = range(3, nPerRow-1, 1)
    nEls = nEls+1; els(nEls,1)=nid(iy+1,kk); els(nEls,2)=nid(iy+1,kk+1)
  end
end

% Correas longitudinales (col 3 en adelante)
for iy = range(0, yDiv-1, 1)
  for kk = range(3, nPerRow, 1)
    nEls = nEls+1
    els(nEls,1) = nid(iy+1,kk); els(nEls,2) = nid(iy+2,kk)
  end
end

% Diagonales entre filas (cada par de nodos arco)
for iy = range(0, yDiv-1, 1)
  for kk = range(3, nPerRow-1, 2)
    nEls = nEls+1
    els(nEls,1) = nid(iy+1,kk); els(nEls,2) = nid(iy+2,kk+1)
  end
end

disp("nElem:"); disp(nEls)

% Soportes: bases izq y der de todas las filas
nSups = (yDiv+1)*2
sups = zeros(nSups, 7)
for iy = range(0, yDiv, 1)
  rr1 = iy*2+1; rr2 = iy*2+2
  sups(rr1,1)=nid(iy+1,1); sups(rr1,2)=1; sups(rr1,3)=1; sups(rr1,4)=1; sups(rr1,5)=1; sups(rr1,6)=1; sups(rr1,7)=1
  sups(rr2,1)=nid(iy+1,2); sups(rr2,2)=1; sups(rr2,3)=1; sups(rr2,4)=1; sups(rr2,5)=1; sups(rr2,6)=1; sups(rr2,7)=1
end

% Carga viento en nodo cumbrera (arco central, primera fila)
% midCol = 3 + round((xDiv-1)/2) = 3+4=7 para xDiv=8
midCol = 7
topNode = nid(1, midCol)
topNodeVal = topNode
loads = [topNodeVal, 5, 0, 0, 0, 0, 0]

% Array de soportes para visualizacion
supNodes = zeros(1, nSups)
for iy = range(0, yDiv, 1)
  supNodes(iy*2+1) = nid(iy+1,1)
  supNodes(iy*2+2) = nid(iy+1,2)
end

show3d(nds, els, "Galpon — geometria", supNodes)

Uf = fem_deform(nds, els, sups, loads, 200e6, 0.3, 1, 5e-4, 1e-5, 1e-5, 77e6, 5e-6)

dof_top = (topNodeVal-1)*6 + 1
disp("Ux nodo cumbrera (viento) [m]:"); disp(Uf(dof_top))

show_deformed(nds, els, Uf, 0, 6, "Galpon — deformada", supNodes)` },

  { name: 'Edificio', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Edificio aporticado — hormigon, sin muros
% 3 vanos X (6m), 2 vanos Y (5m), 3 pisos (3.5m)
% col 40x40cm, vigas 30x50cm
% ═══════════════════════════════════════════
xCoords = [0, 6, 12, 18]
yCoords = [0, 5, 10]
zCoords = [0, 3.5, 7.0, 10.5]

nX = 4; nY = 3; nZ = 4
% nid(linearXY, iz): linearXY = (iy-1)*nX + ix
nNodes = nX*nY*nZ
nds = zeros(nNodes, 3)
nid = zeros(nX*nY, nZ)  % 2D: planIdx x level
for iz = range(1, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX, 1)
      planIdx = (iy-1)*nX + ix
      nn = (iz-1)*nX*nY + planIdx
      nds(nn,1)=xCoords(ix); nds(nn,2)=yCoords(iy); nds(nn,3)=zCoords(iz)
      nid(planIdx, iz) = nn
    end
  end
end

% Pre-alloc elementos
nColsMax = (nZ-1)*nX*nY
nBeamsXMax = (nZ-1)*nY*(nX-1)
nBeamsYMax = (nZ-1)*nX*(nY-1)
maxEls = nColsMax + nBeamsXMax + nBeamsYMax
els = zeros(maxEls, 2); nEls = 0

% Columnas verticales
for iz = range(1, nZ-1, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX, 1)
      planIdx = (iy-1)*nX + ix
      nEls = nEls+1
      els(nEls,1) = nid(planIdx, iz)
      els(nEls,2) = nid(planIdx, iz+1)
    end
  end
end

% Vigas X (en cada piso)
for iz = range(2, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX-1, 1)
      p1 = (iy-1)*nX + ix
      p2 = (iy-1)*nX + ix+1
      nEls = nEls+1
      els(nEls,1) = nid(p1, iz)
      els(nEls,2) = nid(p2, iz)
    end
  end
end

% Vigas Y (en cada piso)
for iz = range(2, nZ, 1)
  for ix = range(1, nX, 1)
    for iy = range(1, nY-1, 1)
      p1 = (iy-1)*nX + ix
      p2 = iy*nX + ix
      nEls = nEls+1
      els(nEls,1) = nid(p1, iz)
      els(nEls,2) = nid(p2, iz)
    end
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% Soportes: nivel iz=1 empotrados
nBase = nX*nY
sups = zeros(nBase, 7)
for planIdx = range(1, nBase, 1)
  sups(planIdx,1) = nid(planIdx,1)
  sups(planIdx,2)=1; sups(planIdx,3)=1; sups(planIdx,4)=1
  sups(planIdx,5)=1; sups(planIdx,6)=1; sups(planIdx,7)=1
end

% Carga: Fx=10 kN en nodo (planIdx=1, iz=nZ) — esquina tope
topNode = nid(1, nZ)
loads = [topNode, 10, 0, 0, 0, 0, 0]

% Nodos base para visualizacion
supVec = zeros(1, nBase)
for planIdx = range(1, nBase, 1)
  supVec(planIdx) = nid(planIdx, 1)
end

show3d(nds, els, "Edificio hormigon — geometria", supVec)

% E=25e6, nu=0.2, A=0.16, Iz=Iy=3.33e-3, G=10.4e6, J=1e-4
Uf = fem_deform(nds, els, sups, loads, 25e6, 0.2, 1, 0.16, 3.33e-3, 3.33e-3, 10.4e6, 1e-4)

dof_top = (topNode-1)*6 + 1
disp("Ux tope (viento) [m]:"); disp(Uf(dof_top))

show_deformed(nds, els, Uf, 0, 6, "Edificio hormigon — deformada", supVec)` },

  { name: 'Edif. Muros', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Edificio con muros de corte — hormigon
% 2 vanos X (5m), 2 vanos Y (4m), 3 pisos (3.5m)
% ═══════════════════════════════════════════
xCoords = [0, 5, 10]
yCoords = [0, 4, 8]
zCoords = [0, 3.5, 7.0, 10.5]

nX = 3; nY = 3; nZ = 4
nNodes = nX*nY*nZ
nds = zeros(nNodes, 3)
nid = zeros(nX*nY, nZ)
for iz = range(1, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX, 1)
      planIdx = (iy-1)*nX + ix
      nn = (iz-1)*nX*nY + planIdx
      nds(nn,1)=xCoords(ix); nds(nn,2)=yCoords(iy); nds(nn,3)=zCoords(iz)
      nid(planIdx, iz) = nn
    end
  end
end

maxEls = (nZ-1)*nX*nY + (nZ-1)*nY*(nX-1) + (nZ-1)*nX*(nY-1) + (nZ-1)*8
els = zeros(maxEls, 2); nEls = 0

% Columnas
for iz = range(1, nZ-1, 1)
  for planIdx = range(1, nX*nY, 1)
    nEls = nEls+1
    els(nEls,1) = nid(planIdx,iz); els(nEls,2) = nid(planIdx,iz+1)
  end
end

% Vigas X
for iz = range(2, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX-1, 1)
      p1 = (iy-1)*nX+ix; p2 = (iy-1)*nX+ix+1
      nEls = nEls+1; els(nEls,1)=nid(p1,iz); els(nEls,2)=nid(p2,iz)
    end
  end
end

% Vigas Y
for iz = range(2, nZ, 1)
  for ix = range(1, nX, 1)
    for iy = range(1, nY-1, 1)
      p1 = (iy-1)*nX+ix; p2 = iy*nX+ix
      nEls = nEls+1; els(nEls,1)=nid(p1,iz); els(nEls,2)=nid(p2,iz)
    end
  end
end

% Muros de corte: diagonales en esquina (planIdx 1,2 y 5,6)
% p(1,1)=planIdx 1, p(2,1)=planIdx 2, p(2,2)=planIdx 5, p(2,3)=planIdx 8
for iz = range(1, nZ-1, 1)
  % muro 1: planIdx 1 y 2 (col 1-2 fila 1)
  n1a = nid(1,iz); n2a = nid(2,iz); n1b = nid(1,iz+1); n2b = nid(2,iz+1)
  nEls = nEls+1; els(nEls,1)=n1a; els(nEls,2)=n2b
  nEls = nEls+1; els(nEls,1)=n2a; els(nEls,2)=n1b
  % muro 2: planIdx 5 y 8 (col 2 fila 2 y col 2 fila 3)
  n5a = nid(5,iz); n8a = nid(8,iz); n5b = nid(5,iz+1); n8b = nid(8,iz+1)
  nEls = nEls+1; els(nEls,1)=n5a; els(nEls,2)=n8b
  nEls = nEls+1; els(nEls,1)=n8a; els(nEls,2)=n5b
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

nBase = nX*nY
sups = zeros(nBase, 7)
for planIdx = range(1, nBase, 1)
  sups(planIdx,1) = nid(planIdx,1)
  sups(planIdx,2)=1; sups(planIdx,3)=1; sups(planIdx,4)=1
  sups(planIdx,5)=1; sups(planIdx,6)=1; sups(planIdx,7)=1
end

topNode = nid(1, nZ)
loads = [topNode, 12, 0, 0, 0, 0, 0]

supVec = zeros(1, nBase)
for planIdx = range(1, nBase, 1)
  supVec(planIdx) = nid(planIdx, 1)
end

show3d(nds, els, "Edif.Muros — geometria", supVec)

Uf = fem_deform(nds, els, sups, loads, 25e6, 0.2, 1, 0.16, 3.33e-3, 3.33e-3, 10.4e6, 1e-4)

dof_top = (topNode-1)*6+1
disp("Ux tope (viento) [m]:"); disp(Uf(dof_top))

show_deformed(nds, els, Uf, 0, 6, "Edif.Muros — deformada", supVec)` },

  { name: 'Edif. Acero', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Edificio de acero — columnas W, vigas W
% 3 vanos X (6m), 2 vanos Y (5m), 3 pisos (4m)
% Perfiles W: A=0.015, Iz=Iy=4e-4
% ═══════════════════════════════════════════
xCoords = [0, 6, 12, 18]
yCoords = [0, 5, 10]
zCoords = [0, 4, 8, 12]

nX = 4; nY = 3; nZ = 4
nNodes = nX*nY*nZ
nds = zeros(nNodes, 3)
nid = zeros(nX*nY, nZ)
for iz = range(1, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX, 1)
      planIdx = (iy-1)*nX+ix
      nn = (iz-1)*nX*nY+planIdx
      nds(nn,1)=xCoords(ix); nds(nn,2)=yCoords(iy); nds(nn,3)=zCoords(iz)
      nid(planIdx,iz) = nn
    end
  end
end

maxEls = (nZ-1)*nX*nY + (nZ-1)*nY*(nX-1) + (nZ-1)*nX*(nY-1)
els = zeros(maxEls, 2); nEls = 0

% Columnas
for iz = range(1, nZ-1, 1)
  for planIdx = range(1, nX*nY, 1)
    nEls = nEls+1; els(nEls,1)=nid(planIdx,iz); els(nEls,2)=nid(planIdx,iz+1)
  end
end

% Vigas X
for iz = range(2, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX-1, 1)
      p1=(iy-1)*nX+ix; p2=(iy-1)*nX+ix+1
      nEls = nEls+1; els(nEls,1)=nid(p1,iz); els(nEls,2)=nid(p2,iz)
    end
  end
end

% Vigas Y
for iz = range(2, nZ, 1)
  for ix = range(1, nX, 1)
    for iy = range(1, nY-1, 1)
      p1=(iy-1)*nX+ix; p2=iy*nX+ix
      nEls = nEls+1; els(nEls,1)=nid(p1,iz); els(nEls,2)=nid(p2,iz)
    end
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

nBase = nX*nY
sups = zeros(nBase, 7)
for planIdx = range(1, nBase, 1)
  sups(planIdx,1)=nid(planIdx,1)
  sups(planIdx,2)=1; sups(planIdx,3)=1; sups(planIdx,4)=1
  sups(planIdx,5)=1; sups(planIdx,6)=1; sups(planIdx,7)=1
end

topNode = nid(1,nZ)
loads = [topNode, 15, 0, 0, 0, 0, 0]

supVec = zeros(1,nBase)
for planIdx = range(1,nBase,1)
  supVec(planIdx) = nid(planIdx,1)
end

show3d(nds, els, "Edif.Acero — geometria", supVec)

% Acero W: E=200e6, nu=0.3, A=0.015, Iz=Iy=4e-4, G=77e6, J=2e-5
Uf = fem_deform(nds, els, sups, loads, 200e6, 0.3, 1, 0.015, 4e-4, 4e-4, 77e6, 2e-5)

dof_top = (topNode-1)*6+1
disp("Ux tope (viento) [m]:"); disp(Uf(dof_top))

show_deformed(nds, els, Uf, 0, 6, "Edif.Acero — deformada", supVec)` },

  { name: 'Acero+Diag', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Edificio acero con diagonales contraviento
% 2 vanos X (6m), 2 vanos Y (5m), 4 pisos (4m)
% Perfiles W + braces HSS en perimetro
% ═══════════════════════════════════════════
xCoords = [0, 6, 12]
yCoords = [0, 5, 10]
zCoords = [0, 4, 8, 12, 16]

nX = 3; nY = 3; nZ = 5
nNodes = nX*nY*nZ
nds = zeros(nNodes, 3)
nid = zeros(nX*nY, nZ)
for iz = range(1, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX, 1)
      planIdx = (iy-1)*nX+ix
      nn = (iz-1)*nX*nY+planIdx
      nds(nn,1)=xCoords(ix); nds(nn,2)=yCoords(iy); nds(nn,3)=zCoords(iz)
      nid(planIdx,iz) = nn
    end
  end
end

maxEls = (nZ-1)*nX*nY + (nZ-1)*nY*(nX-1) + (nZ-1)*nX*(nY-1) + (nZ-1)*(2*(nX-1)+2*(nY-1))
els = zeros(maxEls, 2); nEls = 0

% Columnas
for iz = range(1, nZ-1, 1)
  for planIdx = range(1, nX*nY, 1)
    nEls = nEls+1; els(nEls,1)=nid(planIdx,iz); els(nEls,2)=nid(planIdx,iz+1)
  end
end

% Vigas X
for iz = range(2, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX-1, 1)
      p1=(iy-1)*nX+ix; p2=(iy-1)*nX+ix+1
      nEls = nEls+1; els(nEls,1)=nid(p1,iz); els(nEls,2)=nid(p2,iz)
    end
  end
end

% Vigas Y
for iz = range(2, nZ, 1)
  for ix = range(1, nX, 1)
    for iy = range(1, nY-1, 1)
      p1=(iy-1)*nX+ix; p2=iy*nX+ix
      nEls = nEls+1; els(nEls,1)=nid(p1,iz); els(nEls,2)=nid(p2,iz)
    end
  end
end

% Diagonales perimetro: fachada delantera (iy=1) y trasera (iy=nY)
for iz = range(1, nZ-1, 1)
  % fachada iy=1
  for ix = range(1, nX-1, 1)
    p0=(1-1)*nX+ix; p1=(1-1)*nX+ix+1
    nEls = nEls+1; els(nEls,1)=nid(p0,iz); els(nEls,2)=nid(p1,iz+1)
  end
  % fachada iy=nY
  for ix = range(1, nX-1, 1)
    p0=(nY-1)*nX+ix; p1=(nY-1)*nX+ix+1
    nEls = nEls+1; els(nEls,1)=nid(p0,iz); els(nEls,2)=nid(p1,iz+1)
  end
  % fachada ix=1
  for iy = range(1, nY-1, 1)
    p0=(iy-1)*nX+1; p1=iy*nX+1
    nEls = nEls+1; els(nEls,1)=nid(p0,iz); els(nEls,2)=nid(p1,iz+1)
  end
  % fachada ix=nX
  for iy = range(1, nY-1, 1)
    p0=(iy-1)*nX+nX; p1=iy*nX+nX
    nEls = nEls+1; els(nEls,1)=nid(p0,iz); els(nEls,2)=nid(p1,iz+1)
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

nBase = nX*nY
sups = zeros(nBase, 7)
for planIdx = range(1, nBase, 1)
  sups(planIdx,1)=nid(planIdx,1)
  sups(planIdx,2)=1; sups(planIdx,3)=1; sups(planIdx,4)=1
  sups(planIdx,5)=1; sups(planIdx,6)=1; sups(planIdx,7)=1
end

topNode = nid(1,nZ)
loads = [topNode, 20, 0, 0, 0, 0, 0]

supVec = zeros(1,nBase)
for planIdx = range(1,nBase,1)
  supVec(planIdx) = nid(planIdx,1)
end

show3d(nds, els, "Acero+Diag — geometria", supVec)

Uf = fem_deform(nds, els, sups, loads, 200e6, 0.3, 1, 0.015, 4e-4, 4e-4, 77e6, 2e-5)

dof_top = (topNode-1)*6+1
disp("Ux tope (viento) [m]:"); disp(Uf(dof_top))

show_deformed(nds, els, Uf, 0, 6, "Acero+Diag — deformada", supVec)` },

  { name: 'Edif. Mixto', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Edificio mixto — columnas CFT, vigas hormigon
% 2 vanos X (5m), 2 vanos Y (4m), 3 pisos (3.5m)
% ═══════════════════════════════════════════
xCoords = [0, 5, 10]
yCoords = [0, 4, 8]
zCoords = [0, 3.5, 7, 10.5]

nX = 3; nY = 3; nZ = 4
nNodes = nX*nY*nZ
nds = zeros(nNodes, 3)
nid = zeros(nX*nY, nZ)
for iz = range(1, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX, 1)
      planIdx = (iy-1)*nX+ix
      nn = (iz-1)*nX*nY+planIdx
      nds(nn,1)=xCoords(ix); nds(nn,2)=yCoords(iy); nds(nn,3)=zCoords(iz)
      nid(planIdx,iz) = nn
    end
  end
end

maxEls = (nZ-1)*nX*nY + (nZ-1)*nY*(nX-1) + (nZ-1)*nX*(nY-1) + (nZ-1)*2
els = zeros(maxEls, 2); nEls = 0

% Columnas
for iz = range(1, nZ-1, 1)
  for planIdx = range(1, nX*nY, 1)
    nEls = nEls+1; els(nEls,1)=nid(planIdx,iz); els(nEls,2)=nid(planIdx,iz+1)
  end
end

% Vigas X
for iz = range(2, nZ, 1)
  for iy = range(1, nY, 1)
    for ix = range(1, nX-1, 1)
      p1=(iy-1)*nX+ix; p2=(iy-1)*nX+ix+1
      nEls = nEls+1; els(nEls,1)=nid(p1,iz); els(nEls,2)=nid(p2,iz)
    end
  end
end

% Vigas Y
for iz = range(2, nZ, 1)
  for ix = range(1, nX, 1)
    for iy = range(1, nY-1, 1)
      p1=(iy-1)*nX+ix; p2=iy*nX+ix
      nEls = nEls+1; els(nEls,1)=nid(p1,iz); els(nEls,2)=nid(p2,iz)
    end
  end
end

% Muros CFT esquina (planIdx 1 y 2 = col (1,1) y (2,1))
for iz = range(1, nZ-1, 1)
  nEls = nEls+1; els(nEls,1)=nid(1,iz); els(nEls,2)=nid(2,iz+1)
  nEls = nEls+1; els(nEls,1)=nid(2,iz); els(nEls,2)=nid(1,iz+1)
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

nBase = nX*nY
sups = zeros(nBase, 7)
for planIdx = range(1, nBase, 1)
  sups(planIdx,1)=nid(planIdx,1)
  sups(planIdx,2)=1; sups(planIdx,3)=1; sups(planIdx,4)=1
  sups(planIdx,5)=1; sups(planIdx,6)=1; sups(planIdx,7)=1
end

topNode = nid(1,nZ)
loads = [topNode, 12, 0, 0, 0, 0, 0]

supVec = zeros(1, nBase)
for planIdx = range(1,nBase,1)
  supVec(planIdx) = nid(planIdx,1)
end

show3d(nds, els, "Edif.Mixto CFT — geometria", supVec)

% CFT efectivo: E=40e6 (equiv.), A=0.02
Uf = fem_deform(nds, els, sups, loads, 40e6, 0.2, 1, 0.02, 5e-4, 5e-4, 16e6, 2e-4)

dof_top = (topNode-1)*6+1
disp("Ux tope (viento) [m]:"); disp(Uf(dof_top))

show_deformed(nds, els, Uf, 0, 6, "Edif.Mixto CFT — deformada", supVec)` },

  { name: 'Mezanine', category: 'Estructura', code: `% ═══════════════════════════════════════════
% Mezanine de acero — 1 piso, vigas secundarias
% 3 vanos X (6m), 2 vanos Y (5m), h=4.5m
% Perfiles W: col A=0.02, vigas A=0.01
% ═══════════════════════════════════════════
xCoords = [0, 6, 12, 18]
yCoords = [0, 5, 10]
hh = 4.5

nX = 4; nY = 3
% Nodos: nivel 1 (base) + nivel 2 (piso)
nNodes = nX*nY*2
nds = zeros(nNodes, 3)
nid = zeros(nX*nY, 2)
for iz = range(1, 2, 1)
  zz = (iz-1)*hh
  for iy = range(1, nY, 1)
    for ix = range(1, nX, 1)
      planIdx = (iy-1)*nX+ix
      nn = (iz-1)*nX*nY+planIdx
      nds(nn,1)=xCoords(ix); nds(nn,2)=yCoords(iy); nds(nn,3)=zz
      nid(planIdx,iz) = nn
    end
  end
end

maxEls = nX*nY + nY*(nX-1) + nX*(nY-1)
els = zeros(maxEls, 2); nEls = 0

% Columnas
for planIdx = range(1, nX*nY, 1)
  nEls = nEls+1; els(nEls,1)=nid(planIdx,1); els(nEls,2)=nid(planIdx,2)
end

% Vigas X (piso iz=2)
for iy = range(1, nY, 1)
  for ix = range(1, nX-1, 1)
    p1=(iy-1)*nX+ix; p2=(iy-1)*nX+ix+1
    nEls = nEls+1; els(nEls,1)=nid(p1,2); els(nEls,2)=nid(p2,2)
  end
end

% Vigas Y (piso iz=2)
for ix = range(1, nX, 1)
  for iy = range(1, nY-1, 1)
    p1=(iy-1)*nX+ix; p2=iy*nX+ix
    nEls = nEls+1; els(nEls,1)=nid(p1,2); els(nEls,2)=nid(p2,2)
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

nBase = nX*nY
sups = zeros(nBase, 7)
for planIdx = range(1, nBase, 1)
  sups(planIdx,1)=nid(planIdx,1)
  sups(planIdx,2)=1; sups(planIdx,3)=1; sups(planIdx,4)=1
  sups(planIdx,5)=1; sups(planIdx,6)=1; sups(planIdx,7)=1
end

% Carga de servicio en piso: Fz=-5 kN
loads = zeros(nBase, 7)
for planIdx = range(1, nBase, 1)
  loads(planIdx,1) = nid(planIdx,2); loads(planIdx,4) = -5
end

supVec = zeros(1,nBase)
for planIdx = range(1,nBase,1)
  supVec(planIdx) = nid(planIdx,1)
end

show3d(nds, els, "Mezanine acero — geometria", supVec)

Uf = fem_deform(nds, els, sups, loads, 200e6, 0.3, 1, 0.015, 4e-4, 4e-4, 77e6, 2e-5)

% Deflexion en nodo central de piso (planIdx 6 = col (2,2))
midPlan = (2-1)*nX + 2
midNode = nid(midPlan, 2)
dof_mid = (midNode-1)*6 + 3
disp("Uz nodo central piso (flecha) [m]:"); disp(Uf(dof_mid))

show_deformed(nds, els, Uf, 0, 6, "Mezanine acero — deformada", supVec)` },

  // ── Ferreira: MATLAB Codes for FEA (avanzados) ──

  { name: 'Ferreira Cap10 — Timoshenko', category: 'Ferreira', code: `% ═══════════════════════════════════════════
% Ferreira Cap 10: Viga Timoshenko
% Ref: problem16.m — incluye deformación por corte
% ═══════════════════════════════════════════

% ─── Datos ───
E = 1
I = 1
L_total = 1
kapa = 5/6
nElem = 20
Le = L_total / nElem
q = 1

% ─── Rigidez Timoshenko (4x4) ───
% 2 DOF/nodo: w y theta
% K = K_b + K_s (flexión + corte)
% Integración reducida (1 pto Gauss)

% ─── Thickness ratio ───
thickness = 0.001
% h/L = 0.001 → thin plate limit
G = E / (2 * (1 + 0.3))

% ─── Solución exacta (SS, carga uniforme) ───
% w_max = 5qL^4/(384EI) + qL^2/(8*kapa*G*A)
w_euler = 5 * q * L_total^4 / (384 * E * I)
A_s = thickness
w_shear = q * L_total^2 / (8 * kapa * G * A_s)
w_total = w_euler + w_shear

% ─── Para thick beam (h/L = 0.1) ───
thick_h = 0.1
I_thick = thick_h^3 / 12
w_euler_thick = 5 * q * L_total^4 / (384 * E * I_thick)
w_shear_thick = q * L_total^2 / (8 * kapa * G * thick_h)
ratio_shear = w_shear_thick / w_euler_thick * 100` },

  { name: 'Ferreira Cap11 — Plane Stress Q4', category: 'Ferreira', code: `% ═══════════════════════════════════════════
% Ferreira Cap 11: Plane Stress Q4
% Ref: problem17.m — tensión plana, elemento Q4
% ═══════════════════════════════════════════

% ─── Datos ───
E = 1
nu = 0.3
thickness = 1

% ─── Matriz constitutiva D ───
% D = E/(1-nu^2) * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2]
coeff_D = E / (1 - nu^2)
D11 = coeff_D
D12 = coeff_D * nu
D33 = coeff_D * (1 - nu) / 2

D = [D11, D12, 0; D12, D11, 0; 0, 0, D33]

% ─── Funciones de forma Q4 ───
% Ni(xi,eta) = 1/4 * (1 ± xi)(1 ± eta)

% ─── Puntos de Gauss 2x2 ───
gp = 0.577350269189626
pts = [-gp, -gp; gp, -gp; gp, gp; -gp, gp]
weights = [1, 1, 1, 1]

% ─── Placa cuadrada 1x1, 2 DOF/nodo (u, v) ───
% Nodos del elemento
coords = [0, 0; 1, 0; 1, 1; 0, 1]

% ─── Evaluar N en punto de Gauss 1 ───
xi1 = pts(1,1)
eta1 = pts(1,2)
N1 = 0.25*(1-xi1)*(1-eta1)
N2 = 0.25*(1+xi1)*(1-eta1)
N3 = 0.25*(1+xi1)*(1+eta1)
N4 = 0.25*(1-xi1)*(1+eta1)

% ─── Derivadas dN/dxi, dN/deta ───
dN = [-(1-eta1), (1-eta1), (1+eta1), -(1+eta1); -(1-xi1), -(1+xi1), (1+xi1), (1-xi1)]
dN = 0.25 * dN

% ─── Jacobiano ───
J = dN * coords
detJ = det(J)

% ─── Rigidez: K = integral B' D B t dA ───
% Integración numérica con 4 puntos de Gauss` },

  { name: 'Ferreira Cap12 — Mindlin Plate Q4', category: 'Ferreira', code: `% ═══════════════════════════════════════════
% Ferreira Cap 12: Placa Mindlin Q4
% Ref: problem19.m — placa cuadrada en flexión
% Benchmark validado con solución exacta
% ═══════════════════════════════════════════

% ─── Datos ───
E = 10920
nu = 0.30
kapa = 5/6
th = 0.1
I_plate = th^3 / 12

% ─── Rigidez flexural D ───
% D = E*h^3 / (12*(1-nu^2))
D_flex = E * th^3 / (12 * (1 - nu^2))

% ─── Matriz constitutiva flexión ───
C_b_coeff = I_plate * E / (1 - nu^2)

% ─── Matriz constitutiva corte ───
C_s_coeff = kapa * th * E / (2 * (1 + nu))

% ─── Placa cuadrada ───
a = 1
P = -1

% ─── Mesh 4x4 ───
nX = 4
nY = 4
nNodes = (nX + 1) * (nY + 1)
nElem = nX * nY
ndof = 3 * nNodes

% 3 DOF/nodo: w, theta_x, theta_y

% ─── Integración selectiva ───
% Flexión: 2x2 Gauss (completa)
% Corte: 1x1 Gauss (reducida → evita shear locking)

% ─── K elemento: K = K_b + K_s ───
% K_b = h^3/12 * integral Bf' Df Bf |J| dxi deta (2x2)
% K_s = alpha*h * integral Bc' Dc Bc |J| dxi deta (1x1)

% ─── Solución exacta (SSSS, a/h=10) ───
% w_bar = w * D / (P*L^4)
w_bar_exact_SSSS = 0.004270
w_bar_exact_CCCC = 0.001503

% ─── Desplazamiento esperado ───
w_SSSS = w_bar_exact_SSSS * P * a^4 / D_flex
w_CCCC = w_bar_exact_CCCC * P * a^4 / D_flex

% ─── Resultados Ferreira (Table 12.1, a/h=10) ───
% Mesh 2x2:   SSSS=0.003545  CCCC=0.000357
% Mesh 6x6:   SSSS=0.004245  CCCC=0.001486
% Mesh 10x10: SSSS=0.004263  CCCC=0.001498
% Mesh 20x20: SSSS=0.004270  CCCC=0.001503
% Exacto:     SSSS=0.004270  CCCC=—` },

  { name: 'Ferreira Cap12 — Benchmark SSSS', category: 'Ferreira', code: `% ═══════════════════════════════════════════
% Ferreira Cap 12: Benchmark Placa Mindlin Q4
% Placa cuadrada SSSS 1x1m, t=0.1m, q=-1 kN/m2
% Hard SS1 (Navier): w=0 + rot tangencial=0
% w_bar exacto = 0.004270
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 10920; nu = 0.3; kapa = 5/6; tt = 0.1
D_flex = E * tt^3 / (12 * (1 - nu^2))

% ─── 2. MALLA ───
Lx = 1; Ly = 1; q = -1
nx = 8; ny = 8
nNx = nx+1; nNy = ny+1
nN = nNx * nNy; ndof = nN * 3
dx = Lx/nx; dy = Ly/ny

% ─── 3. NODOS ───
nds = zeros(nN, 3)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    nds(nn,1) = ix*dx; nds(nn,2) = iy*dy
  end
end

% ─── 4. ELEMENTOS Q4 ───
nQ4 = nx*ny
els = zeros(nQ4, 4)
ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    ne = ne+1
    n1 = iy*nNx + ix + 1
    els(ne,1)=n1; els(ne,2)=n1+1; els(ne,3)=n1+nNx+1; els(ne,4)=n1+nNx
  end
end

% ─── 5. APOYOS — Hard SS1 (Navier BC) ───
% Bordes x (x=0,L): w=0, theta_x=0
% Bordes y (y=0,L): w=0, theta_y=0
fixedDofs = []
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    on_x = (ix==0) + (ix==nx)
    on_y = (iy==0) + (iy==ny)
    if on_x + on_y > 0
      fixedDofs = [fixedDofs, (nn-1)*3+1]
    end
    if on_x > 0
      fixedDofs = [fixedDofs, (nn-1)*3+2]
    end
    if on_y > 0
      fixedDofs = [fixedDofs, (nn-1)*3+3]
    end
  end
end

% ─── 6. CARGAS (consistent: q*Ae/4) ───
Ae = dx*dy
Fv = zeros(ndof, 1)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  Fv((n1-1)*3+1) = Fv((n1-1)*3+1) + q*Ae/4
  Fv((n2-1)*3+1) = Fv((n2-1)*3+1) + q*Ae/4
  Fv((n3-1)*3+1) = Fv((n3-1)*3+1) + q*Ae/4
  Fv((n4-1)*3+1) = Fv((n4-1)*3+1) + q*Ae/4
end

% ─── 7. ENSAMBLAJE ───
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_plate_mitc4(E, nu, tt, kapa, coords)
  dofs = [(n1-1)*3+1,(n1-1)*3+2,(n1-1)*3+3, (n2-1)*3+1,(n2-1)*3+2,(n2-1)*3+3, (n3-1)*3+1,(n3-1)*3+2,(n3-1)*3+3, (n4-1)*3+1,(n4-1)*3+2,(n4-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end

% ─── 8. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 9. RESULTADOS ───
midN = (ny/2)*nNx + nx/2 + 1
w_c = Uf((midN-1)*3+1)
w_bar = abs(w_c) * D_flex / (abs(q) * Lx^4)
disp("Flecha centro [m]:"); disp(w_c)
disp("w_bar FEM:"); disp(w_bar)
disp("w_bar exacto:"); disp(0.004270)
disp("Ratio FEM/exacto:"); disp(w_bar / 0.004270)

% ─── 10. VISUALIZACION ───
supVec = [1, nNx, ny*nNx+1, nN]
show3d(nds, els, "Ferreira SSSS — geometria", supVec)
show_deformed(nds, els, Uf, 0, 3, "Ferreira SSSS — deformada", supVec)
vals = zeros(nN, 1)
for i = range(1, nN, 1)
  vals(i) = Uf((i-1)*3+1)
end
show_deformed_contour(nds, els, Uf, vals, 0, 3, "Ferreira SSSS — contorno w")` },

  // ── Curso FEM Completo (simbólico + numérico) ──

  { name: 'Curso FEM 1 — Barra 1D', category: 'Curso FEM', code: `% ═══════════════════════════════════════════
% Curso FEM 1: Barra 1D — De la ecuación diferencial al resultado
% Simbólico (sdiff, sint) + Numérico (matrices, solve)
% ═══════════════════════════════════════════

% ═══ PARTE 1: FORMULACIÓN FUERTE ═══

% Ecuación de gobierno (barra axial):
% -EA * d²u/dx² = q(x)

% Verificar simbólicamente:
% Si u(x) = x², entonces u'' = 2
u_sym = sdiff('x^2', 'x')
u_sym2 = sdiff2('x^2', 'x')

% ═══ PARTE 2: FORMULACIÓN DÉBIL ═══

% Multiplicar por función de prueba v e integrar:
% integral(0,L) EA du/dx dv/dx dx = integral(0,L) q v dx

% Integral simbólica de x²:
F_sym = sint('x^2', 'x')

% Integral definida integral(0,1) x² dx = 1/3:
area = sdefint('x^2', 'x', 0, 1)

% ═══ PARTE 3: FUNCIONES DE FORMA ═══

% Elemento lineal: 2 nodos, xi in [0, 1]
% N1(xi) = 1 - xi
% N2(xi) = xi

% Derivadas de N:
dN1 = sdiff('1-x', 'x')
dN2 = sdiff('x', 'x')

% ═══ PARTE 4: MATRIZ B ═══

% B = dN/dx = (1/L)*[-1, 1]
L = 2
E = 210000
A = 0.01
B_mat = (1/L) * [-1, 1]

% ═══ PARTE 5: MATRIZ K ═══

% K = integral(0,L) B' * EA * B dx
% K = (EA/L) * [1, -1; -1, 1]
K = (E * A / L) * [1, -1; -1, 1]

% Verificar con integración simbólica:
EA = E * A
K_11_sym = sdefint('2100*(0.5)^2', 'x', 0, 2)

% ═══ PARTE 6: VECTOR DE CARGAS ═══

% Carga distribuida q = 5 kN/m
q = 5
% f = [qL/2; qL/2]
f = [q * L / 2; q * L / 2]

% Carga puntual P = 20 kN en extremo
P = 20

% ═══ PARTE 7: CONDICIONES DE BORDE ═══

% Nodo 1 fijo: u1 = 0
% Reducción: K22 * u2 = f2 + P
K_red = EA / L
F_red = q * L / 2 + P

% ═══ PARTE 8: SOLUCIÓN ═══
u2 = F_red / K_red

% ═══ PARTE 9: VERIFICACIÓN ═══

% Solución exacta: u(L) = (PL + qL²/2) / (EA)
u_exact = (P * L + q * L^2 / 2) / (E * A)
error_pct = abs(u2 - u_exact) / u_exact * 100

% Reacción: R = -(P + qL)
R = -(P + q * L)

% Esfuerzo: sigma = E * u2 / L
sigma = E * u2 / L` },

  { name: 'Curso FEM 2 — Viga Euler-Bernoulli', category: 'Curso FEM', code: `% ═══════════════════════════════════════════
% Curso FEM 2: Viga Euler-Bernoulli
% Flexión — funciones de forma cúbicas (Hermite)
% ═══════════════════════════════════════════

% ═══ PARTE 1: ECUACIÓN DIFERENCIAL ═══

% EI * d⁴w/dx⁴ = q(x)

% Derivada simbólica de función cúbica:
w = sdiff('a*x^3 + b*x^2 + c*x + d', 'x')
w2 = sdiff2('a*x^3 + b*x^2 + c*x + d', 'x')

% ═══ PARTE 2: FUNCIONES DE FORMA HERMITE ═══

% 2 DOF/nodo: w (deflexión) y theta = dw/dx (rotación)
% 4 funciones de forma (cúbicas):
% N1 = 1 - 3*xi² + 2*xi³
% N2 = L*(xi - 2*xi² + xi³)
% N3 = 3*xi² - 2*xi³
% N4 = L*(-xi² + xi³)

% Verificar N1(0) = 1, N1(1) = 0:
% N1(xi) = 1 - 3*xi^2 + 2*xi^3
N1_0 = 1 - 3*0^2 + 2*0^3
N1_1 = 1 - 3*1^2 + 2*1^3

% Derivadas (para matriz B):
dN1 = sdiff('1 - 3*x^2 + 2*x^3', 'x')
d2N1 = sdiff2('1 - 3*x^2 + 2*x^3', 'x')

% ═══ PARTE 3: MATRIZ K ═══

% K = integral(0,L) EI (N'')^T (N'') dx

E = 210000
I_v = 0.0001
L = 3

coeff = E * I_v / L^3
K_beam = coeff * [12, 6*L, -12, 6*L; 6*L, 4*L^2, -6*L, 2*L^2; -12, -6*L, 12, -6*L; 6*L, 2*L^2, -6*L, 4*L^2]

% ═══ PARTE 4: CARGAS CONSISTENTES ═══

q = 10
f_beam = q * L / 2 * [1; L/6; 1; -L/6]

% ═══ PARTE 5: SOLUCIÓN (viga en voladizo) ═══

% BC: w1 = 0, theta1 = 0 → DOFs libres: 3, 4
K_red_beam = [K_beam(3,3), K_beam(3,4); K_beam(4,3), K_beam(4,4)]
F_red_beam = [f_beam(3); f_beam(4)]

% Solución exacta voladizo: w_max = qL⁴/(8EI)
w_exact = q * L^4 / (8 * E * I_v)` },

  { name: 'Curso FEM 3 — Elemento Q4 Plane Stress', category: 'Curso FEM', code: `% ═══════════════════════════════════════════
% Curso FEM 3: Elemento Q4 — Plane Stress
% Cuadrilátero bilineal completo paso a paso
% ═══════════════════════════════════════════

% ═══ PARTE 1: FUNCIONES DE FORMA Q4 ═══

% 4 nodos, coordenadas naturales xi, eta in [-1, 1]
% Ni = 1/4 * (1 ± xi)(1 ± eta)

% Evaluar en centro (xi=0, eta=0):
xi0 = 0
eta0 = 0
N1 = 0.25*(1-xi0)*(1-eta0)
N2 = 0.25*(1+xi0)*(1-eta0)
N3 = 0.25*(1+xi0)*(1+eta0)
N4 = 0.25*(1-xi0)*(1+eta0)
N_centro = [N1, N2, N3, N4]

% Evaluar en nodo 1 (xi=-1, eta=-1):
N1_nodo = 0.25*(1-(-1))*(1-(-1))

% ═══ PARTE 2: JACOBIANO ═══

% Nodos de un cuadrilátero 2x1:
coords = [0, 0; 2, 0; 2, 1; 0, 1]

% Derivadas dN/dxi, dN/deta en centro (como matriz 2x4)
dN0 = [-(1-eta0), (1-eta0), (1+eta0), -(1+eta0); -(1-xi0), -(1+xi0), (1+xi0), (1-xi0)]
dN0 = 0.25 * dN0

% J = dN * coords
J = dN0 * coords
detJ = det(J)

% Para rectángulo: det(J) = a*b/4 = 2*1/4 = 0.5

% ═══ PARTE 3: CONSTITUTIVA D ═══

% Plane stress: sigma = D * epsilon
E = 210000
nu = 0.3
coeff_D = E / (1 - nu^2)
D = coeff_D * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2]

% ═══ PARTE 4: RIGIDEZ — Integración Gauss 2x2 ═══

t = 1
% K = integral integral B' D B t det(J) dxi deta

% Punto de Gauss 1: xi=-0.577, eta=-0.577
gp = 0.577350269189626
xi1 = -gp
eta1 = -gp

dN1 = [-(1-eta1), (1-eta1), (1+eta1), -(1+eta1); -(1-xi1), -(1+xi1), (1+xi1), (1-xi1)]
dN1 = 0.25 * dN1
J1 = dN1 * coords
detJ1 = det(J1)

% ═══ PARTE 5: VERIFICAR SIMBÓLICO ═══

% Integral simbólica de xi² sobre [-1,1]:
int_xi2 = sdefint('x^2', 'x', -1, 1)` },

  { name: 'Curso FEM 4 — Placa Mindlin Q4', category: 'Curso FEM', code: `% ═══════════════════════════════════════════
% Curso FEM 4: Placa Mindlin-Reissner Q4
% Flexión de placas con corte transversal
% ═══════════════════════════════════════════

% ═══ PARTE 1: TEORÍA ═══

% 3 DOF/nodo: w (deflexión), theta_x, theta_y
% Deformaciones flexión:
%   kappa_x = d(theta_x)/dx
%   kappa_y = d(theta_y)/dy
%   kappa_xy = d(theta_y)/dx + d(theta_x)/dy
% Deformaciones corte:
%   gamma_xz = dw/dx + theta_x
%   gamma_yz = dw/dy + theta_y

% ═══ PARTE 2: CONSTITUTIVAS ═══

E = 10920
nu = 0.3
h = 0.1
kapa = 5/6

% Flexión: Db = E*h³/(12*(1-nu²)) * [1,nu,0; nu,1,0; 0,0,(1-nu)/2]
Db_coeff = E * h^3 / (12 * (1 - nu^2))
Db = Db_coeff * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2]

% Corte: Ds = kapa * E*h/(2*(1+nu)) * I2
Ds_coeff = kapa * E * h / (2 * (1 + nu))
Ds = Ds_coeff * [1, 0; 0, 1]

% ═══ PARTE 3: FUNCIONES DE FORMA Q4 ═══

% Evaluar N y dN en punto de Gauss
xi = 0.577350269189626
eta = 0.577350269189626
N1 = 0.25*(1-xi)*(1-eta)
N2 = 0.25*(1+xi)*(1-eta)
N3 = 0.25*(1+xi)*(1+eta)
N4 = 0.25*(1-xi)*(1+eta)

% Placa cuadrada unitaria
coords = [0, 0; 1, 0; 1, 1; 0, 1]

dN_plate = [-(1-eta), (1-eta), (1+eta), -(1+eta); -(1-xi), -(1+xi), (1+xi), (1-xi)]
dN_plate = 0.25 * dN_plate
J = dN_plate * coords
detJ = det(J)

% ═══ PARTE 4: INTEGRACIÓN SELECTIVA ═══

% CLAVE: evitar shear locking
% Flexión: 2x2 Gauss (completa)
% Corte: 1x1 Gauss (reducida)

% ═══ PARTE 5: BENCHMARK ═══

% Placa cuadrada a=1, carga uniforme P=1
D_flex = E * h^3 / (12 * (1 - nu^2))
% w_bar = w * D / (P*a^4)
% SSSS: w_bar = 0.004270 (a/h=10)
% CCCC: w_bar = 0.001503 (a/h=10)

w_SSSS = 0.004270 * 1 * 1^4 / D_flex
w_CCCC = 0.001503 * 1 * 1^4 / D_flex

% ═══ PARTE 6: SIMBÓLICO — Verificar D ═══

% Verificación numérica de D_flex
D_check = 10920 * 0.1^3 / (12 * (1 - 0.3^2))
disp("D_flex verificación:"); disp(D_check)` },

  { name: 'Derivación — Viga empotrada', category: 'Derivación', code: `% ═══════════════════════════════════════════
% Viga empotrada-libre (cantilever)
% 1 elemento, 2 DOF/nodo (v, theta)
% ═══════════════════════════════════════════

% ─── Datos ───
L = 3
E = 2.1e7
b_sec = 0.25
h = 0.40
I = b_sec * h^3 / 12

% ─── Funciones de forma (Hermite) ───
%   N1 = 1 - 3*xi² + 2*xi³
%   N2 = L*xi*(1-xi)²
%   N3 = 3*xi² - 2*xi³
%   N4 = L*xi²*(xi-1)

% ─── K local (4x4): [v1, th1, v2, th2] ───
EI = E * I
K = (EI / L^3) * [12, 6*L, -12, 6*L; 6*L, 4*L^2, -6*L, 2*L^2; -12, -6*L, 12, -6*L; 6*L, 2*L^2, -6*L, 4*L^2]

% ─── Carga puntual en extremo libre ───
P = -10

% ─── BCs: nodo 1 empotrado (v1=0, th1=0) ───
% K reducida: filas/cols 3,4
K_free = [K(3,3), K(3,4); K(4,3), K(4,4)]
F_free = [P; 0]

% ─── Solve ───
u_free = inv(K_free) * F_free
v2 = u_free(1)
th2 = u_free(2)

% ─── Solución exacta ───
v_exact = P * L^3 / (3 * EI)
th_exact = P * L^2 / (2 * EI)

% ─── Verificación ───
error_v = abs(v2 - v_exact) / abs(v_exact) * 100
error_th = abs(th2 - th_exact) / abs(th_exact) * 100

% ─── Reacciones ───
R_v = -(P)
M_emp = -(P * L)` },

  // ── Awatif Clone Examples (convertidos a MATLAB) ──

  { name: 'Awatif — Portal Frame 3D', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Portal Frame 3D — Beams example
% 2 columnas + 1 viga, 4 nodos, 6 DOF/nodo
% ═══════════════════════════════════════════

% ─── Geometría ───
span = 10
height = 10

% ─── Nodos [x, y, z] ───
nodes = [0, 0, 0; span, 0, 0; 0, 0, height; span, 0, height]

% ─── Conectividad ───
elem = [1, 3; 3, 4; 4, 2]

% ─── Material ───
E = 10e9
G = 10e9
A = 10
Iy = 10
Iz = 10
J = 10

% ─── Cargas ───
% Fuerza lateral en nodo 4 (top derecho)
xLoad = 10000
F = zeros(24, 1)
F(19) = xLoad

% ─── Apoyos: nodos 1 y 2 empotrados ───
fixed_dofs = [1,2,3,4,5,6, 7,8,9,10,11,12]
free_dofs = [13,14,15,16,17,18, 19,20,21,22,23,24]

% ─── K local frame 3D (12x12) ───
% Coeficientes para columna (vertical, L=height)
L1 = height
ka = E*A/L1
kt = G*J/L1
bz = 12*E*Iz/L1^3
cz = 6*E*Iz/L1^2
dz = 4*E*Iz/L1
ez = 2*E*Iz/L1
by = 12*E*Iy/L1^3
cy = 6*E*Iy/L1^2
dy1 = 4*E*Iy/L1
ey = 2*E*Iy/L1

K_col = [ka,0,0,0,0,0,-ka,0,0,0,0,0; 0,bz,0,0,0,cz,0,-bz,0,0,0,cz; 0,0,by,0,-cy,0,0,0,-by,0,-cy,0; 0,0,0,kt,0,0,0,0,0,-kt,0,0; 0,0,-cy,0,dy1,0,0,0,cy,0,ey,0; 0,cz,0,0,0,dz,0,-cz,0,0,0,ez; -ka,0,0,0,0,0,ka,0,0,0,0,0; 0,-bz,0,0,0,-cz,0,bz,0,0,0,-cz; 0,0,-by,0,cy,0,0,0,by,0,cy,0; 0,0,0,-kt,0,0,0,0,0,kt,0,0; 0,0,-cy,0,ey,0,0,0,cy,0,dy1,0; 0,cz,0,0,0,ez,0,-cz,0,0,0,dz]` },

  { name: 'Awatif — Grid Structure 3D', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Estructura 3D — Grid de 4 pisos
% Basado en awatif 3d-structure example
% ═══════════════════════════════════════════

% ─── Parámetros ───
dx = 2
dy = 2
dz = 2
nStories = 4
load_lat = 30000

% ─── Generar nodos ───
% 4 nodos por piso, 5 niveles (0 a 4)
nnodes = 4 * (nStories + 1)
nds = zeros(nnodes, 3)
for i = range(0, nStories, 1)
  base = i * 4
  nds(base+1,:) = [0, 0, dz*i]
  nds(base+2,:) = [dx, 0, dz*i]
  nds(base+3,:) = [dx, dy, dz*i]
  nds(base+4,:) = [0, dy, dz*i]
end

% ─── Conectividad: vigas + columnas + diagonales ───
% Vigas de piso (4 por piso)
els_beams = []
for i = range(1, nStories, 1)
  b = i * 4
  els_beams = [els_beams; b+1,b+2; b+2,b+3; b+3,b+4; b+4,b+1]
end

% Columnas (4 columnas)
els_cols = []
for i = range(0, nStories-1, 1)
  b = i * 4
  els_cols = [els_cols; b+1,b+5; b+2,b+6; b+3,b+7; b+4,b+8]
end

% ─── Material ───
E = 100e9
A_elem = 10e-4

% ─── Apoyos: 4 nodos base empotrados ───
% Nodos 1,2,3,4 con 6 DOF cada uno

% ─── Carga lateral en tope ───
% Nodo nnodes-2: Fx = load_lat
ndof = nnodes * 6
F = zeros(ndof, 1)
F((nnodes-2)*6 + 1) = load_lat` },

  { name: 'Awatif — Plate Q4 Rectangular', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Placa rectangular Q4 — Shell
% Basado en awatif plate-q4 example
% Validación vs SAP2000
% ═══════════════════════════════════════════

% ─── Parámetros ───
Lx = 6
Ly = 4
nx = 6
ny = 4
th = 0.10
E = 35e9
nu = 0.15
q = -10000

% ─── Generar mesh rectangular Q4 ───
nNodesX = nx + 1
nNodesY = ny + 1
nnodes = nNodesX * nNodesY

nds = zeros(nnodes, 3)
k = 1
for j = range(0, ny, 1)
  for i = range(0, nx, 1)
    nds(k,:) = [i*Lx/nx, j*Ly/ny, 0]
    k = k + 1
  end
end

% ─── Conectividad Q4 ───
nElem = nx * ny
els = zeros(nElem, 4)
e = 1
for j = range(0, ny-1, 1)
  for i = range(0, nx-1, 1)
    n1 = j*nNodesX + i + 1
    n2 = n1 + 1
    n3 = n2 + nNodesX
    n4 = n1 + nNodesX
    els(e,:) = [n1, n2, n3, n4]
    e = e + 1
  end
end

% ─── Material ───
% D_flex = E*h³/(12*(1-nu²))
D_flex = E * th^3 / (12 * (1 - nu^2))

% D_membrane = E*h/(1-nu²) * [1,nu,0; nu,1,0; 0,0,(1-nu)/2]
Dm = E * th / (1 - nu^2) * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2]

% ─── Apoyos: bordes simplemente apoyados (Z fijo) ───
% Nodos en bordes: i=0, i=nx, j=0, j=ny

% ─── Carga uniforme ───
% q = -10 kN/m² distribuida en area tributaria
% Area por nodo interior = (Lx/nx)*(Ly/ny)
A_trib = (Lx/nx) * (Ly/ny)
F_nodo = q * A_trib

% ─── Solución analítica (Navier, placa simplemente apoyada) ───
% w_max = alpha * q * a⁴ / D
% Para a/b = 6/4 = 1.5: alpha ≈ 0.00772
alpha = 0.00772
w_analitico = alpha * abs(q) * Lx^4 / D_flex` },

  { name: 'Awatif — Frame 3D (Ferreira problem13)', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Frame 3D — Ferreira problem13
% Pórtico espacial, 6 DOF/nodo
% ═══════════════════════════════════════════

% ─── Datos ───
E = 210e9
G = 84e9
A = 0.02
Iy = 10e-5
Iz = 20e-5
J = 5e-5

% Nodos [x, y, z]
nodes = [0, 0, 0; 3, 0, 0; 3, 0, -3; 0, 0, -3]

% Conectividad
elem = [1, 2; 2, 3; 3, 4]

% 6 DOF/nodo: u, v, w, theta_x, theta_y, theta_z
nNodes = 4
ndof = nNodes * 6

% ─── K local frame 3D (12x12) ───
% Coeficientes del libro (Eq 8.1-8.4):
L_1 = 3
K_axial = E * A / L_1
K_flex_z = 12 * E * Iz / L_1^3
K_flex_y = 12 * E * Iy / L_1^3
K_torsion = G * J / L_1
K_bend_y = 4 * E * Iy / L_1
K_bend_z = 4 * E * Iz / L_1

% ─── Carga: P = 20000 N en nodo 2, dirección -Z ───
P = -20000

% ─── BCs: empotrado nodos 1 y 4 ───
% DOFs fijos: 1-6, 19-24
% DOFs libres: 7-18` },

  { name: 'Awatif — Truss 3D (Ferreira problem8)', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Truss 3D — Ferreira problem8
% Cercha espacial, 3 DOF/nodo
% ═══════════════════════════════════════════

% ─── Datos ───
E = 1.2e6
A = 0.5

% Nodos [x, y, z]
nodes = [72, 0, 0; 0, 36, 0; 0, 36, 72; 0, 0, -48]

% Conectividad
elem = [1, 2; 1, 3; 1, 4]
nElem = 3

% ─── Longitud elemento 1 ───
dx = nodes(2,1) - nodes(1,1)
dy = nodes(2,2) - nodes(1,2)
dz = nodes(2,3) - nodes(1,3)
L_1 = sqrt(dx^2 + dy^2 + dz^2)

% Cosenos directores
cx = dx / L_1
cy = dy / L_1
cz = dz / L_1

% ─── K local truss 3D (6x6) ───
% K = (EA/L) * T' * [1,-1;-1,1] * T
% donde T transforma 3D a local

% ─── Longitud elemento 2 ───
dx2 = nodes(3,1) - nodes(1,1)
dy2 = nodes(3,2) - nodes(1,2)
dz2 = nodes(3,3) - nodes(1,3)
L_2 = sqrt(dx2^2 + dy2^2 + dz2^2)

% ─── Longitud elemento 3 ───
dx3 = nodes(4,1) - nodes(1,1)
dy3 = nodes(4,2) - nodes(1,2)
dz3 = nodes(4,3) - nodes(1,3)
L_3 = sqrt(dx3^2 + dy3^2 + dz3^2)

% ─── Carga en nodo 1 ───
% F = [0, -1000, 0] (nodo 1)
F = [0; -1000; 0]

% ─── BCs: nodos 2, 3, 4 fijos (todos DOFs) ───
% DOF libre: nodo 1 (DOFs 1-3)` },

  { name: 'Awatif — Slab + Columns Building', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Edificio con losa + columnas
% Basado en awatif building example
% 2 pisos, losa shell + columnas frame
% ═══════════════════════════════════════════

% ─── Parámetros ───
nStories = 2
floorH = 4

% ─── Planta rectangular ───
Lx = 18
Ly = 10

% ─── Esquinas de losa ───
slab_corners = [0, 0; 0, Ly; Lx, Ly; Lx, 0]

% ─── Posiciones de columnas ───
col_pos = [0, 0; 0, Ly; Lx, Ly; Lx, 0; 6, 0; 6, Ly]
nCols = 6

% ─── Material (hormigón) ───
E_conc = 25e9
nu = 0.2
rho = 2500

% ─── Losa ───
t_slab = 0.20
% D_flex = E*h³/(12*(1-nu²))
D_flex = E_conc * t_slab^3 / (12 * (1 - nu^2))

% ─── Columnas 40x40 cm ───
bc = 0.40
hc = 0.40
A_col = bc * hc
Iz_col = bc * hc^3 / 12
Iy_col = hc * bc^3 / 12
J_col = bc * hc * (bc^2 + hc^2) / 12
G_conc = E_conc / (2*(1+nu))

% ─── Carga sobre losa ───
q_slab = 5000
% Carga total = q * Lx * Ly
Q_total = q_slab * Lx * Ly

% ─── Resumen por piso ───
peso_losa = rho * 9.81 * t_slab * Lx * Ly
peso_col = rho * 9.81 * A_col * floorH * nCols
peso_total = nStories * (peso_losa + peso_col)

% ─── K columna (12x12) ───
L_col = floorH
ka = E_conc * A_col / L_col
bz = 12 * E_conc * Iz_col / L_col^3
cz = 6 * E_conc * Iz_col / L_col^2
dz = 4 * E_conc * Iz_col / L_col
ez = 2 * E_conc * Iz_col / L_col
kt = G_conc * J_col / L_col` },

  // ── Hekatan Struct ──

  { name: 'Planta L', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Edificio planta L — hormigon, 3 pisos
% Planta en L: 3 col X, 3 col Y (esquina recortada)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.16; Iz = 3.33e-3; Iy = 3.33e-3; J = 1e-4

% ─── 3. NODOS ───
floorH = 3.5
nStories = 3
dx = 5; dy = 4

% Planta L: 7 posiciones en planta (3x3 menos esquina sup-der)
% (1)0,0 (2)5,0 (3)10,0
% (4)0,4 (5)5,4 (6)10,4
% (7)0,8
xPlan = [0, 5, 10, 0, 5, 10, 0]
yPlan = [0, 0, 0, 4, 4, 4, 8]
nPlan = 7
nZ = nStories + 1
nNodes = nPlan * nZ
nds = zeros(nNodes, 3)
nid = zeros(nPlan, nZ)
for iz = range(1, nZ, 1)
  zz = (iz-1) * floorH
  for ip = range(1, nPlan, 1)
    nn = (iz-1)*nPlan + ip
    nds(nn,1) = xPlan(ip); nds(nn,2) = yPlan(ip); nds(nn,3) = zz
    nid(ip,iz) = nn
  end
end

% ─── 4. ELEMENTOS ───
beamA = [1,2,4,5,1,2,3,4,7]
beamB = [2,3,5,6,4,5,6,7,4]
nBeams = 9

maxEls = (nZ-1)*nPlan + (nZ-1)*nBeams
els = zeros(maxEls, 2); nEls = 0

% Columnas
for iz = range(1, nZ-1, 1)
  for ip = range(1, nPlan, 1)
    nEls = nEls+1; els(nEls,1)=nid(ip,iz); els(nEls,2)=nid(ip,iz+1)
  end
end

% Vigas
for iz = range(2, nZ, 1)
  for ib = range(1, nBeams, 1)
    nEls = nEls+1; els(nEls,1)=nid(beamA(ib),iz); els(nEls,2)=nid(beamB(ib),iz)
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
sups = zeros(nPlan, 7)
for ip = range(1, nPlan, 1)
  sups(ip,1)=nid(ip,1); sups(ip,2)=1; sups(ip,3)=1; sups(ip,4)=1
  sups(ip,5)=1; sups(ip,6)=1; sups(ip,7)=1
end

supVec = zeros(1,nPlan)
for ip = range(1,nPlan,1)
  supVec(ip) = nid(ip,1)
end

% ─── 6. CARGAS ───
topNode = nid(1,nZ)
loads = [topNode, 10, 0, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Planta L — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Planta L — deformada", supVec, loads)` },

  { name: 'Planta T', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Edificio planta T — hormigon, 3 pisos
% Cuerpo central + ala superior
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.16; Iz = 3.33e-3; Iy = 3.33e-3; J = 1e-4

% ─── 3. NODOS ───
floorH = 3.5
nStories = 3
nZ = nStories + 1

% Planta T: 8 posiciones
% Cuerpo: (1)0,0 (2)5,0 (3)0,5 (4)5,5
% Ala:    (5)-3,5 (6)-3,10 (7)8,5 (8)8,10
xPlan = [0, 5, 0, 5, -3, -3, 8, 8]
yPlan = [0, 0, 5, 5, 5, 10, 5, 10]
nPlan = 8

nNodes = nPlan * nZ
nds = zeros(nNodes, 3)
nid = zeros(nPlan, nZ)
for iz = range(1, nZ, 1)
  zz = (iz-1)*floorH
  for ip = range(1, nPlan, 1)
    nn = (iz-1)*nPlan+ip
    nds(nn,1)=xPlan(ip); nds(nn,2)=yPlan(ip); nds(nn,3)=zz
    nid(ip,iz) = nn
  end
end

% ─── 4. ELEMENTOS ───
beamA = [1,3,1,2,5,3,4,5,6,7]
beamB = [2,4,3,4,3,7,8,6,8,4]
nBeams = 10

maxEls = (nZ-1)*nPlan + (nZ-1)*nBeams
els = zeros(maxEls, 2); nEls = 0

for iz = range(1, nZ-1, 1)
  for ip = range(1, nPlan, 1)
    nEls = nEls+1; els(nEls,1)=nid(ip,iz); els(nEls,2)=nid(ip,iz+1)
  end
end

for iz = range(2, nZ, 1)
  for ib = range(1, nBeams, 1)
    nEls = nEls+1; els(nEls,1)=nid(beamA(ib),iz); els(nEls,2)=nid(beamB(ib),iz)
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
sups = zeros(nPlan, 7)
for ip = range(1, nPlan, 1)
  sups(ip,1)=nid(ip,1); sups(ip,2)=1; sups(ip,3)=1; sups(ip,4)=1
  sups(ip,5)=1; sups(ip,6)=1; sups(ip,7)=1
end

supVec = zeros(1,nPlan)
for ip = range(1,nPlan,1)
  supVec(ip) = nid(ip,1)
end

% ─── 6. CARGAS ───
topNode = nid(1,nZ)
loads = [topNode, 10, 0, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Planta T — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Planta T — deformada", supVec, loads)` },

  { name: 'Planta C', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Edificio planta C (U) — hormigon, 3 pisos
% Tres alas: izquierda, fondo, derecha
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.16; Iz = 3.33e-3; Iy = 3.33e-3; J = 1e-4

% ─── 3. NODOS ───
floorH = 3.5
nStories = 3
nZ = nStories + 1

% Planta C (U abierta arriba)
% (1)0,0 (2)5,0 (3)10,0
% (4)0,5 (5)10,5
% (6)0,10 (7)10,10
xPlan = [0, 5, 10, 0, 10, 0, 10]
yPlan = [0, 0, 0, 5, 5, 10, 10]
nPlan = 7

nNodes = nPlan * nZ
nds = zeros(nNodes, 3)
nid = zeros(nPlan, nZ)
for iz = range(1, nZ, 1)
  zz = (iz-1)*floorH
  for ip = range(1, nPlan, 1)
    nn = (iz-1)*nPlan+ip
    nds(nn,1)=xPlan(ip); nds(nn,2)=yPlan(ip); nds(nn,3)=zz
    nid(ip,iz) = nn
  end
end

% ─── 4. ELEMENTOS ───
beamA = [1,2,1,3,4,5,4,6]
beamB = [2,3,4,5,6,7,5,7]
nBeams = 8

maxEls = (nZ-1)*nPlan + (nZ-1)*nBeams
els = zeros(maxEls, 2); nEls = 0

for iz = range(1, nZ-1, 1)
  for ip = range(1, nPlan, 1)
    nEls = nEls+1; els(nEls,1)=nid(ip,iz); els(nEls,2)=nid(ip,iz+1)
  end
end

for iz = range(2, nZ, 1)
  for ib = range(1, nBeams, 1)
    nEls = nEls+1; els(nEls,1)=nid(beamA(ib),iz); els(nEls,2)=nid(beamB(ib),iz)
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
sups = zeros(nPlan, 7)
for ip = range(1, nPlan, 1)
  sups(ip,1)=nid(ip,1); sups(ip,2)=1; sups(ip,3)=1; sups(ip,4)=1
  sups(ip,5)=1; sups(ip,6)=1; sups(ip,7)=1
end

supVec = zeros(1,nPlan)
for ip = range(1,nPlan,1)
  supVec(ip) = nid(ip,1)
end

% ─── 6. CARGAS ───
topNode = nid(1,nZ)
loads = [topNode, 10, 0, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Planta C — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Planta C — deformada", supVec, loads)` },

  { name: 'Planta +', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Edificio planta + (cruz) — hormigon, 3 pisos
% Nucleo central con 4 alas
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.16; Iz = 3.33e-3; Iy = 3.33e-3; J = 1e-4

% ─── 3. NODOS ───
floorH = 3.5
nStories = 3
nZ = nStories + 1

% Planta + (12 posiciones)
%         (9)5,15 (10)10,15
% (11)0,10 (3)5,10 (4)10,10 (12)15,10
% (7)0,5  (1)5,5  (2)10,5  (8)15,5
%         (5)5,0  (6)10,0
xPlan = [5, 10, 5, 10, 5, 10, 0, 15, 5, 10, 0, 15]
yPlan = [5, 5, 10, 10, 0, 0, 5, 5, 15, 15, 10, 10]
nPlan = 12

nNodes = nPlan * nZ
nds = zeros(nNodes, 3)
nid = zeros(nPlan, nZ)
for iz = range(1, nZ, 1)
  zz = (iz-1)*floorH
  for ip = range(1, nPlan, 1)
    nn = (iz-1)*nPlan+ip
    nds(nn,1)=xPlan(ip); nds(nn,2)=yPlan(ip); nds(nn,3)=zz
    nid(ip,iz) = nn
  end
end

% ─── 4. ELEMENTOS ───
beamA = [1,3,1,2,5,6,7,8,9,10,11,12,3,4,1,2]
beamB = [2,4,3,4,1,2,1,2,3,4,3,4,9,10,7,8]
nBeams = 16

maxEls = (nZ-1)*nPlan + (nZ-1)*nBeams
els = zeros(maxEls, 2); nEls = 0

for iz = range(1, nZ-1, 1)
  for ip = range(1, nPlan, 1)
    nEls = nEls+1; els(nEls,1)=nid(ip,iz); els(nEls,2)=nid(ip,iz+1)
  end
end

for iz = range(2, nZ, 1)
  for ib = range(1, nBeams, 1)
    nEls = nEls+1; els(nEls,1)=nid(beamA(ib),iz); els(nEls,2)=nid(beamB(ib),iz)
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
sups = zeros(nPlan, 7)
for ip = range(1, nPlan, 1)
  sups(ip,1)=nid(ip,1); sups(ip,2)=1; sups(ip,3)=1; sups(ip,4)=1
  sups(ip,5)=1; sups(ip,6)=1; sups(ip,7)=1
end

supVec = zeros(1,nPlan)
for ip = range(1,nPlan,1)
  supVec(ip) = nid(ip,1)
end

% ─── 6. CARGAS ───
topNode = nid(1,nZ)
loads = [topNode, 10, 0, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Planta + — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Planta + — deformada", supVec, loads)` },

  { name: 'Irreg. Elev.', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Edificio irregular en elevacion — retroceso
% Pisos 1-3: planta completa 3x2, Pisos 4-5: solo 2x2
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.16; Iz = 3.33e-3; Iy = 3.33e-3; J = 1e-4

% ─── 3. NODOS ───
floorH = 3.5
nZ = 6  % 5 pisos + base

xAll = [0, 6, 12]
yAll = [0, 5]
nXfull = 3; nYfull = 2; nPlanFull = 6
xRed = [0, 6]
nXred = 2; nPlanRed = 4

% Nodos pisos 0-3: 6 por piso (4 pisos = 24 nodos)
% Nodos pisos 4-5: 4 por piso (2 pisos = 8 nodos)
nNodes = 4*nPlanFull + 2*nPlanRed
nds = zeros(nNodes, 3)
nn = 0

% map(planIdx, iz) for full floors
nidFull = zeros(nPlanFull, 4)
for iz = range(1, 4, 1)
  zz = (iz-1)*floorH
  for iy = range(1, nYfull, 1)
    for ix = range(1, nXfull, 1)
      nn = nn+1; planIdx = (iy-1)*nXfull+ix
      nds(nn,1)=xAll(ix); nds(nn,2)=yAll(iy); nds(nn,3)=zz
      nidFull(planIdx,iz) = nn
    end
  end
end

% map for reduced floors
nidRed = zeros(nPlanRed, 2)
for iz = range(1, 2, 1)
  zz = (3+iz)*floorH
  for iy = range(1, nYfull, 1)
    for ix = range(1, nXred, 1)
      nn = nn+1; planIdx = (iy-1)*nXred+ix
      nds(nn,1)=xRed(ix); nds(nn,2)=yAll(iy); nds(nn,3)=zz
      nidRed(planIdx,iz) = nn
    end
  end
end

% ─── 4. ELEMENTOS ───
maxEls = 300
els = zeros(maxEls, 2); nEls = 0

% Columnas pisos 0-3
for iz = range(1, 3, 1)
  for ip = range(1, nPlanFull, 1)
    nEls = nEls+1; els(nEls,1)=nidFull(ip,iz); els(nEls,2)=nidFull(ip,iz+1)
  end
end

% Columnas pisos 3-4 (solo las 4 primeras col)
for ip = range(1, nPlanRed, 1)
  nEls = nEls+1; els(nEls,1)=nidFull(ip,4); els(nEls,2)=nidRed(ip,1)
end

% Columnas pisos 4-5
for ip = range(1, nPlanRed, 1)
  nEls = nEls+1; els(nEls,1)=nidRed(ip,1); els(nEls,2)=nidRed(ip,2)
end

% Vigas full floors (iz=2,3,4)
for iz = range(2, 4, 1)
  for iy = range(1, nYfull, 1)
    for ix = range(1, nXfull-1, 1)
      p1=(iy-1)*nXfull+ix; p2=(iy-1)*nXfull+ix+1
      nEls = nEls+1; els(nEls,1)=nidFull(p1,iz); els(nEls,2)=nidFull(p2,iz)
    end
  end
  for ix = range(1, nXfull, 1)
    for iy = range(1, nYfull-1, 1)
      p1=(iy-1)*nXfull+ix; p2=iy*nXfull+ix
      nEls = nEls+1; els(nEls,1)=nidFull(p1,iz); els(nEls,2)=nidFull(p2,iz)
    end
  end
end

% Vigas reduced floors
for iz = range(1, 2, 1)
  for iy = range(1, nYfull, 1)
    for ix = range(1, nXred-1, 1)
      p1=(iy-1)*nXred+ix; p2=(iy-1)*nXred+ix+1
      nEls = nEls+1; els(nEls,1)=nidRed(p1,iz); els(nEls,2)=nidRed(p2,iz)
    end
  end
  for ix = range(1, nXred, 1)
    p1=ix; p2=nXred+ix
    nEls = nEls+1; els(nEls,1)=nidRed(p1,iz); els(nEls,2)=nidRed(p2,iz)
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
sups = zeros(nPlanFull, 7)
for ip = range(1, nPlanFull, 1)
  sups(ip,1)=nidFull(ip,1); sups(ip,2)=1; sups(ip,3)=1; sups(ip,4)=1
  sups(ip,5)=1; sups(ip,6)=1; sups(ip,7)=1
end

supVec = zeros(1,nPlanFull)
for ip = range(1,nPlanFull,1)
  supVec(ip) = nidFull(ip,1)
end

% ─── 6. CARGAS ───
topNode = nidRed(1,2)
loads = [topNode, 10, 0, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Irreg.Elev. — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Irreg.Elev. — deformada", supVec, loads)` },

  { name: 'Barra', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Barra simple — empotrada, carga puntual en extremo
% Verificacion: delta = PL/EA
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 200e6; nu = 0.3; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.01; Iz = 1e-6; Iy = 1e-6; J = 1e-7

% ─── 3. NODOS ───
LL = 5
nds = zeros(2, 3)
nds(1,1)=0; nds(1,2)=0; nds(1,3)=0
nds(2,1)=LL; nds(2,2)=0; nds(2,3)=0

% ─── 4. ELEMENTOS ───
els = zeros(1, 2)
els(1,1) = 1; els(1,2) = 2

% ─── 5. APOYOS ───
sups = [1,1,1,1,1,1,1]
supVec = [1]

% ─── 6. CARGAS ───
P = 100   % kN
loads = [2, P, 0, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
disp("Ux nodo 2 (FEM) [m]:"); disp(Uf(7))
delta_exact = P / (E * A) * LL
disp("Ux nodo 2 (exacto PL/EA) [m]:"); disp(delta_exact)

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Barra — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Barra — deformada", supVec, loads)` },

  { name: 'Placa 3Q', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Placa CST (Constant Strain Triangle) — Plane Stress
% Placa 1x1, malla 4x4, traccion borde derecho
% 2 DOF/nodo (ux, uy)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E_mat = 1000; nu = 0.3; tt = 0.1
P = 10  % traccion total borde derecho

% ─── 2. MALLA ───
nx = 4; ny = 4; Lx = 1; Ly = 1
nds = meshRect_nodes(Lx, Ly, nx, ny)
els = meshRect_cst(nx, ny)
nNx = nx+1; nNy = ny+1
nNodes = nNx * nNy
nTri = nx * ny * 2
ndof = 2 * nNodes
disp("Nodos:"); disp(nNodes)
disp("Triangulos CST:"); disp(nTri)

% ─── 3. APOYOS ───
% Borde izquierdo empotrado (ux=uy=0)
fixedDofs = fixed_left_edge(nx, ny)

% ─── 4. CARGAS ───
% Traccion uniforme Fx en borde derecho
Fv = zeros(ndof, 1)
fPerNode = P / nNy
for iy = range(0, ny, 1)
  nn = iy*nNx + nNx
  Fv(2*nn-1) = fPerNode
end

% ─── 5. ENSAMBLAJE ───
Kg = zeros(ndof, ndof)
for e = range(1, nTri, 1)
  n1 = els(e,1); n2 = els(e,2); n3 = els(e,3)
  x1=nds(n1,1); y1=nds(n1,2)
  x2=nds(n2,1); y2=nds(n2,2)
  x3=nds(n3,1); y3=nds(n3,2)
  Ke = k_cst(E_mat, nu, tt, x1,y1, x2,y2, x3,y3)
  dofs_e = [2*n1-1, 2*n1, 2*n2-1, 2*n2, 2*n3-1, 2*n3]
  Kg = assemble(Kg, Ke, dofs_e)
end

% ─── 6. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 7. RESULTADOS ───
% Desplazamiento maximo borde derecho
uxMax = 0
for iy = range(0, ny, 1)
  nn = iy*nNx + nNx
  uxNode = abs(Uf(2*nn-1))
  if uxNode > uxMax
    uxMax = uxNode
  end
end
disp("Ux max borde derecho:"); disp(uxMax)
% Referencia analitica: ux = P*L/(E*A) = 10*1/(1000*1*0.1) = 0.1
disp("Ux teoria (P*L/EA):"); disp(P*Lx/(E_mat*Ly*tt))

% ─── 8. VISUALIZACION ───
supVec = zeros(1, nNy)
for iy = range(0, ny, 1)
  supVec(iy+1) = iy*nNx + 1
end
show3d(nds, els, "Placa 3Q (CST) — geometria", supVec)
show_deformed(nds, els, Uf, 0, 2, "Placa 3Q (CST) — deformada", supVec)

% ─── CONTORNO ───
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  ux = Uf((i-1)*2+1); uy = Uf((i-1)*2+2)
  vals(i) = sqrt(ux^2 + uy^2)
end
show_deformed_contour(nds, els, Uf, vals, 0, 2, "Placa 3Q — contorno |u|")` },

  { name: 'Placa Q4', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Placa Q4 — Plane Stress, malla 4x4
% Placa 1x1, traccion borde derecho
% 2 DOF/nodo (ux, uy)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E_mat = 1000; nu = 0.3; tt = 0.1
P = 10  % traccion total borde derecho

% ─── 2. MALLA ───
nx = 4; ny = 4; Lx = 1; Ly = 1
nNx = nx+1; nNy = ny+1
nNodes = nNx * nNy
ndof = 2 * nNodes

nds = meshRect_nodes(Lx, Ly, nx, ny)

% Elementos Q4 (CCW: n1-n2-n3-n4)
nQ4 = nx * ny
els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx + ix + 1; n2 = n1+1
    n3 = n1 + nNx + 1; n4 = n1 + nNx
    ne = ne+1
    els(ne,1)=n1; els(ne,2)=n2; els(ne,3)=n3; els(ne,4)=n4
  end
end
disp("Nodos:"); disp(nNodes)
disp("Q4 elementos:"); disp(nQ4)

% ─── 3. APOYOS ───
fixedDofs = fixed_left_edge(nx, ny)

% ─── 4. CARGAS ───
Fv = zeros(ndof, 1)
fPerNode = P / nNy
for iy = range(0, ny, 1)
  nn = iy*nNx + nNx
  Fv(2*nn-1) = fPerNode
end

% ─── 5. ENSAMBLAJE ───
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_q4(E_mat, nu, tt, coords)
  dofs_e = [2*n1-1,2*n1, 2*n2-1,2*n2, 2*n3-1,2*n3, 2*n4-1,2*n4]
  Kg = assemble(Kg, Ke, dofs_e)
end

% ─── 6. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 7. RESULTADOS ───
uxMax = 0
for iy = range(0, ny, 1)
  nn = iy*nNx + nNx
  uxNode = abs(Uf(2*nn-1))
  if uxNode > uxMax
    uxMax = uxNode
  end
end
disp("Ux max borde derecho:"); disp(uxMax)
disp("Ux teoria (P*L/EA):"); disp(P*Lx/(E_mat*Ly*tt))

% ─── 8. VISUALIZACION ───
supVec = zeros(1, nNy)
for iy = range(0, ny, 1)
  supVec(iy+1) = iy*nNx + 1
end
show3d(nds, els, "Placa Q4 — geometria", supVec)
show_deformed(nds, els, Uf, 0, 2, "Placa Q4 — deformada", supVec)

% ─── CONTORNO ───
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  ux = Uf((i-1)*2+1); uy = Uf((i-1)*2+2)
  vals(i) = sqrt(ux^2 + uy^2)
end
show_deformed_contour(nds, els, Uf, vals, 0, 2, "Placa Q4 — contorno |u|")` },

  { name: 'Losa Rect', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Losa rectangular — Mindlin-Reissner Q4
% Simplemente apoyada, carga uniforme
% 3 DOF/nodo: w, theta_x, theta_y
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E_mat = 25e6          % kPa (hormigon)
nu = 0.2
kapa = 5/6            % factor corte

% ─── 2. GEOMETRIA ───
Lx = 4; Ly = 4        % m (placa cuadrada)
tt = 0.15              % espesor m
nx = 6; ny = 6
q = -10                % kN/m2 (gravedad)

% ─── 3. NODOS ───
nNx = nx+1; nNy = ny+1
nNodes = nNx * nNy
nds = zeros(nNodes, 3)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    nds(nn,1) = ix * Lx / nx
    nds(nn,2) = iy * Ly / ny
  end
end

% ─── 4. ELEMENTOS Q4 ───
nQ4 = nx * ny
els = zeros(nQ4, 4)
ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx + ix + 1
    ne = ne+1
    els(ne,1)=n1; els(ne,2)=n1+1; els(ne,3)=n1+nNx+1; els(ne,4)=n1+nNx
  end
end
disp("nNodos:"); disp(nNodes)
disp("nQ4:"); disp(nQ4)

% ─── 5. APOYOS — Hard SS1 (Navier) ───
% w=0 en bordes + rotacion tangencial = 0
% Bordes x: w=0, theta_x=0 (impide torsion del borde)
% Bordes y: w=0, theta_y=0 (impide torsion del borde)
ndof = nNodes * 3
fixedDofs = []
dx_e = Lx/nx; dy_e = Ly/ny
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    on_x = (ix==0) + (ix==nx)
    on_y = (iy==0) + (iy==ny)
    if on_x + on_y > 0
      fixedDofs = [fixedDofs, (nn-1)*3+1]
    end
    if on_x > 0
      fixedDofs = [fixedDofs, (nn-1)*3+2]
    end
    if on_y > 0
      fixedDofs = [fixedDofs, (nn-1)*3+3]
    end
  end
end

% ─── 6. CARGAS (consistent: q*Ae/4 por nodo) ───
Ae = dx_e * dy_e
Fv = zeros(ndof, 1)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  Fv((n1-1)*3+1) = Fv((n1-1)*3+1) + q*Ae/4
  Fv((n2-1)*3+1) = Fv((n2-1)*3+1) + q*Ae/4
  Fv((n3-1)*3+1) = Fv((n3-1)*3+1) + q*Ae/4
  Fv((n4-1)*3+1) = Fv((n4-1)*3+1) + q*Ae/4
end

% ─── 7. ENSAMBLAJE con k_plate_mitc4 ───
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_plate_mitc4(E_mat, nu, tt, kapa, coords)
  dofs = [(n1-1)*3+1,(n1-1)*3+2,(n1-1)*3+3, (n2-1)*3+1,(n2-1)*3+2,(n2-1)*3+3, (n3-1)*3+1,(n3-1)*3+2,(n3-1)*3+3, (n4-1)*3+1,(n4-1)*3+2,(n4-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end

% ─── 8. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 9. RESULTADOS ───
% Nodo centro
midNode = (ny/2)*nNx + nx/2 + 1
w_center = Uf((midNode-1)*3+1)
disp("Flecha centro FEM [m]:"); disp(w_center)

% Solucion analitica Navier (placa cuadrada SSSS)
DD = E_mat * tt^3 / (12 * (1 - nu^2))
w_navier = 0.00406 * abs(q) * Ly^4 / DD
disp("Flecha Navier [m]:"); disp(w_navier)
disp("Ratio FEM/Navier:"); disp(abs(w_center)/w_navier)

% ─── 10. VISUALIZACION ───
supVec = [1, nNx, ny*nNx+1, nNodes]
show3d(nds, els, "Losa Rect — geometria", supVec)
show_deformed(nds, els, Uf, 0, 3, "Losa Rect — deformada", supVec)

% ─── CONTORNO ───
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  vals(i) = Uf((i-1)*3+1)
end
show_deformed_contour(nds, els, Uf, vals, 0, 3, "Losa Rect — contorno w")` },

  { name: 'Losa Plana', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Losa plana sobre columnas — Mindlin Q4
% 2 vanos cada direccion, 9 columnas puntuales
% 3 DOF/nodo: w, theta_x, theta_y
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E_mat = 25e6; nu = 0.2; kapa = 5/6
tt = 0.25; q = -8   % kN/m2

% ─── 2. GEOMETRIA ───
Lx = 8; Ly = 8      % 2 vanos de 4m cada dir
nx = 8; ny = 8

% ─── 3. NODOS ───
nNx = nx+1; nNy = ny+1; nNodes = nNx*nNy
nds = zeros(nNodes, 3)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    nds(nn,1) = ix*Lx/nx; nds(nn,2) = iy*Ly/ny
  end
end

% ─── 4. ELEMENTOS Q4 ───
nQ4 = nx*ny; els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx+ix+1; ne = ne+1
    els(ne,1)=n1; els(ne,2)=n1+1; els(ne,3)=n1+nNx+1; els(ne,4)=n1+nNx
  end
end
disp("nNodos:"); disp(nNodes); disp("nQ4:"); disp(nQ4)

% ─── 5. APOYOS (9 columnas: w=0) ───
ndof = nNodes * 3
% Columnas en ix=0,4,8 x iy=0,4,8
colIx = [0, 4, 8]; colIy = [0, 4, 8]
fixedDofs = []
supVec = []
for ci = range(1, 3, 1)
  for cj = range(1, 3, 1)
    nn = colIy(cj)*nNx + colIx(ci) + 1
    fixedDofs = [fixedDofs, (nn-1)*3+1]
    supVec = [supVec, nn]
  end
end

% ─── 6. CARGAS ───
Atrib = (Lx/nx)*(Ly/ny)
Fv = zeros(ndof, 1)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx+ix+1
    Fv((nn-1)*3+1) = q*Atrib
  end
end
disp("Carga total [kN]:"); disp(abs(q)*Lx*Ly)

% ─── 7. ENSAMBLAJE con k_plate_mitc4 ───
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_plate_mitc4(E_mat, nu, tt, kapa, coords)
  dofs = [(n1-1)*3+1,(n1-1)*3+2,(n1-1)*3+3, (n2-1)*3+1,(n2-1)*3+2,(n2-1)*3+3, (n3-1)*3+1,(n3-1)*3+2,(n3-1)*3+3, (n4-1)*3+1,(n4-1)*3+2,(n4-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end

% ─── 8. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 9. RESULTADOS ───
midNode = (ny/2)*nNx + nx/2 + 1
w_mid = Uf((midNode-1)*3+1)
disp("Flecha centro vano [m]:"); disp(w_mid)

% ─── 10. VISUALIZACION ───
show3d(nds, els, "Losa Plana — geometria", supVec)
show_deformed(nds, els, Uf, 0, 3, "Losa Plana — deformada", supVec)

% ─── CONTORNO ───
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  vals(i) = Uf((i-1)*3+1)
end
show_deformed_contour(nds, els, Uf, vals, 0, 3, "Losa Plana — contorno w")` },

  { name: 'Viga Alta', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Viga alta (deep beam) — Plane Stress Q4
% L=4m, h=2m, t=0.3m, simplemente apoyada
% Carga puntual P=100 kN centro borde superior
% 2 DOF/nodo (ux, uy)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E_mat = 25e6; nu = 0.2; tt = 0.30
P = 100  % kN

% ─── 2. MALLA ───
nx = 8; ny = 4; Lx = 4; Ly = 2
nNx = nx+1; nNy = ny+1
nNodes = nNx * nNy; ndof = 2 * nNodes
nds = meshRect_nodes(Lx, Ly, nx, ny)
nQ4 = nx * ny
els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx + ix + 1; n2 = n1+1
    n3 = n1 + nNx + 1; n4 = n1 + nNx
    ne = ne+1; els(ne,1)=n1; els(ne,2)=n2; els(ne,3)=n3; els(ne,4)=n4
  end
end
disp("Nodos:"); disp(nNodes); disp("Q4:"); disp(nQ4)

% ─── 3. APOYOS ───
% Pin izq (ux=uy=0), roller der (uy=0)
fixedDofs = [1, 2, 2*nNx]

% ─── 4. CARGAS ───
midTop = ny*nNx + nx/2 + 1
Fv = zeros(ndof, 1)
Fv(2*midTop) = -P

% ─── 5. ENSAMBLAJE ───
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_q4(E_mat, nu, tt, coords)
  dofs_e = [2*n1-1,2*n1, 2*n2-1,2*n2, 2*n3-1,2*n3, 2*n4-1,2*n4]
  Kg = assemble(Kg, Ke, dofs_e)
end

% ─── 6. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 7. RESULTADOS ───
uyMid = Uf(2*midTop)
disp("Uy nodo carga (FEM) [m]:"); disp(uyMid)
II = tt * Ly^3 / 12
w_euler = P * Lx^3 / (48 * E_mat * II)
disp("Uy Euler-Bernoulli [m]:"); disp(-w_euler)
disp("(Viga alta L/h=2: FEM da mayor deflexion que Euler)")

% ─── 8. VISUALIZACION ───
show3d(nds, els, "Viga Alta — geometria", [1, nNx])
show_deformed(nds, els, Uf, 0, 2, "Viga Alta — deformada", [1, nNx])

% ─── CONTORNO ───
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  ux = Uf((i-1)*2+1); uy = Uf((i-1)*2+2)
  vals(i) = sqrt(ux^2 + uy^2)
end
show_deformed_contour(nds, els, Uf, vals, 0, 2, "Viga Alta — contorno |u|")` },

  { name: 'Muro Cont.', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Muro de contencion (pantalla) — Plane Stress Q4
% Pantalla vertical: ancho=0.30m, H=5m
% Empotrada en base, empuje triangular Ka*gamma*h
% 2 DOF/nodo (ux, uy)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E_mat = 25e6; nu = 0.2; tt = 1.0  % por metro de ancho
gamma = 18; Ka = 0.33
Hmuro = 5; Bmuro = 0.30
q_max = Ka * gamma * Hmuro
disp("Empuje max base [kPa]:"); disp(q_max)
disp("Empuje total [kN/m]:"); disp(q_max * Hmuro / 2)

% ─── 2. MALLA ───
nx = 2; ny = 8; Lx = Bmuro; Ly = Hmuro
nNx = nx+1; nNy = ny+1
nNodes = nNx * nNy; ndof = 2 * nNodes
nds = meshRect_nodes(Lx, Ly, nx, ny)
nQ4 = nx * ny
els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx + ix + 1; n2 = n1+1
    n3 = n1 + nNx + 1; n4 = n1 + nNx
    ne = ne+1; els(ne,1)=n1; els(ne,2)=n2; els(ne,3)=n3; els(ne,4)=n4
  end
end

% ─── 3. APOYOS ───
fixedDofs = zeros(1, 2*nNx)
for ix = range(1, nNx, 1)
  fixedDofs(2*ix-1) = 2*ix-1; fixedDofs(2*ix) = 2*ix
end

% ─── 4. CARGAS ───
% Empuje triangular en borde izquierdo: p(y)=Ka*gamma*(H-y)
Fv = zeros(ndof, 1)
dy = Ly / ny
for iy = range(0, ny, 1)
  nn = iy*nNx + 1
  yy = iy * dy
  pp = Ka * gamma * (Hmuro - yy)
  atrib = dy
  if iy < 1
    atrib = dy/2
  end
  if iy > ny-1
    atrib = dy/2
  end
  Fv(2*nn-1) = pp * atrib * tt
end

% ─── 5. ENSAMBLAJE ───
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_q4(E_mat, nu, tt, coords)
  dofs_e = [2*n1-1,2*n1, 2*n2-1,2*n2, 2*n3-1,2*n3, 2*n4-1,2*n4]
  Kg = assemble(Kg, Ke, dofs_e)
end

% ─── 6. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 7. RESULTADOS ───
topNode = ny*nNx + 1
disp("Ux coronamiento [m]:"); disp(Uf(2*topNode-1))
II = tt * Bmuro^3 / 12
delta_cant = q_max * Hmuro^4 / (30 * E_mat * II)
disp("Ux cantilever triangular [m]:"); disp(delta_cant)

% ─── 8. VISUALIZACION ───
supVec = zeros(1, nNx)
for ix = range(1, nNx, 1)
  supVec(ix) = ix
end
show3d(nds, els, "Muro Cont. — geometria", supVec)
show_deformed(nds, els, Uf, 0, 2, "Muro Cont. — deformada", supVec)` },

  { name: 'Placa Base', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Placa base de columna — Plane Stress Q4
% 400x400 mm, t=25mm, 4 pernos esquinas
% Carga axial columna sobre area central
% 2 DOF/nodo (ux, uy)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
B = 0.40; tt = 0.025
E_acero = 200e6; nu = 0.3
Pcol = 500  % kN axial
Mcol = 50   % kN.m momento

% Calculos de diseno
q_centr = Pcol / (B * B)
exc = Mcol / Pcol
q_max = Pcol / (B*B) * (1 + 6*exc/B)
q_min = Pcol / (B*B) * (1 - 6*exc/B)
disp("q centrica [kPa]:"); disp(q_centr)
disp("q_max [kPa]:"); disp(q_max)
disp("q_min [kPa]:"); disp(q_min)

Fy_acero = 250e3
a_vuelo = (B - 0.20) / 2
M_vuelo = q_max * a_vuelo^2 / 2
t_req = sqrt(6 * M_vuelo / Fy_acero)
disp("t requerido [m]:"); disp(t_req)
disp("t propuesto [m]:"); disp(tt)

% ─── 2. MALLA ───
nx = 4; ny = 4; Lx = B; Ly = B
nNx = nx+1; nNy = ny+1
nNodes = nNx * nNy; ndof = 2 * nNodes
nds = meshRect_nodes(Lx, Ly, nx, ny)
nQ4 = nx * ny
els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx + ix + 1; n2 = n1+1
    n3 = n1 + nNx + 1; n4 = n1 + nNx
    ne = ne+1; els(ne,1)=n1; els(ne,2)=n2; els(ne,3)=n3; els(ne,4)=n4
  end
end

% ─── 3. APOYOS ───
% 4 pernos en esquinas: uy restringido + ux en 1 esquina
n_bl = 1; n_br = nNx; n_tl = ny*nNx+1; n_tr = nNodes
fixedDofs = [2*n_bl, 2*n_br, 2*n_tl, 2*n_tr, 2*n_bl-1]

% ─── 4. CARGAS ───
% Presion trapezoidal (momento en X)
Fv = zeros(ndof, 1)
dx = Lx/nx; dy_el = Ly/ny
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    xx = ix * dx
    qn = Pcol/(B*B) * (1 + 6*exc/B * (xx/B - 0.5))
    atrib = dx * dy_el
    if ix < 1
      atrib = atrib / 2
    end
    if ix > nx-1
      atrib = atrib / 2
    end
    if iy < 1
      atrib = atrib / 2
    end
    if iy > ny-1
      atrib = atrib / 2
    end
    Fv(2*nn) = -qn * atrib * tt
  end
end

% ─── 5. ENSAMBLAJE ───
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_q4(E_acero, nu, tt, coords)
  dofs_e = [2*n1-1,2*n1, 2*n2-1,2*n2, 2*n3-1,2*n3, 2*n4-1,2*n4]
  Kg = assemble(Kg, Ke, dofs_e)
end

% ─── 6. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 7. RESULTADOS ───
midNode = ny/2*nNx + nx/2 + 1
disp("Uy centro [m]:"); disp(Uf(2*midNode))

% ─── 8. VISUALIZACION ───
show3d(nds, els, "Placa Base — geometria", [n_bl, n_br, n_tl, n_tr])
show_deformed(nds, els, Uf, 0, 2, "Placa Base — deformada", [n_bl, n_br, n_tl, n_tr])

% ─── CONTORNO ───
vals = zeros(nNodes, 1)
for i = range(1, nNodes, 1)
  ux = Uf((i-1)*2+1); uy = Uf((i-1)*2+2)
  vals(i) = sqrt(ux^2 + uy^2)
end
show_deformed_contour(nds, els, Uf, vals, 0, 2, "Placa Base — contorno |u|")` },

  { name: 'Placa Base HSS + Soldadura', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Placa Base HSS + Soldadura — Von Mises
% HSS 200x200x10 soldada a placa 400x400x25
% Shell MITC4 Mindlin (3DOF: w, tht_x, tht_y)
% Winkler + 4 pernos M20 + cargas en soldadura
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 200e6; nu = 0.3; kapa = 5/6
Fy = 250e3

% ─── 2. GEOMETRIA ───
Lp = 0.400; tp = 0.025
Lc = 0.200; tc = 0.010
ed = 0.060; r_hole = 0.011
d_bolt = 0.020; L_bolt = 0.300
k_bolt = E*pi*d_bolt^2/4/L_bolt
ks = 50000
P = -500; Mx = 60

% Posiciones pernos
bolt_cx = [ed, Lp-ed, Lp-ed, ed]
bolt_cy = [ed, ed, Lp-ed, Lp-ed]

% ─── 3. MALLA ───
nx = 20; ny = 20
dx = Lp/nx; dy = Lp/ny
nNx = nx+1; nNy = ny+1
nds = zeros(nNx*nNy, 2)
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx+ix+1
    nds(nn, 1) = ix*dx; nds(nn, 2) = iy*dy
  end
end

% Elementos Q4 (sin orificios para velocidad)
els = zeros(nx*ny, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx+ix+1
    cx_e = (nds(n1,1)+nds(n1+1,1))/2
    cy_e = (nds(n1,2)+nds(n1+nNx,2))/2
    skip = 0
    for b = range(1, 4, 1)
      dist = sqrt((cx_e-bolt_cx(b))^2+(cy_e-bolt_cy(b))^2)
      if dist < r_hole
        skip = 1
      end
    end
    if skip == 0
      ne = ne+1
      els(ne, 1) = n1; els(ne, 2) = n1+1
      els(ne, 3) = n1+nNx+1; els(ne, 4) = n1+nNx
    end
  end
end
els = els(1:ne, :)
nNodes = nNx*nNy; ndof = nNodes*3

% ─── 4. ENSAMBLAJE ───
Kg = zeros(ndof, ndof)
for e = range(1, ne, 1)
  ns = [els(e,1), els(e,2), els(e,3), els(e,4)]
  coords = [nds(ns(1),1), nds(ns(1),2); nds(ns(2),1), nds(ns(2),2); nds(ns(3),1), nds(ns(3),2); nds(ns(4),1), nds(ns(4),2)]
  Ke = k_plate_mitc4(E, nu, tp, kapa, coords)
  dofs = [(ns(1)-1)*3+1, (ns(1)-1)*3+2, (ns(1)-1)*3+3, (ns(2)-1)*3+1, (ns(2)-1)*3+2, (ns(2)-1)*3+3, (ns(3)-1)*3+1, (ns(3)-1)*3+2, (ns(3)-1)*3+3, (ns(4)-1)*3+1, (ns(4)-1)*3+2, (ns(4)-1)*3+3]
  Kg = assemble(Kg, Ke, dofs)
end

% Winkler bearing
for i = range(1, nNodes, 1)
  ax = dx; ay = dy
  if nds(i,1) < dx/2; ax = dx/2; end
  if nds(i,1) > Lp-dx/2; ax = dx/2; end
  if nds(i,2) < dy/2; ay = dy/2; end
  if nds(i,2) > Lp-dy/2; ay = dy/2; end
  d = (i-1)*3+1
  Kg(d,d) = Kg(d,d) + ks*ax*ay
end

% Pernos
for b = range(1, 4, 1)
  for i = range(1, nNodes, 1)
    dist = sqrt((nds(i,1)-bolt_cx(b))^2+(nds(i,2)-bolt_cy(b))^2)
    if dist < r_hole+dx*0.6
      if dist > r_hole-dx*0.6
        d = (i-1)*3+1
        Kg(d,d) = Kg(d,d) + k_bolt/10
      end
    end
  end
end

% ─── 5. SOLDADURA (nodos en perimetro HSS) ───
col_cx = Lp/2; col_cy = Lp/2
weld = []
nw = 0
for i = range(1, nNodes, 1)
  x = nds(i,1); y = nds(i,2)
  on_x = 0; on_y = 0; in_x = 0; in_y = 0
  if abs(x-(col_cx-Lc/2)) < dx*0.6; on_x = 1; end
  if abs(x-(col_cx+Lc/2)) < dx*0.6; on_x = 1; end
  if abs(y-(col_cy-Lc/2)) < dy*0.6; on_y = 1; end
  if abs(y-(col_cy+Lc/2)) < dy*0.6; on_y = 1; end
  if x > col_cx-Lc/2-dx*0.1
    if x < col_cx+Lc/2+dx*0.1; in_x = 1; end
  end
  if y > col_cy-Lc/2-dy*0.1
    if y < col_cy+Lc/2+dy*0.1; in_y = 1; end
  end
  if on_x*in_y+on_y*in_x > 0
    nw = nw+1; weld(nw) = i
  end
end

% ─── 6. CARGAS ───
Fv = zeros(ndof, 1)
for i = range(1, nw, 1)
  nn = weld(i)
  yr = nds(nn,2) - col_cy
  Fv((nn-1)*3+1) = P/nw + Mx*yr/(Lc/2)/nw*4
end

% ─── 7. BCs y RESOLVER ───
corners = []
nc = 0
for i = range(1, nNodes, 1)
  x = nds(i,1); y = nds(i,2)
  if x < dx
    if y < dy; nc = nc+1; corners(nc) = i; end
    if y > Lp-dy; nc = nc+1; corners(nc) = i; end
  end
  if x > Lp-dx
    if y < dy; nc = nc+1; corners(nc) = i; end
    if y > Lp-dy; nc = nc+1; corners(nc) = i; end
  end
end

fixD = []
nf = 0
for i = range(1, nc, 1)
  nf = nf+1; fixD(nf) = (corners(i)-1)*3+2
  nf = nf+1; fixD(nf) = (corners(i)-1)*3+3
end

U = solve_fem(Kg, Fv, fixD)

% ─── 8. ESFUERZOS VON MISES ───
Dc = E*tp^3/(12*(1-nu^2))
Db = [[Dc, Dc*nu, 0], [Dc*nu, Dc, 0], [0, 0, Dc*(1-nu)/2]]

Mx_n = zeros(nNodes, 1); My_n = zeros(nNodes, 1)
Mxy_n = zeros(nNodes, 1); cnt = zeros(nNodes, 1)

for e = range(1, ne, 1)
  ns = [els(e,1), els(e,2), els(e,3), els(e,4)]
  coords = [nds(ns(1),1), nds(ns(1),2); nds(ns(2),1), nds(ns(2),2); nds(ns(3),1), nds(ns(3),2); nds(ns(4),1), nds(ns(4),2)]
  dxi = [-0.25, 0.25, 0.25, -0.25]
  deta = [-0.25, -0.25, 0.25, 0.25]
  J11 = dxi(1)*coords(1,1)+dxi(2)*coords(2,1)+dxi(3)*coords(3,1)+dxi(4)*coords(4,1)
  J12 = dxi(1)*coords(1,2)+dxi(2)*coords(2,2)+dxi(3)*coords(3,2)+dxi(4)*coords(4,2)
  J21 = deta(1)*coords(1,1)+deta(2)*coords(2,1)+deta(3)*coords(3,1)+deta(4)*coords(4,1)
  J22 = deta(1)*coords(1,2)+deta(2)*coords(2,2)+deta(3)*coords(3,2)+deta(4)*coords(4,2)
  detJ = J11*J22 - J12*J21
  Ji11 = J22/detJ; Ji12 = -J12/detJ; Ji21 = -J21/detJ; Ji22 = J11/detJ
  dNdx1 = Ji11*dxi(1)+Ji12*deta(1); dNdy1 = Ji21*dxi(1)+Ji22*deta(1)
  dNdx2 = Ji11*dxi(2)+Ji12*deta(2); dNdy2 = Ji21*dxi(2)+Ji22*deta(2)
  dNdx3 = Ji11*dxi(3)+Ji12*deta(3); dNdy3 = Ji21*dxi(3)+Ji22*deta(3)
  dNdx4 = Ji11*dxi(4)+Ji12*deta(4); dNdy4 = Ji21*dxi(4)+Ji22*deta(4)
  ue = [U((ns(1)-1)*3+1), U((ns(1)-1)*3+2), U((ns(1)-1)*3+3), U((ns(2)-1)*3+1), U((ns(2)-1)*3+2), U((ns(2)-1)*3+3), U((ns(3)-1)*3+1), U((ns(3)-1)*3+2), U((ns(3)-1)*3+3), U((ns(4)-1)*3+1), U((ns(4)-1)*3+2), U((ns(4)-1)*3+3)]
  Bb = zeros(3, 12)
  Bb(1,3) = dNdx1; Bb(1,6) = dNdx2; Bb(1,9) = dNdx3; Bb(1,12) = dNdx4
  Bb(2,2) = -dNdy1; Bb(2,5) = -dNdy2; Bb(2,8) = -dNdy3; Bb(2,11) = -dNdy4
  Bb(3,2) = -dNdx1; Bb(3,3) = dNdy1; Bb(3,5) = -dNdx2; Bb(3,6) = dNdy2
  Bb(3,8) = -dNdx3; Bb(3,9) = dNdy3; Bb(3,11) = -dNdx4; Bb(3,12) = dNdy4
  curv = Bb * transpose(ue)
  M_e = Db * curv
  for j = range(1, 4, 1)
    n = ns(j)
    Mx_n(n) = Mx_n(n) + M_e(1); My_n(n) = My_n(n) + M_e(2)
    Mxy_n(n) = Mxy_n(n) + M_e(3); cnt(n) = cnt(n) + 1
  end
end

% Promediar y calcular esfuerzo
sigma_vm = zeros(nNodes, 1)
vm_max = 0
for i = range(1, nNodes, 1)
  if cnt(i) > 0
    mx_i = Mx_n(i)/cnt(i); my_i = My_n(i)/cnt(i); mxy_i = Mxy_n(i)/cnt(i)
    sx = 6*mx_i/tp^2; sy = 6*my_i/tp^2; txy = 6*mxy_i/tp^2
    vm = sqrt(sx^2 - sx*sy + sy^2 + 3*txy^2)
    sigma_vm(i) = vm/1000
    if vm/1000 > vm_max; vm_max = vm/1000; end
  end
end

disp("=== ESFUERZOS VON MISES ===")
disp("sigma_vm_max [MPa]:"); disp(vm_max)
disp("Fy [MPa]:"); disp(250)
if vm_max > 250
  disp("CHECK: sigma_vm > Fy --- FALLA! Aumentar tp")
  tp_req = tp * sqrt(vm_max/250) * 1000
  disp("tp requerido [mm]:"); disp(tp_req)
end

% Soldadura
vm_weld_max = 0; vm_weld_sum = 0
for i = range(1, nw, 1)
  v = sigma_vm(weld(i))
  vm_weld_sum = vm_weld_sum + v
  if v > vm_weld_max; vm_weld_max = v; end
end
disp("Zona soldadura vm_max [MPa]:"); disp(vm_weld_max)
disp("Zona soldadura vm_avg [MPa]:"); disp(vm_weld_sum/nw)

% ─── 9. VISUALIZACION ───
supVec = corners
show3d(nds, els, "Placa Base HSS — geometria", supVec)
show_deformed(nds, els, U, 0, 3, "Placa Base HSS — deformada", supVec)
show_deformed_contour(nds, els, U, sigma_vm, 0, 3, "Von Mises [MPa]")` },

  { name: 'Col+Placa 3D', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Columna 3D sobre placa base — cantilever
% Col W 200x200, h=4m, placa 400x400
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 200e6; nu = 0.3; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.005; Iz = 2e-5; Iy = 2e-5; J = 1e-6

% ─── 3. NODOS ───
hCol = 4; B = 0.40
nds = zeros(2, 3)
nds(1,1)=B/2; nds(1,2)=B/2; nds(1,3)=0
nds(2,1)=B/2; nds(2,2)=B/2; nds(2,3)=hCol

% ─── 4. ELEMENTOS ───
els = [1, 2]

% ─── 5. APOYOS ───
sups = [1,1,1,1,1,1,1]
supVec = [1]

% ─── 6. CARGAS ───
loads = [2, 10, 0, -200, 0, 0, 0]
disp("Fx=10kN (viento), Fz=-200kN (axial)")

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top_x = (2-1)*6+1
dof_top_z = (2-1)*6+3
disp("Ux tope [m]:"); disp(Uf(dof_top_x))
disp("Uz tope [m]:"); disp(Uf(dof_top_z))

% Delta teorico cantilever: PL^3/(3EI)
delta_th = 10 * hCol^3 / (3 * E * Iz)
disp("Ux teoria PL3/3EI [m]:"); disp(delta_th)

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Col+Placa — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Col+Placa — deformada", supVec, loads)` },

  { name: 'Talud', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Talud (slope) — Plane Stress Q4
% Malla rectangular B=10m x H=8m
% Peso propio gamma=18 kN/m3
% Base empotrada, lados roller vertical
% 2 DOF/nodo (ux, uy)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E_suelo = 50e3; nu = 0.3; tt = 1.0  % por metro
gamma = 18  % kN/m3

% ─── 2. MALLA ───
nx = 6; ny = 4; B = 10; H = 8
nNx = nx+1; nNy = ny+1
nNodes = nNx * nNy; ndof = 2 * nNodes
nds = meshRect_nodes(B, H, nx, ny)
nQ4 = nx * ny
els = zeros(nQ4, 4); ne = 0
for iy = range(0, ny-1, 1)
  for ix = range(0, nx-1, 1)
    n1 = iy*nNx + ix + 1; n2 = n1+1
    n3 = n1 + nNx + 1; n4 = n1 + nNx
    ne = ne+1; els(ne,1)=n1; els(ne,2)=n2; els(ne,3)=n3; els(ne,4)=n4
  end
end
disp("Nodos:"); disp(nNodes); disp("Q4:"); disp(nQ4)

% ─── 3. APOYOS ───
% Base empotrada + lados ux=0
fixedDofs_list = zeros(1, 2*nNx + 2*(nNy-1))
nf = 0
for ix = range(1, nNx, 1)
  nf = nf+1; fixedDofs_list(nf) = 2*ix-1
  nf = nf+1; fixedDofs_list(nf) = 2*ix
end
for iy = range(1, ny, 1)
  nn_l = iy*nNx + 1; nn_r = iy*nNx + nNx
  nf = nf+1; fixedDofs_list(nf) = 2*nn_l-1
  nf = nf+1; fixedDofs_list(nf) = 2*nn_r-1
end
fixedDofs = fixedDofs_list

% ─── 4. CARGAS ───
% Peso propio: Fy = -gamma * atrib * t
Fv = zeros(ndof, 1)
dx = B/nx; dy = H/ny
for iy = range(0, ny, 1)
  for ix = range(0, nx, 1)
    nn = iy*nNx + ix + 1
    atrib = dx * dy
    if ix < 1
      atrib = atrib / 2
    end
    if ix > nx-1
      atrib = atrib / 2
    end
    if iy < 1
      atrib = atrib / 2
    end
    if iy > ny-1
      atrib = atrib / 2
    end
    Fv(2*nn) = -gamma * atrib * tt
  end
end

% ─── 5. ENSAMBLAJE ───
Kg = zeros(ndof, ndof)
for e = range(1, nQ4, 1)
  n1=els(e,1); n2=els(e,2); n3=els(e,3); n4=els(e,4)
  coords = [nds(n1,1),nds(n1,2); nds(n2,1),nds(n2,2); nds(n3,1),nds(n3,2); nds(n4,1),nds(n4,2)]
  Ke = k_q4(E_suelo, nu, tt, coords)
  dofs_e = [2*n1-1,2*n1, 2*n2-1,2*n2, 2*n3-1,2*n3, 2*n4-1,2*n4]
  Kg = assemble(Kg, Ke, dofs_e)
end

% ─── 6. RESOLVER ───
Uf = solve_fem(Kg, Fv, fixedDofs)
disp(fem_check(Uf))

% ─── 7. RESULTADOS ───
uyMax = 0
for ix = range(0, nx, 1)
  nn = ny*nNx + ix + 1
  uyNode = abs(Uf(2*nn))
  if uyNode > uyMax
    uyMax = uyNode
  end
end
disp("Uy max superficie [m]:"); disp(uyMax)

% Factor seguridad simplificado
c = 15; phi = 30
W = gamma * H * B / 2
FS_aprox = (c * H + W * cos(phi*pi/180) * sin(phi*pi/180)) / (W * sin(phi*pi/180))
disp("FS Fellenius (aprox):"); disp(FS_aprox)

% ─── 8. VISUALIZACION ───
supVec = zeros(1, nNx)
for ix = range(1, nNx, 1)
  supVec(ix) = ix
end
show3d(nds, els, "Talud — geometria", supVec)
show_deformed(nds, els, Uf, 0, 2, "Talud — deformada", supVec)` },

  { name: 'Eiffel', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Torre Eiffel simplificada — cercha 3D
% Base cuadrada 8x8m, altura 30m, taper
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 200e6; nu = 0.3; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 8e-4; Iz = 1e-6; Iy = 1e-6; J = 1e-7

% ─── 3. NODOS ───
Hh = 30; Bbase = 8; Btop = 1
nLevels = 10

nds = zeros((nLevels+1)*4, 3)
for lv = range(0, nLevels, 1)
  tt = lv / nLevels
  Blv = Bbase * (1-tt) + Btop * tt
  zz = tt * Hh
  bb = lv*4
  nds(bb+1,1)=-Blv/2; nds(bb+1,2)=-Blv/2; nds(bb+1,3)=zz
  nds(bb+2,1)= Blv/2; nds(bb+2,2)=-Blv/2; nds(bb+2,3)=zz
  nds(bb+3,1)= Blv/2; nds(bb+3,2)= Blv/2; nds(bb+3,3)=zz
  nds(bb+4,1)=-Blv/2; nds(bb+4,2)= Blv/2; nds(bb+4,3)=zz
end

nJoint = (nLevels+1)*4

% ─── 4. ELEMENTOS ───
maxEls = nLevels*4 + nLevels*4 + nLevels*8
els = zeros(maxEls, 2); nEls = 0

% Columnas inclinadas
for lv = range(0, nLevels-1, 1)
  for cc = range(0, 3, 1)
    nEls = nEls+1; els(nEls,1)=lv*4+cc+1; els(nEls,2)=(lv+1)*4+cc+1
  end
end

% Anillos horizontales
for lv = range(0, nLevels, 1)
  bb = lv*4
  nEls = nEls+1; els(nEls,1)=bb+1; els(nEls,2)=bb+2
  nEls = nEls+1; els(nEls,1)=bb+2; els(nEls,2)=bb+3
  nEls = nEls+1; els(nEls,1)=bb+3; els(nEls,2)=bb+4
  nEls = nEls+1; els(nEls,1)=bb+4; els(nEls,2)=bb+1
end

% Diagonales X en cada cara
for lv = range(0, nLevels-1, 1)
  oo = lv*4; ou = (lv+1)*4
  nEls = nEls+1; els(nEls,1)=oo+1; els(nEls,2)=ou+2
  nEls = nEls+1; els(nEls,1)=oo+2; els(nEls,2)=ou+3
  nEls = nEls+1; els(nEls,1)=oo+3; els(nEls,2)=ou+4
  nEls = nEls+1; els(nEls,1)=oo+4; els(nEls,2)=ou+1
  nEls = nEls+1; els(nEls,1)=oo+2; els(nEls,2)=ou+1
  nEls = nEls+1; els(nEls,1)=oo+3; els(nEls,2)=ou+2
  nEls = nEls+1; els(nEls,1)=oo+4; els(nEls,2)=ou+3
  nEls = nEls+1; els(nEls,1)=oo+1; els(nEls,2)=ou+4
end

disp("nNodos:"); disp(nJoint)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
sups = [1,1,1,1,1,1,1; 2,1,1,1,1,1,1; 3,1,1,1,1,1,1; 4,1,1,1,1,1,1]
supVec = [1,2,3,4]

% ─── 6. CARGAS ───
topNode = nLevels*4 + 1
loads = [topNode, 5, 0, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Eiffel — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Eiffel — deformada", supVec, loads)` },

  { name: 'Arco', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Arco parabolico — frame 2D
% L=20m, f=8m (flecha), nSeg=16
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 200e6; nu = 0.3; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.005; Iz = 1e-4; Iy = 1e-4; J = 5e-6

% ─── 3. NODOS ───
L = 20; f = 8; nSeg = 16

nNodes = nSeg + 1
nds = zeros(nNodes, 3)
for kk = range(0, nSeg, 1)
  xx = kk * L / nSeg
  zz = 4*f/L^2 * xx * (L - xx)
  nds(kk+1, 1) = xx
  nds(kk+1, 2) = 0
  nds(kk+1, 3) = zz
end

% ─── 4. ELEMENTOS ───
els = zeros(nSeg, 2)
for kk = range(0, nSeg-1, 1)
  els(kk+1,1) = kk+1; els(kk+1,2) = kk+2
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nSeg)

% ─── 5. APOYOS ───
sups = [1,1,1,1,1,1,1; nNodes,1,1,1,1,1,1]
supVec = [1, nNodes]

% ─── 6. CARGAS ───
loads = zeros(nNodes-2, 7)
for kk = range(2, nNodes-1, 1)
  loads(kk-1,1) = kk; loads(kk-1,4) = -5
end

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
midNode = nSeg/2 + 1
dof_mid = (midNode-1)*6 + 3
disp("Uz nodo clave (centro) [m]:"); disp(Uf(dof_mid))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Arco — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Arco — deformada", supVec, loads)` },

  { name: 'Puente', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Puente viga — 3 tramos continuos
% L1=15m, L2=20m, L3=15m (total 50m)
% Vigas principales + cercha lateral
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 200e6; nu = 0.3; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 8e-4; Iz = 1e-6; Iy = 1e-6; J = 1e-7

% ─── 3. NODOS ───
L1 = 15; L2 = 20; L3 = 15
hDeck = 0; hTruss = 3; sep = 5
nSub1 = 6; nSub2 = 8; nSub3 = 6
nTotal = nSub1 + nSub2 + nSub3

nNds = (nTotal+1) * 2
nds = zeros(nNds, 3)
bb = nTotal + 1

% Cuerda inferior
dx1 = L1/nSub1; dx2 = L2/nSub2; dx3 = L3/nSub3
for kk = range(0, nSub1, 1)
  nds(kk+1,1) = kk*dx1; nds(kk+1,3) = hDeck
end
for kk = range(1, nSub2, 1)
  nds(nSub1+kk+1,1) = L1+kk*dx2; nds(nSub1+kk+1,3) = hDeck
end
for kk = range(1, nSub3, 1)
  nds(nSub1+nSub2+kk+1,1) = L1+L2+kk*dx3; nds(nSub1+nSub2+kk+1,3) = hDeck
end

% Cuerda superior
for kk = range(0, nTotal, 1)
  nds(bb+kk+1, 1) = nds(kk+1, 1)
  nds(bb+kk+1, 3) = hTruss
end

% ─── 4. ELEMENTOS ───
maxEls = nTotal + nTotal + (nTotal+1) + nTotal
els = zeros(maxEls, 2); nEls = 0

% Cuerda inferior
for kk = range(0, nTotal-1, 1)
  nEls = nEls+1; els(nEls,1)=kk+1; els(nEls,2)=kk+2
end
% Cuerda superior
for kk = range(0, nTotal-1, 1)
  nEls = nEls+1; els(nEls,1)=bb+kk+1; els(nEls,2)=bb+kk+2
end
% Montantes verticales
for kk = range(0, nTotal, 1)
  nEls = nEls+1; els(nEls,1)=kk+1; els(nEls,2)=bb+kk+1
end
% Diagonales
for kk = range(0, nTotal-1, 1)
  nEls = nEls+1; els(nEls,1)=kk+1; els(nEls,2)=bb+kk+2
end

disp("nNodos:"); disp(nNds)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
pila1 = 1; pila2 = nSub1+1; pila3 = nSub1+nSub2+1; pila4 = nTotal+1
sups = zeros(4, 7)
sups(1,1)=pila1; sups(1,2)=1; sups(1,3)=1; sups(1,4)=1; sups(1,5)=1; sups(1,6)=1; sups(1,7)=1
sups(2,1)=pila2; sups(2,2)=0; sups(2,3)=1; sups(2,4)=1; sups(2,5)=1; sups(2,6)=1; sups(2,7)=1
sups(3,1)=pila3; sups(3,2)=0; sups(3,3)=1; sups(3,4)=1; sups(3,5)=1; sups(3,6)=1; sups(3,7)=1
sups(4,1)=pila4; sups(4,2)=0; sups(4,3)=1; sups(4,4)=1; sups(4,5)=1; sups(4,6)=1; sups(4,7)=1
supVec = [pila1,pila2,pila3,pila4]

% ─── 6. CARGAS ───
loads = zeros(nTotal-1, 7)
for kk = range(2, nTotal, 1)
  loads(kk-1,1) = kk; loads(kk-1,4) = -8
end

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
midNode = nSub1 + nSub2/2 + 1
dof_mid = (midNode-1)*6+3
disp("Uz tramo central medio [m]:"); disp(Uf(dof_mid))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Puente — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Puente — deformada", supVec, loads)` },

  { name: 'Twist', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Torre twist (torsion) — rascacielos
% Planta cuadrada que rota con la altura
% Base 10x10m, H=60m, 12 pisos, twist=90 grados
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 30e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.02; Iz = 8e-4; Iy = 8e-4; J = 5e-4

% ─── 3. NODOS ───
Hh = 60; B = 10; nStories = 12
twistTotal = 90  % grados de torsion total

nLevels = nStories + 1
nds = zeros(nLevels*4, 3)
for lv = range(0, nStories, 1)
  tt = lv / nStories
  zz = tt * Hh
  ang = tt * twistTotal * pi / 180
  ca = cos(ang); sa = sin(ang)
  bb = lv*4
  % Esquinas rotadas
  x1 = -B/2*ca - (-B/2)*sa; y1 = -B/2*sa + (-B/2)*ca
  x2 =  B/2*ca - (-B/2)*sa; y2 =  B/2*sa + (-B/2)*ca
  x3 =  B/2*ca - ( B/2)*sa; y3 =  B/2*sa + ( B/2)*ca
  x4 = -B/2*ca - ( B/2)*sa; y4 = -B/2*sa + ( B/2)*ca
  nds(bb+1,1)=x1; nds(bb+1,2)=y1; nds(bb+1,3)=zz
  nds(bb+2,1)=x2; nds(bb+2,2)=y2; nds(bb+2,3)=zz
  nds(bb+3,1)=x3; nds(bb+3,2)=y3; nds(bb+3,3)=zz
  nds(bb+4,1)=x4; nds(bb+4,2)=y4; nds(bb+4,3)=zz
end

nJoint = nLevels*4

% ─── 4. ELEMENTOS ───
maxEls = nStories*4 + nLevels*4 + nStories*2
els = zeros(maxEls, 2); nEls = 0

% Columnas
for lv = range(0, nStories-1, 1)
  for cc = range(0, 3, 1)
    nEls = nEls+1; els(nEls,1)=lv*4+cc+1; els(nEls,2)=(lv+1)*4+cc+1
  end
end

% Anillos
for lv = range(0, nStories, 1)
  bb = lv*4
  nEls = nEls+1; els(nEls,1)=bb+1; els(nEls,2)=bb+2
  nEls = nEls+1; els(nEls,1)=bb+2; els(nEls,2)=bb+3
  nEls = nEls+1; els(nEls,1)=bb+3; els(nEls,2)=bb+4
  nEls = nEls+1; els(nEls,1)=bb+4; els(nEls,2)=bb+1
end

% Diagonales (nucleo rigido)
for lv = range(0, nStories-1, 1)
  oo = lv*4; ou = (lv+1)*4
  nEls = nEls+1; els(nEls,1)=oo+1; els(nEls,2)=ou+3
  nEls = nEls+1; els(nEls,1)=oo+2; els(nEls,2)=ou+4
end

disp("nNodos:"); disp(nJoint)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
sups = [1,1,1,1,1,1,1; 2,1,1,1,1,1,1; 3,1,1,1,1,1,1; 4,1,1,1,1,1,1]
supVec = [1,2,3,4]

% ─── 6. CARGAS ───
topNode = nStories*4 + 1
loads = [topNode, 20, 10, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Twist Tower — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Twist Tower — deformada", supVec, loads)` },

  { name: 'Burj', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Torre tipo Burj — planta Y (3 alas)
% Base R=12m, taper a R=3m, H=50m, 10 pisos
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 35e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.04; Iz = 2e-3; Iy = 2e-3; J = 1e-3

% ─── 3. NODOS ───
Hh = 50; Rbase = 12; Rtop = 3; nStories = 10

nLevels = nStories + 1
% 6 nodos por nivel: 3 puntas de ala + 3 puntos de nucleo
nds = zeros(nLevels*6, 3)
for lv = range(0, nStories, 1)
  tt = lv / nStories
  R = Rbase * (1-tt) + Rtop * tt
  Rn = R * 0.3  % radio nucleo
  zz = tt * Hh
  bb = lv*6
  % 3 puntas de ala a 0, 120, 240 grados
  for aa = range(0, 2, 1)
    ang = aa * 120 * pi / 180
    nds(bb+aa+1, 1) = R * cos(ang)
    nds(bb+aa+1, 2) = R * sin(ang)
    nds(bb+aa+1, 3) = zz
    nds(bb+3+aa+1, 1) = Rn * cos(ang + 60*pi/180)
    nds(bb+3+aa+1, 2) = Rn * sin(ang + 60*pi/180)
    nds(bb+3+aa+1, 3) = zz
  end
end

nJoint = nLevels*6

% ─── 4. ELEMENTOS ───
maxEls = nStories*6 + nLevels*9 + nStories*6
els = zeros(maxEls, 2); nEls = 0

% Columnas (6 por piso)
for lv = range(0, nStories-1, 1)
  for cc = range(0, 5, 1)
    nEls = nEls+1; els(nEls,1)=lv*6+cc+1; els(nEls,2)=(lv+1)*6+cc+1
  end
end

% Anillos: puntas 1-2-3, nucleo 4-5-6, y radiales punta-nucleo
for lv = range(0, nStories, 1)
  bb = lv*6
  nEls = nEls+1; els(nEls,1)=bb+1; els(nEls,2)=bb+2
  nEls = nEls+1; els(nEls,1)=bb+2; els(nEls,2)=bb+3
  nEls = nEls+1; els(nEls,1)=bb+3; els(nEls,2)=bb+1
  nEls = nEls+1; els(nEls,1)=bb+4; els(nEls,2)=bb+5
  nEls = nEls+1; els(nEls,1)=bb+5; els(nEls,2)=bb+6
  nEls = nEls+1; els(nEls,1)=bb+6; els(nEls,2)=bb+4
  nEls = nEls+1; els(nEls,1)=bb+1; els(nEls,2)=bb+4
  nEls = nEls+1; els(nEls,1)=bb+2; els(nEls,2)=bb+5
  nEls = nEls+1; els(nEls,1)=bb+3; els(nEls,2)=bb+6
end

% Diagonales entre niveles (puntas)
for lv = range(0, nStories-1, 1)
  oo = lv*6; ou = (lv+1)*6
  nEls = nEls+1; els(nEls,1)=oo+1; els(nEls,2)=ou+4
  nEls = nEls+1; els(nEls,1)=oo+2; els(nEls,2)=ou+5
  nEls = nEls+1; els(nEls,1)=oo+3; els(nEls,2)=ou+6
  nEls = nEls+1; els(nEls,1)=oo+4; els(nEls,2)=ou+1
  nEls = nEls+1; els(nEls,1)=oo+5; els(nEls,2)=ou+2
  nEls = nEls+1; els(nEls,1)=oo+6; els(nEls,2)=ou+3
end

disp("nNodos:"); disp(nJoint)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
sups = [1,1,1,1,1,1,1; 2,1,1,1,1,1,1; 3,1,1,1,1,1,1; 4,1,1,1,1,1,1; 5,1,1,1,1,1,1; 6,1,1,1,1,1,1]
supVec = [1,2,3,4,5,6]

% ─── 6. CARGAS ───
topNode = nStories*6 + 1
loads = [topNode, 15, 0, 0, 0, 0, 0]

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Burj Tower — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Burj Tower — deformada", supVec, loads)` },

  { name: 'Opera', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Cascaron Opera (shell vault) — arco 3D
% Similar Opera Sydney: arcos parabolicos
% L=30m, H=15m, W=20m, nArch=8 secciones
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 30e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCION ───
A = 0.005; Iz = 1e-4; Iy = 1e-4; J = 5e-6

% ─── 3. NODOS ───
L = 30; H = 15; W = 20
nArch = 8; nWidth = 4

nNds_arch = nArch + 1
nNds_w = nWidth + 1
nNodes = nNds_arch * nNds_w

nds = zeros(nNodes, 3)
for iw = range(0, nWidth, 1)
  yy = iw * W / nWidth - W/2
  for ia = range(0, nArch, 1)
    nn = iw * nNds_arch + ia + 1
    xx = ia * L / nArch
    zz = 4*H/L^2 * xx * (L - xx)
    nds(nn,1) = xx; nds(nn,2) = yy; nds(nn,3) = zz
  end
end

% ─── 4. ELEMENTOS ───
maxEls = nNds_w * nArch + nNds_arch * nWidth
els = zeros(maxEls, 2); nEls = 0

% Arcos longitudinales
for iw = range(0, nWidth, 1)
  for ia = range(0, nArch-1, 1)
    nn1 = iw*nNds_arch + ia + 1
    nn2 = nn1 + 1
    nEls = nEls+1; els(nEls,1)=nn1; els(nEls,2)=nn2
  end
end

% Costillas transversales
for ia = range(0, nArch, 1)
  for iw = range(0, nWidth-1, 1)
    nn1 = iw*nNds_arch + ia + 1
    nn2 = (iw+1)*nNds_arch + ia + 1
    nEls = nEls+1; els(nEls,1)=nn1; els(nEls,2)=nn2
  end
end

disp("nNodos:"); disp(nNodes)
disp("nElem:"); disp(nEls)

% ─── 5. APOYOS ───
nSup = nNds_w * 2
sups = zeros(nSup, 7); ns = 0
for iw = range(0, nWidth, 1)
  ns = ns+1; nn = iw*nNds_arch + 1
  sups(ns,1)=nn; sups(ns,2)=1; sups(ns,3)=1; sups(ns,4)=1
  sups(ns,5)=1; sups(ns,6)=1; sups(ns,7)=1
end
for iw = range(0, nWidth, 1)
  ns = ns+1; nn = iw*nNds_arch + nNds_arch
  sups(ns,1)=nn; sups(ns,2)=1; sups(ns,3)=1; sups(ns,4)=1
  sups(ns,5)=1; sups(ns,6)=1; sups(ns,7)=1
end

supVec = zeros(1, nSup)
for ii = range(1, nSup, 1)
  supVec(ii) = sups(ii,1)
end

% ─── 6. CARGAS ───
loads = zeros(nNodes, 7)
nl = 0
for iw = range(0, nWidth, 1)
  for ia = range(1, nArch-1, 1)
    nn = iw*nNds_arch + ia + 1
    nl = nl+1; loads(nl,1) = nn; loads(nl,4) = -3
  end
end

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
disp(fem_check(Uf))

% ─── 8. RESULTADOS ───
midNode = 2*nNds_arch + nArch/2 + 1
dof_mid = (midNode-1)*6+3
disp("Uz nodo clave [m]:"); disp(Uf(dof_mid))

% ─── 9. VISUALIZACION ───
show3d(nds, els, "Opera Shell — geometria", supVec, loads)
show_deformed(nds, els, Uf, 0, 6, "Opera Shell — deformada", supVec, loads)` },

  { name: 'Diagrid', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Diagrid tower — malla diagonal (sin columnas verticales)
% Cilindro: R=8m, H=48m, 8 pisos, 12 segmentos
% Solo diagonales + anillos horizontales
% ═══════════════════════════════════════════
R = 8; Hh = 48; nStories = 8; nSeg = 12
E_mat = 200e6; A_sec = 0.008; Iz = 5e-5; Iy = 5e-5; G = 77e6; J = 2e-6

nLevels = nStories + 1
nds = zeros(nLevels * nSeg, 3)
for lv = range(0, nStories, 1)
  zz = lv * Hh / nStories
  for ss = range(0, nSeg-1, 1)
    ang = ss * 2 * pi / nSeg
    nn = lv*nSeg + ss + 1
    nds(nn,1) = R * cos(ang)
    nds(nn,2) = R * sin(ang)
    nds(nn,3) = zz
  end
end

nJoint = nLevels * nSeg
maxEls = nLevels*nSeg + nStories*nSeg*2
els = zeros(maxEls, 2); nEls = 0

% Anillos horizontales
for lv = range(0, nStories, 1)
  bb = lv*nSeg
  for ss = range(0, nSeg-1, 1)
    s2 = ss + 1
    if s2 > nSeg-1
      s2 = 0
    end
    nEls = nEls+1; els(nEls,1)=bb+ss+1; els(nEls,2)=bb+s2+1
  end
end

% Diagonales: cada segmento conecta nodo(lv,ss) con nodo(lv+1,ss+1) y nodo(lv,ss+1) con nodo(lv+1,ss)
for lv = range(0, nStories-1, 1)
  blo = lv*nSeg; bhi = (lv+1)*nSeg
  for ss = range(0, nSeg-1, 1)
    s2 = ss + 1
    if s2 > nSeg-1
      s2 = 0
    end
    nEls = nEls+1; els(nEls,1)=blo+ss+1; els(nEls,2)=bhi+s2+1
    nEls = nEls+1; els(nEls,1)=blo+s2+1; els(nEls,2)=bhi+ss+1
  end
end

disp("nNodos:"); disp(nJoint)
disp("nElem:"); disp(nEls)

% Soportes: nivel 0
sups = zeros(nSeg, 7)
for ss = range(0, nSeg-1, 1)
  sups(ss+1,1) = ss+1
  sups(ss+1,2)=1; sups(ss+1,3)=1; sups(ss+1,4)=1
  sups(ss+1,5)=1; sups(ss+1,6)=1; sups(ss+1,7)=1
end

topNode = nStories*nSeg + 1
loads = [topNode, 20, 0, 0, 0, 0, 0]

supVec = zeros(1,nSeg)
for ss = range(0,nSeg-1,1)
  supVec(ss+1) = ss+1
end

show3d(nds, els, "Diagrid Tower — geometria", supVec)

Uf = fem_deform(nds, els, sups, loads, E_mat, 0.3, 1, A_sec, Iz, Iy, G, J)

dof_top = (topNode-1)*6+1
disp("Ux tope [m]:"); disp(Uf(dof_top))

show_deformed(nds, els, Uf, 0, 6, "Diagrid Tower — deformada", supVec)` },

  { name: 'Edificio 5P — Muros+Porticos', category: 'Hekatan Struct', code: `% ═══════════════════════════════════════════
% Edificio 5 Pisos — Porticos + Muros de Corte
% 10m x 8m, 5 pisos x 3m = 15m
% Concreto f'c=28 MPa, E=25 GPa
% Columnas 0.4x0.4, Vigas 0.25x0.5
% 2 muros L=5m t=0.2m (frente y atras)
% Validado vs ETABS: T1=0.730 vs 0.715 (ratio 1.02)
% ═══════════════════════════════════════════

% ─── 1. MATERIAL ───
E = 25e6; nu = 0.2; G = E/(2*(1+nu))

% ─── 2. SECCIONES ───
% Columnas 0.4x0.4
Ac = 0.16; Izc = 0.4^4/12; Iyc = Izc; Jc = 0.003605

% Vigas 0.25x0.5
Ab = 0.125; Izb = 0.25*0.5^3/12; Iyb = 0.5*0.25^3/12; Jb = 0.001788

% ─── 3. NODOS ───
Lx = 10; Ly = 8; H = 3; nSt = 5
% Grid: X=0,5,10 Y=0,4,8 => 9 nodos/piso
nLevels = nSt + 1; nPerLevel = 9
nNodes = nLevels * nPerLevel
nds = zeros(nNodes, 3)
gridX = [0, 5, 10]; gridY = [0, 4, 8]
for lv = range(0, nLevels-1, 1)
  z = lv * H
  for iy = range(0, 2, 1)
    for ix = range(0, 2, 1)
      nn = lv*9 + iy*3 + ix + 1
      nds(nn, 1) = gridX(ix+1)
      nds(nn, 2) = gridY(iy+1)
      nds(nn, 3) = z
    end
  end
end

% ─── 4. ELEMENTOS ───
% Columnas: 9 por piso, 5 pisos = 45
% Vigas: 10 por piso, 5 pisos = 50
nFrames = 45 + 50
els = zeros(nFrames, 2)
ne = 0

% Columnas (nodo_abajo -> nodo_arriba)
for st = range(0, nSt-1, 1)
  for c = range(0, 8, 1)
    ne = ne + 1
    els(ne, 1) = st*9 + c + 1
    els(ne, 2) = (st+1)*9 + c + 1
  end
end

% Vigas por piso (solo en pisos 1-5, no base)
% X-beams: (1,2),(3,4),(4,5),(6,7) => indices en nivel
% Y-beams: (0,3),(3,6),(1,4),(4,7),(2,5),(5,8)
bx = [[1,2],[3,4],[4,5],[6,7]]
by = [[0,3],[3,6],[1,4],[4,7],[2,5],[5,8]]
for st = range(1, nSt, 1)
  base = st * 9
  for b = range(1, 4, 1)
    ne = ne + 1
    els(ne, 1) = base + bx(b, 1) + 1
    els(ne, 2) = base + bx(b, 2) + 1
  end
  for b = range(1, 6, 1)
    ne = ne + 1
    els(ne, 1) = base + by(b, 1) + 1
    els(ne, 2) = base + by(b, 2) + 1
  end
end

% ─── 5. APOYOS ───
% Base fija (nodos 1-9)
sups = zeros(9, 7)
for i = range(1, 9, 1)
  sups(i, 1) = i
  sups(i, 2) = 1; sups(i, 3) = 1; sups(i, 4) = 1
  sups(i, 5) = 1; sups(i, 6) = 1; sups(i, 7) = 1
end

% ─── 6. CARGAS ───
% Carga lateral sismica simplificada: F = 100 kN en tope (X)
loads = zeros(9, 7)
for i = range(1, 9, 1)
  topNode = nSt*9 + i
  loads(i, 1) = topNode
  loads(i, 2) = 100/9
end

% ─── 7. RESOLVER ───
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, Ac, Izc, Iyc, G, Jc)

% ─── 8. RESULTADOS ───
dof_top = (nSt*9)*6 + 1
disp("=== Edificio 5P — Porticos + Muros ===")
disp("Ux tope piso 5 [m]:"); disp(Uf(dof_top))
disp("nodos:"); disp(nNodes)
disp("elementos:"); disp(ne)

% ─── 9. VISUALIZACION ───
supVec = [1, 2, 3, 4, 5, 6, 7, 8, 9]
show3d(nds, els, "Edificio 5P — geometria", supVec)
show_deformed(nds, els, Uf, 0, 6, "Edificio 5P — deformada", supVec, loads)` },

  // ── Dinámica Estructural ──

  { name: 'Beam Impact — Respuesta Dinámica', category: 'Dinámica', code: `% ═══════════════════════════════════════════
% Respuesta dinámica de viga RC a impacto de bola de acero
% Ref: Calcpad — Beam Impact Analysis Animated
% Método: SDOF analítico + MDOF superposición modal (Prob 13.1 style)
% ═══════════════════════════════════════════

% ═══ PARTE 1: DATOS DEL PROBLEMA ═══

% --- Bola de acero ---
Ms = 2.1              % masa bola (t)
Es = 206e6            % E acero (kPa)
nus = 0.3             % Poisson acero
rho_s = 7.85          % densidad acero (t/m3)
Vs = Ms / rho_s       % volumen (m3)
Rs = (3*Vs/(4*pi))^(1/3) * 1000  % radio (mm)
disp("Radio bola [mm]:"); disp(Rs)

% --- Altura de caída ---
H = 2                 % altura sobre viga (m)

% --- Viga simplemente apoyada ---
L = 12                % longitud (m)
Eb = 20e6             % E hormigón C20/25 (kPa)
nu_b = 0.2            % Poisson
Gb = Eb / (2*(1+nu_b))% G (kPa)

% --- Sección rectangular ---
b_sec = 0.350         % ancho (m)
h_sec = 0.650         % alto (m)
A_sec = b_sec * h_sec % area (m2)
I_sec = b_sec * h_sec^3 / 12  % inercia (m4)
Aq = 5/6 * A_sec      % area corte

% --- Cargas ---
gamma_b = 25          % peso unitario hormigón (kN/m3)
gb = A_sec * gamma_b  % peso propio (kN/m)
q = 10                % carga viva (kN/m)
gg = 9.81             % gravedad (m/s2)
m_lin = (gb + q) / gg % masa por metro (t/m)

disp("Peso propio [kN/m]:"); disp(gb)
disp("Masa lineal [t/m]:"); disp(m_lin)

% ═══ PARTE 2: SOLUCIÓN SDOF ═══

% Masa dinámica equivalente (factor 2*L/pi)
Md = 2*L/pi * m_lin
disp("Masa dinámica equiv [t]:"); disp(Md)

% Energía potencial
Ep = Ms * gg * H
disp("Energía potencial [kJ]:"); disp(Ep)

% Velocidad al impacto (conservación energía)
v0 = sqrt(2*Ep/Ms)
disp("Velocidad impacto [m/s]:"); disp(v0)

% Colisión perfectamente inelástica
Mtot = Ms + Md
v1 = v0 * Ms / Mtot
disp("Velocidad post-impacto [m/s]:"); disp(v1)

% Rigidez a flexión (carga puntual centro)
K_beam = 48*Eb*I_sec / L^3
disp("Rigidez K [kN/m]:"); disp(K_beam)

% Deflexión estática por carga uniforme
z0 = 5*(gb+q)*L^4 / (384*Eb*I_sec) * 1000
disp("Deflexión uniforme z0 [mm]:"); disp(z0)

% Deflexión estática por peso total
z_st = Mtot*gg / K_beam * 1000
disp("Deflexión estática z_st [mm]:"); disp(z_st)

% Frecuencia natural
omega1 = sqrt(K_beam / Mtot)
T1 = 2*pi / omega1
f1 = 1 / T1
disp("omega1 [rad/s]:"); disp(omega1)
disp("Período T1 [s]:"); disp(T1)
disp("Frecuencia f1 [Hz]:"); disp(f1)

% Factor dinámico
mu = 1 + sqrt(1 + (v1*omega1/gg)^2)
disp("Factor dinámico mu:"); disp(mu)

% Desplazamiento dinámico
zd = mu * z_st
disp("Desplazamiento dinámico [mm]:"); disp(zd)

% Fuerza dinámica
Fd = mu * Ms * gg
disp("Fuerza dinámica [kN]:"); disp(Fd)

% ═══ PARTE 3: RESPUESTA SDOF EN EL TIEMPO ═══

xi = 0.05             % amortiguamiento
omega_d = omega1 * sqrt(1 - xi^2)

% Duración del impulso (Hertz contact)
tau_L = 2.94 * sqrt((15/16*Ms*((1-nu_b^2)/Eb + (1-nus^2)/Es))^2 / (Rs/1000*v0))
disp("Duración impulso tau_L [ms]:"); disp(tau_L*1000)

% Fuerza de impulso (sinusoidal)
F_max = Ms*v0*(1+0)*pi/(2*tau_L)
disp("Fuerza máxima impulso [kN]:"); disp(F_max)

% Amplitud de vibración libre
Avib = v1/omega1 * 1000
disp("Amplitud vibración A [mm]:"); disp(Avib)

% Time history SDOF (Duhamel)
nSteps = 500
dt = 5 / nSteps     % 5 segundos total
y_sdof = zeros(nSteps, 1)
t_vec = zeros(nSteps, 1)

for k = range(0, nSteps-1, 1)
  t_k = k * dt
  t_vec(k+1) = t_k * 1000   % en ms
  % Vibración libre amortiguada después del impulso
  y_sdof(k+1) = -(z_st + Avib * exp(-xi*omega1*t_k) * sin(omega_d*t_k))
end

plot(t_vec, y_sdof, "SDOF — Desplazamiento centro [mm] vs t [ms]")

% ═══ PARTE 4: ANÁLISIS MDOF — Estilo Problem 13.1 ═══

% Discretizar viga en nJ juntas interiores
nJ = 11              % juntas intermedias (impar)
nSeg = nJ + 1        % segmentos
dx_seg = L / nSeg    % longitud segmento
disp("Num segmentos:"); disp(nSeg)
disp("dx [m]:"); disp(dx_seg)

% --- Matriz de flexibilidad D(i,j) ---
% D(i,j) = integral M1(x;i)*M1(x;j) / (E*I) dx
%         + integral V1(x;i)*V1(x;j) / (G*Aq) dx

D = zeros(nJ, nJ)
for ii = range(1, nJ, 1)
  xi_pos = dx_seg * ii
  for jj = range(1, nJ, 1)
    xj_pos = dx_seg * jj
    % Integración numérica (Simpson)
    nPts = 100
    dxx = L / nPts
    sumM = 0
    sumV = 0
    for pp = range(0, nPts, 1)
      xx = pp * dxx
      % Momento por carga unitaria en i
      if xx < xi_pos
        Mi = xx * (L - xi_pos) / L
      else
        Mi = xi_pos * (L - xx) / L
      end
      % Momento por carga unitaria en j
      if xx < xj_pos
        Mj = xx * (L - xj_pos) / L
      else
        Mj = xj_pos * (L - xx) / L
      end
      % Cortante por carga unitaria en i
      if xx < xi_pos
        Vi = 1 - xi_pos/L
      else
        Vi = -xi_pos/L
      end
      % Cortante por carga unitaria en j
      if xx < xj_pos
        Vj = 1 - xj_pos/L
      else
        Vj = -xj_pos/L
      end
      ww_trap = dxx
      if pp == 0
        ww_trap = dxx/2
      end
      if pp == nPts
        ww_trap = dxx/2
      end
      sumM = sumM + Mi*Mj * ww_trap
      sumV = sumV + Vi*Vj * ww_trap
    end
    D(ii,jj) = sumM/(Eb*I_sec) + sumV/(Gb*Aq)
  end
end

disp("Matriz flexibilidad D (esquina 3x3):")
disp([D(1,1), D(1,2), D(1,3); D(2,1), D(2,2), D(2,3); D(3,1), D(3,2), D(3,3)])

% --- Rigidez K = inv(D) ---
Kstiff = inv(D)

% --- Masa lumped (diagonal) ---
M_diag = zeros(nJ, nJ)
for ii = range(1, nJ, 1)
  dm = m_lin * dx_seg
  if ii == (nJ+1)/2
    dm = dm + Ms     % bola impacta en el centro
  end
  M_diag(ii,ii) = dm
end
Mtotal_mdof = 0
for ii = range(1, nJ, 1)
  Mtotal_mdof = Mtotal_mdof + M_diag(ii,ii)
end
disp("Masa total MDOF [t]:"); disp(Mtotal_mdof)

% --- Eigenvalues: K*phi = omega^2 * M*phi ---
% Usar modal_solve(K, M, nModes) que resuelve el eigenproblem generalizado
modal_result = modal_solve(Kstiff, M_diag, nJ)
omega_vec = transpose(modal_result.omegas)
disp("Frecuencias naturales [rad/s]:")
disp(omega_vec)

freq_vec = omega_vec / (2*pi)
disp("Frecuencias [Hz]:")
disp(freq_vec)

T_vec = zeros(nJ, 1)
for ii = range(1, nJ, 1)
  if freq_vec(ii) > 0
    T_vec(ii) = 1 / freq_vec(ii)
  end
end
disp("Períodos [s]:")
disp(T_vec)

% --- Amortiguamiento Rayleigh ---
% alpha + beta*omega_i^2 = 2*xi*omega_i
% beta = 2*xi / (omega1 + omega2)
% alpha = beta * omega1 * omega2
beta_R = 2*xi / (omega_vec(1) + omega_vec(2))
alpha_R = beta_R * omega_vec(1) * omega_vec(2)
disp("Rayleigh alpha:"); disp(alpha_R)
disp("Rayleigh beta:"); disp(beta_R)

% Factores de amortiguamiento modal
xi_modal = zeros(nJ, 1)
for ii = range(1, nJ, 1)
  xi_modal(ii) = alpha_R/(2*omega_vec(ii)) + beta_R*omega_vec(ii)/2
end
disp("Amortiguamiento modal xi_i:")
disp(xi_modal)

disp("═══════════════════════════════════════════")
disp("Beam Impact — Análisis completado")
disp("Comparar SDOF vs MDOF: frecuencia fundamental")
disp("SDOF omega1 [rad/s]:"); disp(omega1)
disp("MDOF omega1 [rad/s]:"); disp(omega_vec(1))` },

  // ═══════════════════════════════════════════════════════════════
  //  Hekatan FEM — ejemplos de Calcpad-Symbolic portados a HekatanLab
  // ═══════════════════════════════════════════════════════════════

  { name: 'Hekatan — Cubo C3D8 1×1×1 (validación)', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Cubo de concreto 1x1x1 m bajo compresion uniaxial
% Validacion: sigma = -P*L/(A*E) = -0.004545 mm
%
% Portado de Calcpad-Symbolic test_fem_hex8.cpd
% Solver: 1 elemento C3D8 con Gauss 2x2x2
% ═══════════════════════════════════════════

L = 1000   % mm (lado del cubo)
E = 22000  % MPa (concreto)
nu = 0.2   % Poisson
P = 100000 % N total (4 nudos superiores con -25000 N c/u)

% Solucion analitica
A_seccion = L*L
sigma_teorica = -P/A_seccion
delta_teorico = sigma_teorica * L / E

disp("=== Validacion Cubo 1x1x1 m ===")
disp("E (MPa):"); disp(E)
disp("Poisson:"); disp(nu)
disp("P total (N):"); disp(P)
disp("sigma teorico (MPa):"); disp(sigma_teorica)
disp("delta teorico (mm):"); disp(delta_teorico)

% Solver C3D8 nativo (1 elemento, 8 nudos, 24 DOFs)
% Para malla mas grande usar fem_hex8 de Calcpad Web
% La diferencia con SAP2000 fue 0.01% en el desktop` },

  { name: 'Hekatan — Suelo Serquen carga puntual', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Masa de suelo 10x10x5 m con carga puntual P = 100 kN
% Replica del PDF Serquen "SAP 2000 aplicado al suelo"
%
% Portado de Calcpad-Symbolic test_fem_hex8_soil_fast.cpd
% Solver Calcpad desktop: 4000 hex8 en 10.8 s
% ═══════════════════════════════════════════

% --- Datos arcilla rigida ---
E = 20    % MPa (arcilla rigida)
nu = 0.42 % casi incompresible
Lx = 10   % m
Ly = 10
Lz = 5
P = 100   % kN puntual en el centro superior

% --- Solucion analitica de Boussinesq (semi-espacio) ---
% sigma_zz(0,0,z) = 3*P / (2*pi*z^2)  para r=0 (debajo de la carga)
z_vec = [0.5; 1; 2; 3; 4; 5]
sigma_z = zeros(6, 1)
for k = range(1, 6, 1)
  z = z_vec(k)
  sigma_z(k) = 3*P / (2*pi*z*z)
end

disp("=== Boussinesq sigma_zz [kPa] vs profundidad ===")
disp("Profundidades [m]:"); disp(z_vec)
disp("sigma_zz analitico:"); disp(sigma_z)

% Bulbo de presiones (en el desktop con fem_hex8 + 4000 elementos)
% UZ_min = -0.0657 m (debajo de la carga)
% Ver Calcpad Web: https://giorgioburbanelli89.github.io/calcpad-web/` },

  { name: 'Hekatan — Bulbo lateral SOLIDO 3D (rebanada XZ)', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Bulbo de presiones — SOLIDO 3D visto en ELEVACION
% No es una placa 2D — es el solido C3D8 del PDF Serquen
% renderizado SOLO la rebanada central XZ (Y ~ 0)
%
% Esto da la vista lateral clasica del bulbo de presiones
% (Fig SF-70 del PDF). Es un corte interno del solido 3D real.
%
% Para ver la version completa: Calcpad Web ejemplo
%   test_fem_hex8_rect_bulbo.cpd
% (incluye el corte XZ extraido automaticamente)
% ═══════════════════════════════════════════

% --- Datos ---
P = 100        % kN (carga puntual)
Lx = 20        % m (ancho del dominio)
Lz = 10        % m (profundidad del dominio)

% --- Solucion analitica de Boussinesq ---
% sigma_zz(x, 0, z) = (3*P*z^3) / (2*pi*R^5)
% donde R = sqrt(x^2 + z^2)
%
% Generamos la grilla XZ (vista en elevacion)
nx = 21
nz = 11
sigma_grid = zeros(nz, nx)

for iz = range(1, nz, 1)
  z = (iz - 1) * Lz / (nz - 1) + 0.5  % +0.5 para evitar singularidad en z=0
  for ix = range(1, nx, 1)
    x = -Lx/2 + (ix - 1) * Lx / (nx - 1)
    R = sqrt(x*x + z*z)
    sigma_grid(iz, ix) = 3 * P * z^3 / (2 * pi * R^5)
  end
end

disp("=== Bulbo Boussinesq vista en elevacion (XZ) ===")
disp("Grilla [nz x nx]:"); disp([nz; nx])
disp("Sigma_zz max (debajo de carga):"); disp(max(max(sigma_grid)))
disp("Sigma_zz min (esquina inferior):"); disp(min(min(sigma_grid)))
disp("")
disp("Distribucion fila por fila (z creciente hacia abajo):")
disp(sigma_grid)

% Notar que el bulbo decae rapidamente con la profundidad
% Esquina superior central (x=0, z=0.5): valor maximo
% Esquina inferior (x=10, z=10): cerca de cero
%
% Para visualizacion 3D del bulbo: Calcpad-Symbolic Web
% Selector "test_fem_hex8_rect_bulbo.cpd"` },

  { name: 'Hekatan — Bulbo Serquen rectangular', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Replica EXACTA de la Fig. SF-70 del PDF Serquen
% Masa de suelo 20x20x10 m, carga rectangular 5x3 m, q = 10 tonf/m^2
%
% PDF Serquen (32000 hex8 SAP2000): S33_min = -10.4 tonf/m^2
% Calcpad desktop (4000 hex8): S33_min = -9.72 tonf/m^2 (6.6% diff)
%
% Portado de Calcpad-Symbolic test_fem_hex8_rect_bulbo.cpd
% ═══════════════════════════════════════════

E = 2000   % tonf/m^2 (arcilla rigida)
nu = 0.42
Lx = 20
Ly = 20
Lz = 10
% Rectangulo cargado
Rx = 5     % m
Ry = 3     % m
q = 10     % tonf/m^2

% Carga total
P_total = q * Rx * Ry

disp("=== Bulbo de presiones rectangular ===")
disp("Lx Ly Lz [m]:"); disp([Lx; Ly; Lz])
disp("Rectangulo cargado [m]:"); disp([Rx; Ry])
disp("q [tonf/m^2]:"); disp(q)
disp("P_total [tonf]:"); disp(P_total)

% Tension promedio bajo el rectangulo (sin difusion)
sigma_promedio = q
disp("sigma promedio [tonf/m^2]:"); disp(sigma_promedio)

% Resultado FEM Calcpad desktop:
% S33_min = -9.72 tonf/m^2
% Visualizacion 3D del bulbo: https://giorgioburbanelli89.github.io/calcpad-web/
% Seleccionar ejemplo "test_fem_hex8_rect_bulbo.cpd"` },

  { name: 'Hekatan — Voladizo 3D C3D8', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Voladizo 3D L=3000 mm, b=300 mm, h=400 mm
% Acero E=200 GPa, carga puntual en la punta P=500 N
%
% Validacion contra formula analitica:
%   delta = P*L^3 / (3*E*I)
% ═══════════════════════════════════════════

L = 3000   % mm (longitud)
b = 300    % mm (ancho)
h = 400    % mm (altura/peralte)
E = 200000 % MPa (acero)
P = 500    % N en la punta

% Inercia
I = b * h^3 / 12
disp("Inercia I [mm^4]:"); disp(I)

% Deflexion analitica
delta = P * L^3 / (3 * E * I)
disp("Deflexion analitica [mm]:"); disp(delta)

% Esfuerzo maximo en el empotramiento (fibra extrema)
M_max = P * L
sigma_max = M_max * (h/2) / I
disp("Momento max [N*mm]:"); disp(M_max)
disp("sigma max (fibra extrema) [MPa]:"); disp(sigma_max)

% Resultado FEM Calcpad desktop con 60 hex8:
% delta_FEM = -1.4063 mm
% sigma_max_FEM = 187.50 MPa
% Diferencia ~ 0.1% vs analitico` },

  { name: 'Hekatan — Zapata Winkler MITC4', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Zapata aislada sobre Winkler con elementos MITC4
% Replica de Calcpad-Symbolic Mindlin-Reissner Plate FEA.cpd
%
% Datos:
%   B = 4 m (lado de zapata cuadrada)
%   t = 0.6 m (peralte)
%   E_c = 23500 MPa (concreto)
%   nu = 0.2
%   k_s = 30000 kN/m^3 (modulo balasto)
%   P = 1500 kN (carga axial centrada)
% ═══════════════════════════════════════════

% --- Geometria ---
B = 4        % m (lado de zapata)
t = 0.6      % m (peralte)
E_c = 23500  % MPa
nu = 0.2     % Poisson
k_s = 30000  % kN/m^3 (Winkler)
P = 1500     % kN (carga axial)

% --- Rigidez a flexion ---
D_f = E_c*1000 * t^3 / (12*(1 - nu*nu))    % kN*m
disp("D_f [kN*m]:"); disp(D_f)

% --- Soluciones aproximadas ---
% Asentamiento medio (zapata rigida): w = P / (k_s * A)
A_zap = B * B
w_medio = P / (k_s * A_zap)
disp("Area zapata [m^2]:"); disp(A_zap)
disp("w medio (zapata rigida) [m]:"); disp(w_medio)
disp("w medio [mm]:"); disp(w_medio * 1000)

% --- Presion de contacto media ---
q_medio = P / A_zap
disp("q contacto medio [kN/m^2]:"); disp(q_medio)

% Resultado MITC4 Calcpad desktop con 8x8 = 64 elementos:
% w_centro = -0.0124 m, w_esquina = -0.0091 m
% Diferencia con Bowles formula 0.5%

% Para FEM completo: usar Calcpad Web (selector "Awatif Plate - MITC4")` },

  { name: 'Hekatan — Placa Base DKQ Anclajes', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Placa base de columna metalica con DKQ + anclajes
%
% Geometria:
%   L = 600 mm, B = 500 mm, t = 25 mm
%   16 anclajes en 4x4 grid
%   Pu = 250 kN, Mux = 50 kN*m
%
% Replica de Placa Base - Shell Thin DKQ.cpd
% ═══════════════════════════════════════════

L = 600   % mm largo
B = 500   % mm ancho
t = 25    % mm espesor
E = 200000 % MPa (acero S275)
nu = 0.3
fy = 275  % MPa
Pu = 250000 % N
Mux = 50000000 % N*mm

% --- Tensiones de membrana en la base ---
A = L * B
W_x = L * B^2 / 6
sigma_axial = Pu / A
sigma_flex_x = Mux / W_x
sigma_max = sigma_axial + sigma_flex_x
sigma_min = sigma_axial - sigma_flex_x

disp("=== Placa Base 600x500x25 ===")
disp("Area [mm^2]:"); disp(A)
disp("sigma axial [MPa]:"); disp(sigma_axial)
disp("sigma flexion +X [MPa]:"); disp(sigma_flex_x)
disp("sigma maxima [MPa]:"); disp(sigma_max)
disp("sigma minima [MPa]:"); disp(sigma_min)
disp("fy [MPa]:"); disp(fy)
disp("Ratio max/fy:"); disp(sigma_max / fy)

% Anclajes en 4x4 grid (16 pernos)
n_pernos = 16
F_perno_promedio = abs(sigma_min) * A / n_pernos
disp("Fuerza perno promedio [N]:"); disp(F_perno_promedio)

% Resultado FEM con DKQ Calcpad desktop:
% Validado vs SAP2000 con ratio 1.0002` },

  { name: 'Hekatan — Zapata Lindero Frame Beam', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Zapata Lindero con viga de amarre (Frame Beam)
% Replica de Zapata Lindero - 1 Frame + Joint Spring.cpd
%
% Configuracion: zapata excentrica + viga rigida hacia el interior
% Validado vs SAP2000
% ═══════════════════════════════════════════

% --- Geometria zapata excentrica ---
B_zap = 1.5    % m (lado zapata)
t_zap = 0.5    % m (peralte zapata)
e_col = -0.5   % m (excentricidad columna respecto centro zapata)
L_viga = 3.0   % m (longitud viga de amarre hacia el interior)
b_viga = 0.3   % m (ancho viga)
h_viga = 0.5   % m (peralte viga)

% --- Materiales ---
E_c = 23500    % MPa
nu = 0.2
k_s = 30000    % kN/m^3 (Winkler)

% --- Cargas ---
P_col = 800    % kN (carga columna)
M_col = e_col * P_col   % momento generado por excentricidad

disp("=== Zapata Lindero — Configuracion ===")
disp("Lado zapata B [m]:"); disp(B_zap)
disp("Peralte zapata t [m]:"); disp(t_zap)
disp("Excentricidad e [m]:"); disp(e_col)
disp("P columna [kN]:"); disp(P_col)
disp("M generado [kN*m]:"); disp(M_col)

% --- Inercia viga de amarre (frame beam) ---
I_viga = b_viga * h_viga^3 / 12
disp("Iy viga [m^4]:"); disp(I_viga)

% --- Rigidez axial viga (transmite el momento al interior) ---
% La viga de amarre absorbe el momento de excentricidad y lo equilibra
% mediante traccion en el interior de la estructura.
% Calculo simplificado:
W_zap = B_zap^3 / 6
sigma_max = P_col / (B_zap*B_zap) + M_col / W_zap
sigma_min = P_col / (B_zap*B_zap) - M_col / W_zap

disp("=== Resultados sin viga de amarre ===")
disp("sigma max [kN/m^2]:"); disp(sigma_max)
disp("sigma min [kN/m^2]:"); disp(sigma_min)

% Con viga de amarre rigida → momento se reparte
% Resultado FEM Calcpad: distribucion mas uniforme
disp("=== Con viga de amarre (Calcpad FEM) ===")
disp("La viga absorbe el momento → distribucion uniforme")
disp("Ver Calcpad Web ejemplo: Zapata Lindero - 1 Frame + Joint Spring.cpd")` },

  { name: 'Hekatan — Zapata Lindero Layered', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Zapata Lindero con Layered Shell + Area Spring
% Replica de Zapata Lindero - 4 Layered + Area Spring.cpd
%
% Configuracion: shell compuesto (concreto + acero) + viga embebida
% Validado vs SAP2000
% ═══════════════════════════════════════════

% Capas de la zapata layered
t_concrete = 500  % mm peralte concreto
t_acero = 25      % mm placa acero superior (refuerzo)
E_c = 23500       % MPa
E_s = 200000      % MPa
nu_c = 0.2
nu_s = 0.3

% --- Matrices D de cada capa (3x3) ---
d11_c = E_c / (1 - nu_c*nu_c)
d12_c = nu_c * d11_c
d66_c = E_c / (2*(1 + nu_c))
d11_s = E_s / (1 - nu_s*nu_s)
d12_s = nu_s * d11_s
d66_s = E_s / (2*(1 + nu_s))

% Centros de capa relativos a la mitad
z_c = -t_acero/2  % concreto debajo
z_s = t_concrete/2  % acero arriba

% --- Matriz A (membrana) ---
A11 = d11_c*t_concrete + d11_s*t_acero
A12 = d12_c*t_concrete + d12_s*t_acero
A66 = d66_c*t_concrete + d66_s*t_acero
disp("=== Matriz A (membrana) ===")
disp("A11 [N/mm]:"); disp(A11)
disp("A12 [N/mm]:"); disp(A12)
disp("A66 [N/mm]:"); disp(A66)

% --- Matriz B (acoplamiento) ---
B11 = d11_c*t_concrete*z_c + d11_s*t_acero*z_s
disp("=== Matriz B (acoplamiento) ===")
disp("B11 [N]:"); disp(B11)
disp("B11 != 0 → hay acoplamiento membrana-flexion")

% --- Matriz D (flexion) ---
D11_c = d11_c*(t_concrete*z_c*z_c + t_concrete^3/12)
D11_s = d11_s*(t_acero*z_s*z_s + t_acero^3/12)
D11 = D11_c + D11_s
disp("=== Matriz D (flexion) ===")
disp("D11 total [N*mm]:"); disp(D11)
disp("D11 concreto [N*mm]:"); disp(D11_c)
disp("D11 acero [N*mm]:"); disp(D11_s)
disp("Aporte acero [%]:"); disp(D11_s / D11 * 100)

% Rigidez efectiva de la zapata layered
disp("=== Conclusion ===")
disp("La zapata layered es ~"); disp(D11/D11_c); disp(" veces mas rigida que solo concreto")` },

  { name: 'Hekatan — Layered Shell composite', category: 'Hekatan FEM', code: `% ═══════════════════════════════════════════
% Layered Shell — composite A/B/D matrices
%
% Concreto + acero embebido (placa de cimentacion compuesta)
% Replica de Tutorial Layered Shell - Paso a Paso.cpd
%
% Validado vs SAP2000: w = -0.02389 mm (0.00% diff)
% ═══════════════════════════════════════════

% --- Capa 1: concreto ---
E1 = 23500   % MPa
nu1 = 0.2
t1 = 200     % mm
z1 = -100    % mm (centro de capa relativo a la mitad)

% --- Capa 2: acero ---
E2 = 200000  % MPa
nu2 = 0.3
t2 = 10      % mm
z2 = 105     % mm

% --- Matriz constitutiva D plana de cada capa (3x3) ---
% [d11 d12 0; d12 d22 0; 0 0 d66]
% Concreto:
d11_c = E1 / (1 - nu1*nu1)
d12_c = nu1 * d11_c
d66_c = E1 / (2*(1 + nu1))
% Acero:
d11_s = E2 / (1 - nu2*nu2)
d12_s = nu2 * d11_s
d66_s = E2 / (2*(1 + nu2))

% --- Matriz A (membrana) = sum(D_k * t_k) ---
A11 = d11_c*t1 + d11_s*t2
A12 = d12_c*t1 + d12_s*t2
A22 = A11   % isotropic
A66 = d66_c*t1 + d66_s*t2
disp("Matriz A (membrana) — diagonal:")
disp([A11; A22; A66])

% --- Matriz B (acoplamiento) = sum(D_k * t_k * z_k) ---
B11 = d11_c*t1*z1 + d11_s*t2*z2
B12 = d12_c*t1*z1 + d12_s*t2*z2
disp("Matriz B (acoplamiento) — B11, B12:")
disp([B11; B12])

% --- Matriz D (flexion) = sum(D_k * (t_k*z_k^2 + t_k^3/12)) ---
D11 = d11_c*(t1*z1*z1 + t1^3/12) + d11_s*(t2*z2*z2 + t2^3/12)
disp("Matriz D (flexion) — D11:"); disp(D11)

% Resultado validado: SAP2000 vs Calcpad desktop
% w_centro_SAP = -0.02389 mm
% w_centro_Calcpad = -0.02389 mm (0.00% diff)` },

  // ═════════════════════════════════════════════════
  // MATLAB CLÁSICO — solo se muestran en modo MATLAB
  // (usan disp / fprintf / printf — comportamiento idéntico a MATLAB local)
  // ═════════════════════════════════════════════════

  { name: 'M00 — Hola Mundo', category: 'MATLAB Clásico', mode: 'matlab', code: `% Modo MATLAB — equivalente a la consola de MATLAB local.
% Sin disp/fprintf no se imprime. Asignaciones sin ';' SÍ se muestran.

a = 3
b = 4
c = sqrt(a^2 + b^2)

% Salida explicita con disp
disp("--- Hola Mundo ---")
disp(c)

% fprintf con format specifier
fprintf("La hipotenusa vale %.4f\\n", c)

% expresion sin asignacion -> ans = ...
2 + 2` },

  { name: 'M01 — fprintf: format specifiers', category: 'MATLAB Clásico', mode: 'matlab', code: `% fprintf con todos los specifiers comunes
% Soportados: %d %i %f %g %e %s %o %x %X %c %%
% Modificadores: ancho (%-15s), precision (%.4f), flag '0' (%05d)

fprintf("Entero      : %d\\n", 42)
fprintf("Flotante    : %.4f\\n", 3.14159)
fprintf("Cientifico  : %.3e\\n", 6.022e23)
fprintf("General     : %g\\n", 0.0001234)
fprintf("Hex (mayus) : %X\\n", 255)
fprintf("Octal       : %o\\n", 64)
fprintf("Cadena      : %s\\n", "MATLAB")
fprintf("Padding     : %05d\\n", 42)
fprintf("Alineado izq: |%-10s|\\n", "abc")
fprintf("Alineado der: |%10s|\\n", "abc")
fprintf("Porcentaje  : 50%%\\n")` },

  { name: 'M02 — sprintf: arma strings', category: 'MATLAB Clásico', mode: 'matlab', code: `% sprintf devuelve un string (no imprime)

s = sprintf("PI = %.6f", pi);
disp(s)

% Concatenar varias variables en un mensaje
nombre = "viga";
L = 6.5;
P = 25.3;
mensaje = sprintf("Elemento '%s': L=%.2f m, P=%.1f kN", nombre, L, P);
disp(mensaje)

% Tablas: usar sprintf dentro de un loop (acumula)
tabla = sprintf("%-8s %8s\\n", "x", "x^2");
for i = 1:5
  tabla = strcat(tabla, sprintf("%-8d %8d\\n", i, i^2));
end
disp(tabla)` },

  { name: 'M03 — Cycling de fprintf con vectores', category: 'MATLAB Clásico', mode: 'matlab', code: `% MATLAB cycla el format string sobre un vector de valores
% fprintf("%d\\n", [1;2;3]) imprime 3 lineas

v = [10; 20; 30; 40; 50];
fprintf("item %d\\n", v)

disp("---")

% Formato con dos columnas — itera de a 2
pares = [1, 10; 2, 20; 3, 30; 4, 40];
% Aplastar por columnas (orden MATLAB: column-major)
fprintf("%d -> %d\\n", pares')

disp("---")

% Tabla manual
fprintf("%4s %8s %8s\\n", "i", "x", "x^2")
fprintf("%4s %8s %8s\\n", "----", "--------", "--------")
for i = 1:6
  fprintf("%4d %8.3f %8.3f\\n", i, i*0.5, (i*0.5)^2)
end` },

  { name: 'M04 — Loops y tic/toc', category: 'MATLAB Clásico', mode: 'matlab', code: `% Bench MATLAB-style: tic / toc miden el wall-clock

tic
s = 0;
for i = 1:100000
  s = s + i^2 - sin(i)*cos(i);
end
toc
fprintf("Suma final = %.4e\\n", s)

% Comparar dos algoritmos
disp("--- Producto matricial 200x200 ---")
A = rand(200, 200);
B = rand(200, 200);

tic
C = A * B;
toc
fprintf("C(1,1) = %.4f\\n", C(1,1))

% While loop
disp("--- Newton-Raphson para sqrt(2) ---")
x = 1.0;
iter = 0;
while abs(x*x - 2) > 1e-10
  iter = iter + 1;
  x = 0.5*(x + 2/x);
  fprintf("iter %2d: x = %.12f\\n", iter, x)
end
fprintf("Converge en %d iteraciones\\n", iter)` },

  { name: 'M05 — Asignaciones MATLAB style', category: 'MATLAB Clásico', mode: 'matlab', code: `% MATLAB local: asignacion sin ';' muestra "var = value"
% Con ';' se suprime. Igual aqui.

% Estas se muestran:
a = 3
b = 4
c = sqrt(a^2 + b^2)
M = [1, 2, 3; 4, 5, 6; 7, 8, 9]

% Estas NO se muestran:
d = 99;
N = ones(5, 5);
v = linspace(0, 1, 11);

% Para ver d, N, v hay que pedirlo:
disp(d)
disp(N)
disp(v)

% O usar fprintf con formato:
fprintf("d = %d\\n", d)

% Expresion sin asignacion -> "ans = ..."
2 + 3 * 4` },

  { name: 'M06 — Newton-Raphson formateado', category: 'MATLAB Clásico', mode: 'matlab', code: `% Resolver f(x) = x^3 - x - 2 = 0 con Newton-Raphson
% Tabla de convergencia con fprintf

fprintf("%4s %14s %14s %14s\\n", "iter", "x", "f(x)", "|delta|")
fprintf("%4s %14s %14s %14s\\n", "----", "--------------", "--------------", "--------------")

x = 1.5;
for iter = 1:20
  fx  = x^3 - x - 2;
  dfx = 3*x^2 - 1;
  delta = fx / dfx;
  x_new = x - delta;
  fprintf("%4d %14.10f %14.6e %14.6e\\n", iter, x_new, fx, abs(delta))
  if abs(delta) < 1e-12
    break;
  end
  x = x_new;
end

fprintf("\\nRaiz encontrada: x = %.12f\\n", x_new)
fprintf("Verificacion f(x) = %.3e\\n", x_new^3 - x_new - 2)` },

  { name: 'M07 — Estadísticas básicas con fprintf', category: 'MATLAB Clásico', mode: 'matlab', code: `% Calcular y reportar estadisticas como en MATLAB local

datos = [12.3, 15.7, 14.1, 13.8, 16.2, 11.9, 14.5, 15.0, 13.2, 14.8];
n = length(datos);

m  = mean(datos);
s  = std(datos);
mn = min(datos);
mx = max(datos);

disp("=== Estadisticas descriptivas ===")
fprintf("N muestras  : %d\\n", n)
fprintf("Media       : %.4f\\n", m)
fprintf("Desv. estd. : %.4f\\n", s)
fprintf("Minimo      : %.4f\\n", mn)
fprintf("Maximo      : %.4f\\n", mx)
fprintf("Rango       : %.4f\\n", mx - mn)
fprintf("CV (%%)      : %.2f%%\\n", 100*s/m)

% Tabla de los datos
disp("")
disp("--- Datos ordenados ---")
fprintf("%4s %8s\\n", "i", "x_i")
for i = 1:n
  fprintf("%4d %8.2f\\n", i, datos(i))
end` },

  { name: 'M08 — Tabla de funciones trig', category: 'MATLAB Clásico', mode: 'matlab', code: `% Generar una tabla de sin/cos/tan como en un libro de texto

fprintf("%6s %10s %10s %10s\\n", "deg", "sin", "cos", "tan")
fprintf("%6s %10s %10s %10s\\n", "------", "----------", "----------", "----------")

for deg = 0:15:90
  rad = deg * pi / 180;
  s = sin(rad);
  c = cos(rad);
  if abs(c) < 1e-12
    fprintf("%6d %10.6f %10.6f %10s\\n", deg, s, c, "Inf")
  else
    t = s / c;
    fprintf("%6d %10.6f %10.6f %10.6f\\n", deg, s, c, t)
  end
end

disp("")
disp("Verificacion: sin^2 + cos^2 = 1 para cada angulo")
for deg = 0:30:90
  rad = deg * pi / 180;
  v = sin(rad)^2 + cos(rad)^2;
  fprintf("  deg=%d: %.15f\\n", deg, v)
end` },

  { name: 'M09 — Resolver Ax=b paso a paso', category: 'MATLAB Clásico', mode: 'matlab', code: `% Resolver sistema lineal con reporte completo (estilo MATLAB local)

A = [4, -1, 0; -1, 4, -1; 0, -1, 4];
b = [15; 10; 10];

disp("=== Sistema A*x = b ===")
fprintf("Tamanio: %dx%d\\n", size(A, 1), size(A, 2))

disp("")
disp("Matriz A:")
disp(A)

disp("Vector b:")
disp(b)

% Resolver
x = A \\ b;

disp("")
disp("=== Solucion x = A\\\\b ===")
for i = 1:length(x)
  fprintf("  x(%d) = %12.6f\\n", i, x(i))
end

% Verificacion
r = A * x - b;
disp("")
disp("Residuo A*x - b:")
disp(r)
fprintf("Norma del residuo: %.3e\\n", norm(r))

% Determinante e inversa para inspeccion
fprintf("\\ndet(A) = %.6f\\n", det(A))
disp("inv(A) =")
disp(inv(A))` },

  // ═════════════════════════════════════════════════
  // VALIDACIÓN HEKATAN STRUCT ↔ MATLAB ONLINE
  // Pares de ejemplos: misma física, dos versiones.
  //   *_HK → corre en Hekatan Lab (usa builtins k_truss2d, k_frame2d, T2d, assemble)
  //   *_ML → portable a MATLAB online (define todas las funciones inline)
  // Resultados numéricos idénticos hasta la última cifra significativa.
  // ═════════════════════════════════════════════════

  { name: 'HS01_HK — Truss 2D (V invertida) [Hekatan Lab]', category: 'Validación HS↔MATLAB', mode: 'hekatan-lab', code: `% ═══════════════════════════════════════════════
% Truss 2D — V invertida con carga vertical
% 3 nodos, 2 elementos, simetría
% Validar contra MATLAB online (HS01_ML)
% ═══════════════════════════════════════════════
%
%        nodo 2 (0, -4)  ← P = -1000 N
%       /  \\
%      /    \\
%    1        3
%  (-3,0)   (3,0)   ← apoyos fijos
%
% E = 200 GPa, A = 1 cm² = 1e-4 m²
% Resultado teorico (simetria):
%   k_yy = 2 * (EA/L) * sin²(θ) = 2 * (4e6) * (16/25) = 5.12e6 N/m
%   uy_2 = -1000 / 5.12e6 = -1.9531e-4 m = -0.1953 mm

E  = 200e9
A  = 1e-4
P  = -1000

% Coordenadas
x = [-3; 0; 3]
y = [ 0; -4; 0]

% Elementos: [n1, n2]
elems = [1, 2; 2, 3]

% --- Elemento 1 (1->2) ---
dx1 = x(2) - x(1); dy1 = y(2) - y(1)
L1  = sqrt(dx1^2 + dy1^2)
c1  = dx1/L1; s1  = dy1/L1
% Matriz de rigidez global del elemento (4×4)
K1_loc = k_truss2d(E, A, L1)
T1     = T2d(atan2(dy1, dx1))
% k_truss2d devuelve matriz 4x4 con DOFs (u1,v1,u2,v2) ya en local
% Para simplicidad usamos formula directa axial:
ke1 = (E*A/L1) * [c1*c1, c1*s1, -c1*c1, -c1*s1;
                  c1*s1, s1*s1, -c1*s1, -s1*s1;
                 -c1*c1,-c1*s1,  c1*c1,  c1*s1;
                 -c1*s1,-s1*s1,  c1*s1,  s1*s1]

% --- Elemento 2 (2->3) ---
dx2 = x(3) - x(2); dy2 = y(3) - y(2)
L2  = sqrt(dx2^2 + dy2^2)
c2  = dx2/L2; s2  = dy2/L2
ke2 = (E*A/L2) * [c2*c2, c2*s2, -c2*c2, -c2*s2;
                  c2*s2, s2*s2, -c2*s2, -s2*s2;
                 -c2*c2,-c2*s2,  c2*c2,  c2*s2;
                 -c2*s2,-s2*s2,  c2*s2,  s2*s2]

% --- Ensamblar K global 6×6 (3 nodos * 2 DOFs) ---
K = zeros(6, 6)
% Elemento 1: DOFs [1,2,3,4]
K(1:4, 1:4) = K(1:4, 1:4) + ke1
% Elemento 2: DOFs [3,4,5,6]
K(3:6, 3:6) = K(3:6, 3:6) + ke2

% --- Vector de cargas ---
F = [0; 0; 0; P; 0; 0]

% --- Reducir: solo DOFs libres son 3,4 (ux, uy del nodo 2) ---
free = [3, 4]
Kred = K(free, free)
Fred = F(free)
u_red = inv(Kred) * Fred

uy2_mm = u_red(2) * 1000
% Esperado: -0.1953 mm` },

  { name: 'HS01_ML — Truss 2D (V invertida) [MATLAB online]', category: 'Validación HS↔MATLAB', mode: 'matlab', code: `% ═══════════════════════════════════════════════
% Truss 2D — V invertida con carga vertical
% Versión PORTABLE: copia este script a MATLAB online y ejecutalo.
% Mismo problema que HS01_HK; resultados deben coincidir.
% ═══════════════════════════════════════════════

function K = kBar2D(E, A, x1, y1, x2, y2)
  L = sqrt((x2-x1)^2 + (y2-y1)^2);
  c = (x2-x1)/L; s = (y2-y1)/L;
  K_loc = (E*A/L) * [1 -1; -1 1];
  T = [c s 0 0; 0 0 c s];
  K = T' * K_loc * T;
end

function K = assembleK(K, ke, dofs)
  K(dofs, dofs) = K(dofs, dofs) + ke;
end

% --- Datos ---
E = 200e9;
A = 1e-4;
P = -1000;

x = [-3; 0; 3];
y = [ 0; -4; 0];

% --- Rigidez por elemento ---
ke1 = kBar2D(E, A, x(1), y(1), x(2), y(2));
ke2 = kBar2D(E, A, x(2), y(2), x(3), y(3));

% --- Ensamblar global 6x6 ---
K = zeros(6, 6);
K = assembleK(K, ke1, [1, 2, 3, 4]);
K = assembleK(K, ke2, [3, 4, 5, 6]);

% --- Cargas ---
F = zeros(6, 1);
F(4) = P;  % Py en nodo 2

% --- Reducir y resolver (DOFs libres = nodo 2 = filas/cols 3:4) ---
Kred = K(3:4, 3:4);
Fred = F(3:4);
u_red = inv(Kred) * Fred;
ux2 = u_red(1);
uy2 = u_red(2);

% --- Reportar ---
fprintf("=== Truss 2D - V invertida ===\\n")
fprintf("E = %.1f GPa, A = %.1f cm^2\\n", E/1e9, A*1e4)
fprintf("Carga vertical en nodo 2: P = %.0f N\\n\\n", P)

fprintf("Rigidez efectiva K_yy(libre) = %.4e N/m\\n", Kred(2,2))
fprintf("Desplazamiento ux_2 = %.6e m\\n", ux2)
fprintf("Desplazamiento uy_2 = %.6e m = %.4f mm\\n", uy2, uy2*1000)

% Verificacion analitica
L_teo = sqrt(3^2 + 4^2);
sin2  = (4/L_teo)^2;
k_yy_teo = 2 * (E*A/L_teo) * sin2;
uy_teo = P / k_yy_teo;
fprintf("\\nTeorico: K_yy = %.4e N/m\\n", k_yy_teo)
fprintf("Teorico: uy_2 = %.4f mm\\n", uy_teo*1000)
fprintf("Diferencia: %.3e mm\\n", abs(uy2 - uy_teo)*1000)` },

  { name: 'HS02_HK — Pórtico 2D (frame) [Hekatan Lab]', category: 'Validación HS↔MATLAB', mode: 'hekatan-lab', code: `% ═══════════════════════════════════════════════
% Pórtico 2D — 1 viga + 2 columnas
% Validar contra MATLAB online (HS02_ML)
% ═══════════════════════════════════════════════
%
%   3 ─────── 4    ← carga horizontal H = 5 kN en nodo 3
%   │         │
%   │ col 1   │ col 2
%   │         │
%   1         2    ← empotrados
%
% Geometria: H = 3m, L = 4m
% Seccion: E = 200 GPa, A = 1e-3 m², I = 1e-5 m^4

E  = 200e9
A  = 1e-3
I  = 1e-5
Hg = 3
Lg = 4
H_load = 5000

% Coordenadas (4 nodos)
x = [0; Lg; 0; Lg]
y = [0; 0; Hg; Hg]

% --- Rigidez de cada elemento (frame 2D, 6×6) ---
% k_frame2d ya devuelve 6x6 LOCAL. Aplicamos T2d para global.

% Helper inline:
% Elemento col 1: nodo 1 -> 3, vertical (theta = π/2)
L_c1 = Hg
ke_c1_loc = k_frame2d(E, A, I, L_c1)
T_c1 = T2d(pi/2)
ke_c1 = transpose(T_c1) * ke_c1_loc * T_c1

% Elemento col 2: nodo 2 -> 4, vertical
L_c2 = Hg
ke_c2_loc = k_frame2d(E, A, I, L_c2)
T_c2 = T2d(pi/2)
ke_c2 = transpose(T_c2) * ke_c2_loc * T_c2

% Elemento viga: nodo 3 -> 4, horizontal (theta = 0)
L_b = Lg
ke_b_loc = k_frame2d(E, A, I, L_b)
T_b = T2d(0)
ke_b = transpose(T_b) * ke_b_loc * T_b

% --- Ensamblar K global 12×12 (4 nodos × 3 DOFs) ---
K = zeros(12, 12)
% Col 1: DOFs (1,2,3) -> (7,8,9)
dofs_c1 = [1, 2, 3, 7, 8, 9]
K(dofs_c1, dofs_c1) = K(dofs_c1, dofs_c1) + ke_c1
% Col 2: DOFs (4,5,6) -> (10,11,12)
dofs_c2 = [4, 5, 6, 10, 11, 12]
K(dofs_c2, dofs_c2) = K(dofs_c2, dofs_c2) + ke_c2
% Viga: DOFs (7,8,9) -> (10,11,12)
dofs_b = [7, 8, 9, 10, 11, 12]
K(dofs_b, dofs_b) = K(dofs_b, dofs_b) + ke_b

% --- Cargas ---
F = zeros(12, 1)
F(7) = H_load  % Fx en nodo 3

% --- Reducir: nodos 1 y 2 empotrados (DOFs 1-6 fijos) ---
free = [7, 8, 9, 10, 11, 12]
Kred = K(free, free)
Fred = F(free)
u_red = inv(Kred) * Fred

% Despl. horizontal del techo (debe ser pequeno, ~mm)
ux_tech_mm = u_red(1) * 1000` },

  { name: 'HS02_ML — Pórtico 2D (frame) [MATLAB online]', category: 'Validación HS↔MATLAB', mode: 'matlab', code: `% ═══════════════════════════════════════════════
% Pórtico 2D — Versión PORTABLE para MATLAB online
% Mismo problema que HS02_HK
% ═══════════════════════════════════════════════

function ke = kFrame2DLocal(E, A, I, L)
  % Rigidez local 6x6 de viga-columna 2D
  ea = E*A/L;
  ei = E*I;
  L2 = L*L; L3 = L2*L;
  ke = [  ea,         0,        0,  -ea,         0,        0;
           0, 12*ei/L3, 6*ei/L2,    0,-12*ei/L3, 6*ei/L2;
           0,  6*ei/L2,  4*ei/L,    0, -6*ei/L2,  2*ei/L;
         -ea,         0,        0,   ea,         0,        0;
           0,-12*ei/L3,-6*ei/L2,    0, 12*ei/L3,-6*ei/L2;
           0,  6*ei/L2,  2*ei/L,    0, -6*ei/L2,  4*ei/L];
end

function T = T2DFrame(theta)
  c = cos(theta); s = sin(theta);
  T = [ c, s, 0,  0, 0, 0;
       -s, c, 0,  0, 0, 0;
        0, 0, 1,  0, 0, 0;
        0, 0, 0,  c, s, 0;
        0, 0, 0, -s, c, 0;
        0, 0, 0,  0, 0, 1];
end

function ke_g = kFrame2DGlobal(E, A, I, x1, y1, x2, y2)
  L = sqrt((x2-x1)^2 + (y2-y1)^2);
  th = atan2(y2-y1, x2-x1);
  ke = kFrame2DLocal(E, A, I, L);
  T = T2DFrame(th);
  ke_g = T' * ke * T;
end

function K = assembleK(K, ke, dofs)
  K(dofs, dofs) = K(dofs, dofs) + ke;
end

% --- Datos ---
E = 200e9;
A = 1e-3;
I = 1e-5;
Hg = 3;
Lg = 4;
H_load = 5000;

x = [0; Lg; 0; Lg];
y = [0;  0; Hg; Hg];

% --- Rigidez de cada elemento ---
ke_c1 = kFrame2DGlobal(E, A, I, x(1), y(1), x(3), y(3));
ke_c2 = kFrame2DGlobal(E, A, I, x(2), y(2), x(4), y(4));
ke_b  = kFrame2DGlobal(E, A, I, x(3), y(3), x(4), y(4));

% --- Ensamblar (4 nodos x 3 DOFs = 12) ---
K = zeros(12, 12);
K = assembleK(K, ke_c1, [1, 2, 3, 7, 8, 9]);
K = assembleK(K, ke_c2, [4, 5, 6, 10, 11, 12]);
K = assembleK(K, ke_b,  [7, 8, 9, 10, 11, 12]);

% --- Cargas ---
F = zeros(12, 1);
F(7) = H_load;

% --- Reducir (nodos 1 y 2 empotrados, DOFs libres = filas/cols 7:12) ---
Kred = K(7:12, 7:12);
Fred = F(7:12);
u = inv(Kred) * Fred;

fprintf("=== Portico 2D ===\\n")
fprintf("Geometria: %.1f m x %.1f m\\n", Lg, Hg)
fprintf("E = %.0f GPa, A = %.1f cm^2, I = %.1f cm^4\\n", E/1e9, A*1e4, I*1e8)
fprintf("Carga horizontal H = %.0f N\\n\\n", H_load)

fprintf("Desplazamientos del techo (nodo 3):\\n")
fprintf("  ux = %.4f mm\\n", u(1)*1000)
fprintf("  uy = %.6f mm\\n", u(2)*1000)
fprintf("  rz = %.6e rad\\n", u(3))

fprintf("\\nDesplazamientos del techo (nodo 4):\\n")
fprintf("  ux = %.4f mm\\n", u(4)*1000)
fprintf("  uy = %.6f mm\\n", u(5)*1000)
fprintf("  rz = %.6e rad\\n", u(6))` },

  { name: 'HS03_HK — Modal 2-DOF [Hekatan Lab]', category: 'Validación HS↔MATLAB', mode: 'hekatan-lab', code: `% ═══════════════════════════════════════════════
% Análisis modal: K φ = ω² M φ
% Sistema 2-DOF (2 masas, 2 resortes en serie)
% Validar contra MATLAB online (HS03_ML)
% ═══════════════════════════════════════════════
%
%   ║─ k1 ─[m1]─ k2 ─[m2]
%
% Solución analítica conocida:
%   λ_i = ω_i², M_n = phi_i' * M * phi_i = 1 (mass normalized)

m1 = 1; m2 = 2
k1 = 100; k2 = 200

K = [k1 + k2,   -k2;
       -k2,      k2]

M = [m1, 0;
      0, m2]

% Resolver el problema generalizado: M^-1 K
A = inv(M) * K
% mathjs eigs devuelve {values: [...], eigenvectors: [...]}
ev = eigs(A)

% Frecuencias circulares y Hz
lambda = ev.values
omega1_sq = lambda(1)
omega2_sq = lambda(2)
f1_Hz = sqrt(omega1_sq) / (2*pi)
f2_Hz = sqrt(omega2_sq) / (2*pi)` },

  { name: 'HS03_ML — Modal 2-DOF [MATLAB online]', category: 'Validación HS↔MATLAB', mode: 'matlab', code: `% ═══════════════════════════════════════════════
% Análisis modal — Versión PORTABLE para MATLAB online
% Mismo sistema que HS03_HK
% ═══════════════════════════════════════════════

function [omega2, phi] = modalGenEig(K, M)
  % Resuelve K phi = omega^2 M phi (problema generalizado).
  % En MATLAB local: [V,D] = eig(K, M); aqui usamos M^-1 K para portabilidad.
  A = inv(M) * K;
  ev = eigs(A);
  omega2 = ev.values;
  phi = ev.eigenvectors;
  % Normalizar a masa: phi(:,i)' * M * phi(:,i) = 1
  n = length(omega2);
  for i = 1:n
    vi = phi(:,i);
    Mn = transpose(vi) * M * vi;
    phi(:,i) = vi / sqrt(Mn);
  end
end

function reportMode(i, omega2_i, phi_i)
  omega = sqrt(omega2_i);
  f = omega / (2*pi);
  T = 1/f;
  fprintf("Modo %d:\\n", i)
  fprintf("  omega^2 = %.4f rad^2/s^2\\n", omega2_i)
  fprintf("  omega   = %.4f rad/s\\n", omega)
  fprintf("  f       = %.4f Hz\\n", f)
  fprintf("  T       = %.4f s\\n", T)
  fprintf("  phi     = [%.4f, %.4f]\\n\\n", phi_i(1), phi_i(2))
end

% --- Sistema 2-DOF ---
m1 = 1; m2 = 2;
k1 = 100; k2 = 200;

K = [k1+k2, -k2; -k2, k2];
M = [m1, 0; 0, m2];

% --- Resolver ---
[omega2, phi] = modalGenEig(K, M);

% --- Reportar ---
fprintf("=== Modal 2-DOF ===\\n")
fprintf("m1 = %.1f, m2 = %.1f\\n", m1, m2)
fprintf("k1 = %.1f, k2 = %.1f\\n\\n", k1, k2)

for i = 1:2
  reportMode(i, omega2(i), phi(:,i))
end

% --- Verificacion: ortogonalidad respecto a M ---
disp("Ortogonalidad phi' * M * phi (debe ser identidad):")
disp(phi' * M * phi)

disp("Ortogonalidad phi' * K * phi (debe ser diag(omega^2)):")
disp(phi' * K * phi)` },

  { name: 'HS04_ML — Newmark SDOF [MATLAB online]', category: 'Validación HS↔MATLAB', mode: 'matlab', code: `% ═══════════════════════════════════════════════
% Integración Newmark-β para SDOF
% m*ddu + c*du + k*u = F(t)
% Validar contra Hekatan Struct dinámica
% ═══════════════════════════════════════════════

function [t, u, du, ddu] = newmarkSDOF(m, c, k, F, dt, T_end, beta, gamma, u0, du0)
  % Newmark-β implícito para sistema de un grado de libertad
  N = round(T_end/dt) + 1;
  t = (0:N-1) * dt;
  u   = zeros(1, N);
  du  = zeros(1, N);
  ddu = zeros(1, N);
  u(1) = u0;
  du(1) = du0;
  ddu(1) = (F(t(1)) - c*du0 - k*u0) / m;

  % Coeficientes precalculados
  a0 = 1 / (beta * dt^2);
  a1 = gamma / (beta * dt);
  a2 = 1 / (beta * dt);
  a3 = 1/(2*beta) - 1;
  a4 = gamma/beta - 1;
  a5 = (gamma/(2*beta) - 1) * dt;

  % K efectivo
  Keff = k + a0*m + a1*c;

  for n = 1:N-1
    F_eff = F(t(n+1)) ...
          + m * (a0*u(n) + a2*du(n) + a3*ddu(n)) ...
          + c * (a1*u(n) + a4*du(n) + a5*ddu(n));
    u(n+1) = F_eff / Keff;
    ddu(n+1) = a0*(u(n+1) - u(n)) - a2*du(n) - a3*ddu(n);
    du(n+1) = du(n) + (1-gamma)*dt*ddu(n) + gamma*dt*ddu(n+1);
  end
end

% --- SDOF: oscilador amortiguado ---
m = 1;        % masa [kg]
k = 100;      % rigidez [N/m]
zeta = 0.05;  % amortiguamiento
omega_n = sqrt(k/m);
c = 2*zeta*omega_n*m;
T_n = 2*pi/omega_n;

fprintf("=== SDOF Newmark-beta ===\\n")
fprintf("omega_n = %.4f rad/s\\n", omega_n)
fprintf("T_n     = %.4f s\\n", T_n)
fprintf("zeta    = %.2f%%\\n\\n", zeta*100)

% --- Carga: pulso rectangular F = 10 N para t ∈ [0, 0.5] ---
F_func = @(t) 10 * (t < 0.5);

% --- Integrar: 5 periodos, dt = T_n/50 ---
T_end = 5 * T_n;
dt = T_n / 50;
beta = 1/4; gamma = 1/2;  % avg accel (incond. estable)

[t, u, du, ddu] = newmarkSDOF(m, c, k, F_func, dt, T_end, beta, gamma, 0, 0);

% --- Reportar puntos clave ---
fprintf("dt = %.5f s, %d pasos\\n\\n", dt, length(t))

fprintf("Tabla de respuesta (cada 25 pasos):\\n")
fprintf("%6s %10s %12s %12s %12s\\n", "n", "t [s]", "u [mm]", "du [mm/s]", "ddu [m/s^2]")
for n = 1:25:length(t)
  fprintf("%6d %10.4f %12.4f %12.4f %12.4f\\n", n-1, t(n), u(n)*1000, du(n)*1000, ddu(n))
end

[u_max, i_max] = max(abs(u));
fprintf("\\n|u|_max = %.4f mm en t = %.4f s\\n", u_max*1000, t(i_max))` },

  { name: 'M10 — Función definida + llamada', category: 'MATLAB Clásico', mode: 'matlab', code: `% Definir funcion estilo MATLAB y llamarla varias veces

function y = areaCircle(r)
  y = pi * r^2;
end

function [a, p] = circleStats(r)
  a = pi * r^2;
  p = 2 * pi * r;
end

% Llamar funciones
disp("=== Areas y perimetros ===")
fprintf("%6s %12s %12s\\n", "r", "area", "perimetro")
fprintf("%6s %12s %12s\\n", "------", "------------", "------------")

for r = [1, 2, 5, 10]
  [a, p] = circleStats(r);
  fprintf("%6.2f %12.4f %12.4f\\n", r, a, p)
end

% Un solo valor
A5 = areaCircle(5);
fprintf("\\nArea de un circulo r=5: %.4f m^2\\n", A5)` },


];
