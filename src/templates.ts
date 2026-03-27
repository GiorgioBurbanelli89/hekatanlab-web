// ═══════════════════════════════════════════
// HékatanLab Web — Templates
// Libro: Métodos Matriciales con MATLAB (Herrera)
// + Mecánica Computacional + FEM
// ═══════════════════════════════════════════

export interface Template {
  name: string;
  category: string;
  code: string;
}

export const TEMPLATES: Template[] = [
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

% Fila 2
fila2 = A(2, :)

% Columna 3
col3 = A(:, 3)

% Submatriz: filas 1-2, columnas 2-3
sub = A(1:2, 2:3)

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
% B = dN/dx = [dN1/dx, dN2/dx]
% dN1/dx = -1/L,  dN2/dx = 1/L
B = [-1/L, 1/L]

% ══ PASO 3: B'*B (producto exterior) ══
BtB = transpose(B) * B

% ══ PASO 4: Rigidez K = integral(B'*E*A*B dx, 0, L) ══
% Como B es constante, integral = B'*E*A*B * L
K = E * A * L * BtB

% Verificar: K = EA/L * [1,-1; -1,1]
disp("K = EA/L * [1,-1; -1,1] ?")
K_check = E * A / L * [1, -1; -1, 1]

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
surf(xg, yg, Z, "Sombrero mexicano")` },

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

  { name: 'FEM — Placa Delaunay (Shewchuk)', category: 'FEM', code: `% ═══════════════════════════════════════════
% Placa con malla Delaunay (Triangle de Shewchuk)
% Triangulacion automatica de calidad
% ═══════════════════════════════════════════

% Vertices del poligono
points = [0,0,0; 15,0,0; 15,10,0; 0,5,0]

% Poligono (indices 0-based para getMesh)
polygon = [0, 1, 2, 3]

% Generar malla Delaunay (max area = 3, min angle = 30)
[nds, els, bnd] = getMesh(points, polygon, 3, 30)

disp("Nodos generados:")
disp(size(nds, 1))
disp("Triangulos generados:")
disp(size(els, 1))

show3d(nds, els, "Placa Delaunay")

% Propiedades
E = 100; nu = 0.3; t = 1;

% Ensamblaje CST
nNodes = size(nds, 1)
nDof = nNodes * 2
Kg = zeros(nDof, nDof)
nElem = size(els, 1)

for e = range(1, nElem, 1)
  n1 = els(e,1); n2 = els(e,2); n3 = els(e,3);
  Ke = k_cst(E, nu, t, nds(n1,1),nds(n1,2), nds(n2,1),nds(n2,2), nds(n3,1),nds(n3,2));
  d1 = (n1-1)*2; d2 = (n2-1)*2; d3 = (n3-1)*2;
  d = [d1+1,d1+2, d2+1,d2+2, d3+1,d3+2];
  Kg = assemble(Kg, Ke, d);
end

% BC: bordes fijos (nodos del borde)
nBnd = length(bnd)
fixed = [];
for i = range(1, nBnd, 1)
  nb = bnd(i);
  fixed = [fixed, (nb-1)*2+1, (nb-1)*2+2];
end

% Carga: Fy = -3 en todos los nodos
Fv = zeros(nDof, 1)
for i = range(1, nNodes, 1)
  Fv((i-1)*2 + 2) = -3;
end

% Resolver
free = freedofs(nDof, fixed)
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = inv(Kr) * Fr
Uf = fullvec(Ur, free, nDof)

% Deformada
show_deformed(nds, els, Uf, 50, 2, "Deformada Delaunay (50x)")` },

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
show3d(nds, els, "Placa Shell Tri (2x2)")

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
show_deformed(nds, els, Uf, 5, 6, "Deformada Shell (5x)")` },

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

for e = range(1, nElem, 1)
  n1 = els(e,1);
  n2 = els(e,2);
  dx = nds(n2,1) - nds(n1,1);
  dz = nds(n2,3) - nds(n1,3);
  Le = sqrt(dx^2 + dz^2);

  % Rigidez local
  Ke = k_frame2d(E, A, I_sec, Le);

  % Transformacion
  c = dx / Le;
  s = dz / Le;
  T = [c,s,0,0,0,0; -s,c,0,0,0,0; 0,0,1,0,0,0; 0,0,0,c,s,0; 0,0,0,-s,c,0; 0,0,0,0,0,1];

  % Ensamblar Ke_global = T' * Ke * T
  Keg = transpose(T) * Ke * T;
  d = [dofMap(e,1), dofMap(e,2), dofMap(e,3), dofMap(e,4), dofMap(e,5), dofMap(e,6)];
  Kg = assemble(Kg, Keg, d);
end

% Carga: Fx = 10 kN en nodo 2
Fv = zeros(nDof, 1);
Fv(4) = 10

% BC: nodos 1 y 4 empotrados (DOFs 1,2,3,10,11,12)
fixed = [1, 2, 3, 10, 11, 12]
free = freedofs(nDof, fixed)
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = inv(Kr) * Fr
Uf = fullvec(Ur, free, nDof)

% Deformada
show_deformed(nds, els, Uf, 200, 3, "Deformada (200x)")

% ── Fuerzas internas por elemento ──
fAll = zeros(nElem, 6)
for e = range(1, nElem, 1)
  n1 = els(e,1);
  n2 = els(e,2);
  dx = nds(n2,1) - nds(n1,1);
  dz = nds(n2,3) - nds(n1,3);
  Le = sqrt(dx^2 + dz^2);
  Ke = k_frame2d(E, A, I_sec, Le);
  c = dx / Le;
  s = dz / Le;
  T = [c,s,0,0,0,0; -s,c,0,0,0,0; 0,0,1,0,0,0; 0,0,0,c,s,0; 0,0,0,-s,c,0; 0,0,0,0,0,1];
  d = [dofMap(e,1), dofMap(e,2), dofMap(e,3), dofMap(e,4), dofMap(e,5), dofMap(e,6)];
  ue = subvec(Uf, d);
  fLocal = frame_forces(Ke, T, ue);
  fAll(e, 1) = fLocal(1);
  fAll(e, 2) = fLocal(2);
  fAll(e, 3) = fLocal(3);
  fAll(e, 4) = fLocal(4);
  fAll(e, 5) = fLocal(5);
  fAll(e, 6) = fLocal(6);
end

% Extraer N, V, M por elemento → [fi, fj]
Nf = zeros(nElem, 2);
Vf = zeros(nElem, 2);
Mf = zeros(nElem, 2);
for e = range(1, nElem, 1)
  Nf(e,1) = -fAll(e,1);
  Nf(e,2) = fAll(e,4);
  Vf(e,1) = fAll(e,2);
  Vf(e,2) = -fAll(e,5);
  Mf(e,1) = -fAll(e,3);
  Mf(e,2) = fAll(e,6);
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
% Truss Paramétrico (awatif v2.0.0 truss example)
% Cercha Pratt con diagonales alternadas
% Funciones MATLAB desglosadas
% ═══════════════════════════════════════════

% ─────────────────────────────────────────
% Función: generar malla de truss Pratt
% ─────────────────────────────────────────
function [nds] = gen_truss_nodes(span, divs, h)
  dx = span / divs;
  nNodes = 2 * (divs + 1);
  nds = zeros(nNodes, 3);
  for i = range(0, divs, 1)
    nds(i+1, 1) = dx * i;
  end
  for i = range(0, divs, 1)
    nds(divs + 2 + i, 1) = dx * i;
    nds(divs + 2 + i, 3) = h;
  end
end

function [els] = gen_truss_elements(divs)
  nElem = divs * 3 + divs + 1;
  els = zeros(nElem, 2);
  e = 1;
  % Cuerda inferior
  for i = range(1, divs, 1)
    els(e,1) = i; els(e,2) = i+1; e = e+1;
  end
  % Cuerda superior
  for i = range(1, divs, 1)
    els(e,1) = divs+1+i; els(e,2) = divs+2+i; e = e+1;
  end
  % Montantes verticales
  for i = range(1, divs+1, 1)
    els(e,1) = i; els(e,2) = divs+1+i; e = e+1;
  end
  % Diagonales (Pratt)
  for i = range(0, divs-1, 1)
    if i < divs/2
      els(e,1) = i+1; els(e,2) = divs+3+i;
    else
      els(e,1) = divs+2+i; els(e,2) = i+2;
    end
    e = e+1;
  end
end

% ─────────────────────────────────────────
% Función: rigidez de truss 2D
% ─────────────────────────────────────────
function [Ke] = truss2d_Ke(E, A, Le, c, s)
  ke = E * A / Le;
  Kl = ke * [1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0];
  T = [c,s,0,0; -s,c,0,0; 0,0,c,s; 0,0,-s,c];
  Ke = transpose(T) * Kl * T;
end

% ─────────────────────────────────────────
% Función: ensamblaje de truss 2D
% ─────────────────────────────────────────
function [Kg] = assemble_truss2d(nds, els, nElem, nDof, E, A)
  Kg = zeros(nDof, nDof);
  for e = range(1, nElem, 1)
    n1 = els(e,1); n2 = els(e,2);
    dx = nds(n2,1) - nds(n1,1);
    dz = nds(n2,3) - nds(n1,3);
    Le = sqrt(dx^2 + dz^2);
    c = dx/Le; s = dz/Le;
    Ke = truss2d_Ke(E, A, Le, c, s);
    d = [2*n1-1, 2*n1, 2*n2-1, 2*n2];
    Kg = assemble(Kg, Ke, d);
  end
end

% ═══════════════════════════════════════════
% PROGRAMA PRINCIPAL
% ═══════════════════════════════════════════

% Parámetros
span = 15;
divisions = 5;
height = 2;
Emod = 10e6;
Asec = 10e-4;
Pload = 250;

% Generar malla
nds = gen_truss_nodes(span, divisions, height)
els = gen_truss_elements(divisions)
nNodes = size(nds, 1);
nElem = size(els, 1);

show3d(nds, els, "Truss Pratt", [1, divisions+1])

% Ensamblar
nDof = nNodes * 2;
Kg = assemble_truss2d(nds, els, nElem, nDof, Emod, Asec)

% Cargas verticales en nodos inferiores
Fv = zeros(nDof, 1);
for i = range(1, divisions+1, 1)
  Fv(2*i) = -Pload;
end

% BC y solución
fixed = [1, 2, 2*(divisions+1)-1, 2*(divisions+1)]
free = freedofs(nDof, fixed)
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = inv(Kr) * Fr
Uf = fullvec(Ur, free, nDof)

show_deformed(nds, els, Uf, 5, 2, "Deformada (5x)")` },

  { name: 'Awatif — Estructura 3D', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Estructura 3D (awatif v2.0.0 3d-structure)
% Torre con vigas, columnas y diagonales
% Funciones MATLAB desglosadas
% ═══════════════════════════════════════════

% ─────────────────────────────────────────
% Función: generar nodos de torre 3D
% 4 nodos por nivel en esquinas del rectángulo
% ─────────────────────────────────────────
function [nds] = gen_tower_nodes(bx, by, bz, divs)
  nLev = divs + 1;
  nNodes = 4 * nLev;
  nds = zeros(nNodes, 3);
  n = 1;
  for lev = range(0, divs, 1)
    z = bz * lev;
    nds(n,1) = 0;  nds(n,2) = 0;  nds(n,3) = z; n = n+1;
    nds(n,1) = bx; nds(n,2) = 0;  nds(n,3) = z; n = n+1;
    nds(n,1) = bx; nds(n,2) = by; nds(n,3) = z; n = n+1;
    nds(n,1) = 0;  nds(n,2) = by; nds(n,3) = z; n = n+1;
  end
end

% ─────────────────────────────────────────
% Función: generar elementos de torre 3D
% Vigas perimetrales + diagonal por nivel,
% columnas verticales, arriostramientos X
% ─────────────────────────────────────────
function [els] = gen_tower_elements(divs)
  els = zeros(200, 2);
  e = 1;
  % Vigas (niveles 1+)
  for lev = range(1, divs, 1)
    b = lev*4 + 1;
    els(e,1)=b; els(e,2)=b+1; e=e+1;
    els(e,1)=b+1; els(e,2)=b+2; e=e+1;
    els(e,1)=b+2; els(e,2)=b+3; e=e+1;
    els(e,1)=b+3; els(e,2)=b; e=e+1;
    els(e,1)=b; els(e,2)=b+2; e=e+1;
  end
  % Columnas
  for i = range(0, divs-1, 1)
    b = i*4 + 1;
    els(e,1)=b; els(e,2)=b+4; e=e+1;
    els(e,1)=b+1; els(e,2)=b+5; e=e+1;
    els(e,1)=b+2; els(e,2)=b+6; e=e+1;
    els(e,1)=b+3; els(e,2)=b+7; e=e+1;
  end
  % Diagonales (arriostramientos)
  for i = range(0, divs-1, 1)
    b = i*4 + 1;
    els(e,1)=b; els(e,2)=b+5; e=e+1;
    els(e,1)=b+3; els(e,2)=b+6; e=e+1;
    els(e,1)=b; els(e,2)=b+7; e=e+1;
    els(e,1)=b+1; els(e,2)=b+6; e=e+1;
  end
  % Recortar a tamaño real
  nElem = e - 1;
  els_out = zeros(nElem, 2);
  for i = range(1, nElem, 1)
    els_out(i,1) = els(i,1);
    els_out(i,2) = els(i,2);
  end
  els = els_out;
end

% ─────────────────────────────────────────
% Función: rigidez truss 3D global directa
% K = (EA/L) * [l²,lm,ln,...; ...]
% ─────────────────────────────────────────
function [Ke] = truss3d_Ke(E, A, Le, lx, ly, lz)
  ke = E * A / Le;
  Ke = ke * [lx*lx,lx*ly,lx*lz,-lx*lx,-lx*ly,-lx*lz;
             ly*lx,ly*ly,ly*lz,-ly*lx,-ly*ly,-ly*lz;
             lz*lx,lz*ly,lz*lz,-lz*lx,-lz*ly,-lz*lz;
             -lx*lx,-lx*ly,-lx*lz,lx*lx,lx*ly,lx*lz;
             -ly*lx,-ly*ly,-ly*lz,ly*lx,ly*ly,ly*lz;
             -lz*lx,-lz*ly,-lz*lz,lz*lx,lz*ly,lz*lz];
end

% ─────────────────────────────────────────
% Función: ensamblaje truss 3D
% ─────────────────────────────────────────
function [Kg] = assemble_truss3d(nds, els, nDof, E, A)
  nElem = size(els, 1);
  Kg = zeros(nDof, nDof);
  for e = range(1, nElem, 1)
    n1 = els(e,1); n2 = els(e,2);
    dx = nds(n2,1)-nds(n1,1);
    dy = nds(n2,2)-nds(n1,2);
    dz = nds(n2,3)-nds(n1,3);
    Le = sqrt(dx^2 + dy^2 + dz^2);
    Ke = truss3d_Ke(E, A, Le, dx/Le, dy/Le, dz/Le);
    d = [3*n1-2, 3*n1-1, 3*n1, 3*n2-2, 3*n2-1, 3*n2];
    Kg = assemble(Kg, Ke, d);
  end
end

% ═══════════════════════════════════════════
% PROGRAMA PRINCIPAL
% ═══════════════════════════════════════════
bx = 2; by = 2; bz = 2;
divs = 3;
Emod = 100; Asec = 10; loadX = 30;

nds = gen_tower_nodes(bx, by, bz, divs)
els = gen_tower_elements(divs)
nNodes = size(nds, 1)
nElem = size(els, 1)

show3d(nds, els, "Torre 3D", [1,2,3,4])

% Ensamblar K global
nDof = nNodes * 3;
Kg = assemble_truss3d(nds, els, nDof, Emod, Asec)

% Carga Fx en nodo penúltimo
Fv = zeros(nDof, 1);
topNode = nNodes - 1;
Fv(3*topNode - 2) = loadX

% BC: 4 nodos base fijos
fixed = [1,2,3, 4,5,6, 7,8,9, 10,11,12]
free = freedofs(nDof, fixed)
Ur = inv(submat(Kg, free)) * subvec(Fv, free)
Uf = fullvec(Ur, free, nDof)

show_deformed(nds, els, Uf, 50, 3, "Deformada (50x)")` },

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
  nElem = size(els, 1);
  Kg = zeros(nDof, nDof);
  for e = range(1, nElem, 1)
    na=els(e,1); nb=els(e,2); nc=els(e,3);
    Ke = k_cst(E, nu, t, nds(na,1), nds(na,2), nds(nb,1), nds(nb,2), nds(nc,1), nds(nc,2));
    d = [2*na-1, 2*na, 2*nb-1, 2*nb, 2*nc-1, 2*nc];
    Kg = assemble(Kg, Ke, d);
  end
