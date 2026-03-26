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

  // ── Mecánica Computacional ──
  { name: 'FEM — Barra axial', category: 'FEM', code: `% ═══════════════════════════════════════════
% FEM: Barra axial paso a paso
% ═══════════════════════════════════════════

L = 2
E = 210000
A = 0.01

% Rigidez local
k = E * A / L
K = k * [1, -1; -1, 1]

% Carga
q = 5
F_dist = [q * L / 2; q * L / 2]
P = 20

% Resolver (nodo 1 fijo)
K_red = K(2, 2)
F_red = q * L / 2 + P
u2 = F_red / K_red

% Verificación
u_exact = (P * L + q * L^2 / 2) / (E * A)
error_pct = abs(u2 - u_exact) / u_exact * 100

% Reacción y esfuerzo
R1 = -(P + q * L)
sigma = E * u2 / L` },

  { name: 'FEM — 3 resortes', category: 'FEM', code: `% ═══════════════════════════════════════════
% 3 resortes en serie — Assembly paso a paso
% ═══════════════════════════════════════════

k1 = 100
k2 = 200
k3 = 150

% Matrices locales
K1 = [k1, -k1; -k1, k1]
K2 = [k2, -k2; -k2, k2]
K3 = [k3, -k3; -k3, k3]

% Ensamblaje global (4 DOFs)
K = zeros(4, 4)
K(1:2, 1:2) = K(1:2, 1:2) + K1
K(2:3, 2:3) = K(2:3, 2:3) + K2
K(3:4, 3:4) = K(3:4, 3:4) + K3

% BCs: u1=0, u4=0 → reducir a DOFs 2,3
KR = K(2:3, 2:3)
F = [50; 0]
u = inv(KR) * F` },

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

  // ══════════════════════════════════════
  // FEM — Validación
  // ══════════════════════════════════════

  { name: 'FEM — Truss 2D (3 barras)', category: 'FEM', code: `% ═══════════════════════════════════════════
% Truss 2D — 3 barras, validación manual
% ═══════════════════════════════════════════

% Propiedades
E = 200e3;  % MPa
A = 0.01;   % m²

% Nodos (x, y, z)
nds = [0,0,0; 4,0,0; 2,0,3]

% Elementos [nodo_i, nodo_j]
els = [1,3; 2,3; 1,2]

% Visualizar estructura
show3d(nds, els, "Truss 2D — 3 barras", [1,2])

% Longitudes
L1 = sqrt((2-0)^2 + (3-0)^2)
L2 = sqrt((2-4)^2 + (3-0)^2)
L3 = 4

% Ángulos (rad)
th1 = atan2(3, 2)
th2 = atan2(3, -2)
th3 = 0

% K local → K global para truss 2D
% k_global = T' * k_local * T
% DOFs: [u1,v1, u2,v2] por elemento

% Elemento 1: nodo 1→3, DOFs [1,2,5,6]
c1 = cos(th1); s1 = sin(th1)
k1 = E*A/L1
T1 = [c1,s1,0,0; -s1,c1,0,0; 0,0,c1,s1; 0,0,-s1,c1]
Kl1 = k1 * [1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0]
Kg1 = transpose(T1) * Kl1 * T1

% Elemento 2: nodo 2→3, DOFs [3,4,5,6]
c2 = cos(th2); s2 = sin(th2)
k2 = E*A/L2
T2 = [c2,s2,0,0; -s2,c2,0,0; 0,0,c2,s2; 0,0,-s2,c2]
Kl2 = k2 * [1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0]
Kg2 = transpose(T2) * Kl2 * T2

% Elemento 3: nodo 1→2, DOFs [1,2,3,4]
k3 = E*A/L3
Kg3 = k3 * [1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0]

% Ensamblaje K global (6×6)
K = zeros(6,6);
K = assemble(K, Kg1, [1,2,5,6]);
K = assemble(K, Kg2, [3,4,5,6]);
K = assemble(K, Kg3, [1,2,3,4])

% Carga: F3y = -100 kN (nodo 3, DOF 6)
F = [0; 0; 0; 0; 0; -100]

% Condiciones de borde: nodos 1,2 fijos → DOFs 1,2,3,4
free = [5, 6]
Kr = submat(K, free)
Fr = subvec(F, free)

% Resolver
Ur = inv(Kr) * Fr

% Desplazamientos completos
U = fullvec(Ur, free, 6)

% Mostrar deformada (escala 500x)
show_deformed(nds, els, U, 500, 2, "Deformada (500x)")` },

  { name: 'FEM — Pórtico 2D', category: 'FEM', code: `% ═══════════════════════════════════════════
% Pórtico 2D — Frame con carga lateral
% ═══════════════════════════════════════════

% Propiedades
E = 200e3;  % MPa
A = 0.04;   % m²
I = 5e-4;   % m⁴

% Nodos
nds = [0,0,0; 6,0,0; 6,0,4; 0,0,4]

% Elementos
els = [1,2; 2,3; 3,4]

show3d(nds, els, "Pórtico 2D", [1,4])

% K frame 2D local (6×6)
% DOFs: [u, w, θ] por nodo (en plano XZ)

% Elemento 1 (viga): nodo 1→2, L=6, horizontal
Ke1 = k_frame2d(E, A, I, 6)

% Elemento 2 (columna): nodo 2→3, L=4, vertical (θ=90°)
Ke2 = k_frame2d(E, A, I, 4)
Te2 = T2d(pi/2)
Kg2 = transpose(Te2) * Ke2 * Te2

% Elemento 3 (columna): nodo 3→4, L=4, vertical hacia abajo...
% nodo 4 a nodo 3: dx=6,dz=-4 → ángulo
% Mejor: nodo 3→4: dx=-6, dz=0 → horizontal invertido
% Corregir: el pórtico es 1(base-izq)→4(base-der) con 2,3 arriba
% Redefinir:
% nds = [0,0,0; 0,0,4; 6,0,4; 6,0,0] — recorrido antihorario
% els = [1,2; 2,3; 3,4]
% El 1: col izq (vertical), El 2: viga (horizontal), El 3: col der (vertical)

% K global 12 DOFs (3 por nodo × 4 nodos)
K = zeros(12,12);

% Col izq: nodo 1→2, L=4, θ=90°
Kc = k_frame2d(E, A, I, 4)
Tc = T2d(pi/2)
Kc_g = transpose(Tc) * Kc * Tc
K = assemble(K, Kc_g, [1,2,3,4,5,6])

% Viga: nodo 2→3, L=6, θ=0
Kv = k_frame2d(E, A, I, 6)
K = assemble(K, Kv, [4,5,6,7,8,9])

% Col der: nodo 3→4, L=4, θ=-90°
Kc2_g = transpose(T2d(-pi/2)) * Kc * T2d(-pi/2)
K = assemble(K, Kc2_g, [7,8,9,10,11,12])

% Carga lateral: Fx=50 kN en nodo 2
F = zeros(12,1);
F(4) = 50

% BC: nodos 1,4 empotrados → DOFs 1,2,3,10,11,12 = 0
% DOFs libres: 4,5,6,7,8,9
free = [4,5,6,7,8,9]
nds2 = [0,0,0; 0,0,4; 6,0,4; 6,0,0]
els2 = [1,2; 2,3; 3,4]

Kr = submat(K, free)
Fr = subvec(F, free)
Ur = inv(Kr) * Fr
U = fullvec(Ur, free, 12)

% Deformada
show_deformed(nds2, els2, U, 200, 3, "Deformada (200x)")` },

  { name: 'FEM — Nave industrial 3D', category: 'FEM', code: `% ═══════════════════════════════════════════
% Nave industrial 3D — Pórtico de acero
% ═══════════════════════════════════════════

% Dimensiones
Lx = 12;   % luz (m)
Ly = 6;    % separación pórticos (m)
H = 5;     % altura columnas (m)
Hp = 7;    % altura cumbrera (m)

% Nodos (2 pórticos)
nds = [
  0, 0, 0;
  Lx, 0, 0;
  0, 0, H;
  Lx, 0, H;
  Lx/2, 0, Hp;
  0, Ly, 0;
  Lx, Ly, 0;
  0, Ly, H;
  Lx, Ly, H;
  Lx/2, Ly, Hp
]

% Elementos (columnas + vigas inclinadas + correas)
els = [
  1,3;   % col izq pórtico 1
  2,4;   % col der pórtico 1
  3,5;   % viga izq pórtico 1
  4,5;   % viga der pórtico 1
  6,8;   % col izq pórtico 2
  7,9;   % col der pórtico 2
  8,10;  % viga izq pórtico 2
  9,10;  % viga der pórtico 2
  3,8;   % correa izq
  4,9;   % correa der
  5,10   % correa cumbrera
]

show3d(nds, els, "Nave Industrial 3D", [1,2,6,7])` },

  { name: 'FEM — Placa CST', category: 'FEM', code: `% ═══════════════════════════════════════════
% Placa con 2 triángulos CST — Plane stress
% Ejemplo 9.1 (Chandrupatla)
% ═══════════════════════════════════════════

% Material
E = 30e6;    % psi
nu = 0.25;
t = 1;       % thickness

% Nodos
nds = [0,0,0; 2,0,0; 2,1,0; 0,1,0]

% Elementos (2 triángulos)
els = [1,2,3; 1,3,4]

show3d(nds, els, "Placa CST (2 triángulos)", [1,4])

% K elemento 1: nodos 1,2,3
K1 = k_cst(E, nu, t, 0,0, 2,0, 2,1)

% K elemento 2: nodos 1,3,4
K2 = k_cst(E, nu, t, 0,0, 2,1, 0,1)

% Ensamblar (8 DOFs: u1,v1,u2,v2,u3,v3,u4,v4)
K = zeros(8,8);
K = assemble(K, K1, [1,2,3,4,5,6])
K = assemble(K, K2, [1,2,5,6,7,8])

% Cargas: tracción en borde derecho
% Nodos 2,3: Fx = 1000 lb (distribuida)
F = zeros(8,1);
F(3) = 500;   % u2
F(5) = 500;   % u3

% BC: nodo 1 fijo (u1=v1=0), nodo 4: u4=0 (roller)
% DOFs libres: 3,4,5,6,8 (nodo 1 fijo, nodo 4 roller)
free = [3,4,5,6,8]
Kr = submat(K, free)
Fr = subvec(F, free)
Ur = inv(Kr) * Fr
U = fullvec(Ur, free, 8)

% Deformada
show_deformed(nds, els, U, 5e4, 2, "Deformada CST (50000x)")` },
];