end

% ─────────────────────────────────────────
% Función: DOFs del borde izquierdo (x=0)
% ─────────────────────────────────────────
function [fdofs] = fixed_left_edge(nx, ny)
  fdofs = [];
  for j = range(0, ny, 1)
    n = j*(nx+1) + 1;
    fdofs = [fdofs, 2*n-1, 2*n];
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

  { name: 'Awatif — Zapata + Pedestal', category: 'Awatif', code: `% ═══════════════════════════════════════════
% Zapata con pedestal central
% Shell thin triangular (3 nodos) + Frame (pedestal)
% 6 DOF/nodo — modelo mixto shell + frame
% ═══════════════════════════════════════════

% Propiedades
E = 25e6
nu = 0.2
t_zap = 0.4
L = 2
H = 1.5
P = -200

% ── Nodos [x, y, z] ──
% Malla 2x2 zapata (9 nodos) + tope pedestal (nodo 10)
h = L/2
nodes = [0,0,0; h,0,0; L,0,0; 0,h,0; h,h,0; L,h,0; 0,L,0; h,L,0; L,L,0; h,h,H]
nNodes = 10
nDof = nNodes * 6

% ── Elementos shell (8 triangulos) ──
els_sh = [1,2,5; 1,5,4; 2,3,6; 2,6,5; 4,5,8; 4,8,7; 5,6,9; 5,9,8]
nSh = 8

% ── Elemento frame: nodo 5 → nodo 10 ──
els_fr = [5, 10]

% Visualizar
show3d(nodes, els_sh, "Zapata + Pedestal")

% ── Ensamblar rigidez global ──
Kg = zeros(nDof, nDof)

% Shell elements (18×18 cada uno, 6 DOF/nodo)
for e = range(1, nSh, 1)
  na = els_sh(e,1)
  nb = els_sh(e,2)
  nc = els_sh(e,3)
  xa = nodes(na,1)
  ya = nodes(na,2)
  xb = nodes(nb,1)
  yb = nodes(nb,2)
  xc = nodes(nc,1)
  yc = nodes(nc,2)
  Ke = k_shell_tri(E, nu, t_zap, xa, ya, xb, yb, xc, yc)
  d = [6*na-5,6*na-4,6*na-3,6*na-2,6*na-1,6*na, 6*nb-5,6*nb-4,6*nb-3,6*nb-2,6*nb-1,6*nb, 6*nc-5,6*nc-4,6*nc-3,6*nc-2,6*nc-1,6*nc]
  Kg = assemble(Kg, Ke, d)
end

% Frame element (pedestal vertical) — 12×12
A_ped = 0.09
I_ped = 6.75e-4
J_ped = 1.35e-3
G_ped = E / (2*(1+nu))
Ke_fr = k_frame3d(E, G_ped, A_ped, I_ped, I_ped, J_ped, H)
% Columna vertical: vUp debe ser perpendicular al eje Z → usar (1,0,0)
T_fr = T3d(0, 0, H, 1, 0, 0)
Ke_fr_g = transpose(T_fr) * Ke_fr * T_fr
d_fr = [25,26,27,28,29,30, 55,56,57,58,59,60]
Kg = assemble(Kg, Ke_fr_g, d_fr)

% ── Cargas: P en nodo 10, dirección -Z ──
Fv = zeros(nDof, 1)
Fv(57) = P

% ── Condiciones de borde ──
% Nodos 1-9: uz=0 (suelo)
% Esquinas 1,3,7,9: empotrado total
fixed = [1,2,3,4,5,6, 9,13,14,15,16,17,18, 21,27,33,37,38,39,40,41,42, 45,49,50,51,52,53,54]

% Resolver
free = freedofs(nDof, fixed)
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = Kr \\ Fr
Uf = fullvec(Ur, free, nDof)

% ── Resultados ──
disp("Uz tope pedestal (nodo 10):")
disp(Uf(57))

% Reacciones
R = Kg * Uf
disp("Suma reacciones Rz:")
Rz_total = R(3)+R(9)+R(15)+R(21)+R(27)+R(33)+R(39)+R(45)+R(51)
disp(Rz_total)` },

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
];
