// ── FEM Library — Pure MATLAB functions ──
// These are MATLAB-readable functions that get pre-loaded into the engine.
// The user can see them in the 📚 panel and understand every line.

export interface MatlabFunction {
  name: string;
  params: string[];
  body: string;
  description: string;
}

export const femMatlabLibrary: MatlabFunction[] = [

  // ═══════════════════════════════════════
  // STIFFNESS MATRICES
  // ═══════════════════════════════════════

  {
    name: 'k_truss2d',
    params: ['E', 'A', 'L'],
    description: 'Truss 2D: rigidez local 4x4 (axial)',
    body: `k = E * A / L
K = k * [1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0]`
  },

  {
    name: 'k_frame2d',
    params: ['E', 'A', 'I', 'L'],
    description: 'Frame 2D: rigidez local 6x6 (axial + flexion)',
    body: `ea = E * A / L
ei = E * I
L2 = L^2
L3 = L^3
K = [ea, 0, 0, -ea, 0, 0;
     0, 12*ei/L3, 6*ei/L2, 0, -12*ei/L3, 6*ei/L2;
     0, 6*ei/L2, 4*ei/L, 0, -6*ei/L2, 2*ei/L;
     -ea, 0, 0, ea, 0, 0;
     0, -12*ei/L3, -6*ei/L2, 0, 12*ei/L3, -6*ei/L2;
     0, 6*ei/L2, 2*ei/L, 0, -6*ei/L2, 4*ei/L]`
  },

  {
    name: 'k_frame3d',
    params: ['E', 'G', 'A', 'Iy', 'Iz', 'J', 'L'],
    description: 'Frame 3D: rigidez local 12x12 (Euler-Bernoulli)',
    body: `ea = E*A/L
gj = G*J/L
eiz = E*Iz
eiy = E*Iy
L2 = L^2
L3 = L^3
K = zeros(12, 12)
% Axial
K(1,1) = ea; K(1,7) = -ea; K(7,1) = -ea; K(7,7) = ea
% Torsion
K(4,4) = gj; K(4,10) = -gj; K(10,4) = -gj; K(10,10) = gj
% Flexion Z (plano XY): v, theta_z
K(2,2) = 12*eiz/L3; K(2,6) = 6*eiz/L2; K(2,8) = -12*eiz/L3; K(2,12) = 6*eiz/L2
K(6,2) = 6*eiz/L2; K(6,6) = 4*eiz/L; K(6,8) = -6*eiz/L2; K(6,12) = 2*eiz/L
K(8,2) = -12*eiz/L3; K(8,6) = -6*eiz/L2; K(8,8) = 12*eiz/L3; K(8,12) = -6*eiz/L2
K(12,2) = 6*eiz/L2; K(12,6) = 2*eiz/L; K(12,8) = -6*eiz/L2; K(12,12) = 4*eiz/L
% Flexion Y (plano XZ): w, theta_y
K(3,3) = 12*eiy/L3; K(3,5) = -6*eiy/L2; K(3,9) = -12*eiy/L3; K(3,11) = -6*eiy/L2
K(5,3) = -6*eiy/L2; K(5,5) = 4*eiy/L; K(5,9) = 6*eiy/L2; K(5,11) = 2*eiy/L
K(9,3) = -12*eiy/L3; K(9,5) = 6*eiy/L2; K(9,9) = 12*eiy/L3; K(9,11) = 6*eiy/L2
K(11,3) = -6*eiy/L2; K(11,5) = 2*eiy/L; K(11,9) = 6*eiy/L2; K(11,11) = 4*eiy/L`
  },

  // ═══════════════════════════════════════
  // TRANSFORMATION MATRICES
  // ═══════════════════════════════════════

  {
    name: 'T2d',
    params: ['c', 's'],
    description: 'Transformacion 2D: 6x6 con cosenos directores',
    body: `T = [c,s,0,0,0,0; -s,c,0,0,0,0; 0,0,1,0,0,0; 0,0,0,c,s,0; 0,0,0,-s,c,0; 0,0,0,0,0,1]`
  },

  {
    name: 'T2d_truss',
    params: ['c', 's'],
    description: 'Transformacion 2D truss: 4x4 con cosenos directores',
    body: `T = [c,s,0,0; -s,c,0,0; 0,0,c,s; 0,0,-s,c]`
  },

  // ═══════════════════════════════════════
  // CST ELEMENT
  // ═══════════════════════════════════════

  {
    name: 'k_cst',
    params: ['E', 'nu', 't', 'x1', 'y1', 'x2', 'y2', 'x3', 'y3'],
    description: 'CST: rigidez 6x6 triangulo plane stress',
    body: `% Area del triangulo
A2 = abs((x2-x1)*(y3-y1) - (x3-x1)*(y2-y1))
Area = A2 / 2
% Matriz B (strain-displacement)
b1 = y2-y3; b2 = y3-y1; b3 = y1-y2
c1 = x3-x2; c2 = x1-x3; c3 = x2-x1
B = [b1,0,b2,0,b3,0; 0,c1,0,c2,0,c3; c1,b1,c2,b2,c3,b3]
% Matriz D (constitutiva, plane stress)
coeff = E / (1 - nu^2)
D = [coeff, coeff*nu, 0; coeff*nu, coeff, 0; 0, 0, coeff*(1-nu)/2]
% K = t/(4*A) * B' * D * B
factor = t / (4 * Area)
K = factor * transpose(B) * D * B`
  },

  // ═══════════════════════════════════════
  // MESH GENERATION
  // ═══════════════════════════════════════

  {
    name: 'meshRect_nodes',
    params: ['Lx', 'Ly', 'nx', 'ny'],
    description: 'Malla rectangular: genera nodos (nx+1)*(ny+1)',
    body: `dxx = Lx / nx
dyy = Ly / ny
nNodes = (nx+1) * (ny+1)
nds = zeros(nNodes, 3)
n = 1
for j = range(0, ny, 1)
  for i = range(0, nx, 1)
    nds(n, 1) = i * dxx
    nds(n, 2) = j * dyy
    n = n + 1
  end
end`
  },

  {
    name: 'meshRect_cst',
    params: ['nx', 'ny'],
    description: 'Malla rectangular: genera elementos CST (2 triangulos/cuadro)',
    body: `nElem = nx * ny * 2
els = zeros(nElem, 3)
e = 1
for j = range(0, ny-1, 1)
  for i = range(0, nx-1, 1)
    n1 = j*(nx+1) + i + 1
    n2 = n1 + 1
    n3 = n1 + nx + 1
    n4 = n3 + 1
    els(e,1) = n1; els(e,2) = n2; els(e,3) = n4; e = e + 1
    els(e,1) = n1; els(e,2) = n4; els(e,3) = n3; e = e + 1
  end
end`
  },

  // ═══════════════════════════════════════
  // TRUSS/TOWER GENERATORS
  // ═══════════════════════════════════════

  {
    name: 'gen_truss_nodes',
    params: ['span', 'divs', 'h'],
    description: 'Truss Pratt: genera nodos (inferior + superior)',
    body: `dx = span / divs
nNodes = 2 * (divs + 1)
nds = zeros(nNodes, 3)
for i = range(0, divs, 1)
  nds(i+1, 1) = dx * i
end
for i = range(0, divs, 1)
  nds(divs+2+i, 1) = dx * i
  nds(divs+2+i, 3) = h
end`
  },

  {
    name: 'gen_truss_elements',
    params: ['divs'],
    description: 'Truss Pratt: genera elementos (inferior, superior, montantes, diagonales)',
    body: `nElem = divs*3 + divs + 1
els = zeros(nElem, 2)
e = 1
% Cuerda inferior
for i = range(1, divs, 1)
  els(e,1) = i; els(e,2) = i+1; e = e+1
end
% Cuerda superior
for i = range(1, divs, 1)
  els(e,1) = divs+1+i; els(e,2) = divs+2+i; e = e+1
end
% Montantes
for i = range(1, divs+1, 1)
  els(e,1) = i; els(e,2) = divs+1+i; e = e+1
end
% Diagonales (Pratt)
for i = range(0, divs-1, 1)
  if i < divs/2
    els(e,1) = i+1; els(e,2) = divs+3+i
  else
    els(e,1) = divs+2+i; els(e,2) = i+2
  end
  e = e+1
end`
  },

  {
    name: 'gen_tower_nodes',
    params: ['bx', 'by', 'bz', 'divs'],
    description: 'Torre 3D: genera nodos (4 por nivel)',
    body: `nLev = divs + 1
nNodes = 4 * nLev
nds = zeros(nNodes, 3)
n = 1
for lev = range(0, divs, 1)
  z = bz * lev
  nds(n,1) = 0; nds(n,2) = 0; nds(n,3) = z; n = n+1
  nds(n,1) = bx; nds(n,2) = 0; nds(n,3) = z; n = n+1
  nds(n,1) = bx; nds(n,2) = by; nds(n,3) = z; n = n+1
  nds(n,1) = 0; nds(n,2) = by; nds(n,3) = z; n = n+1
end`
  },

  {
    name: 'gen_tower_elements',
    params: ['divs'],
    description: 'Torre 3D: genera elementos (vigas, columnas, diagonales)',
    body: `els = zeros(200, 2)
e = 1
% Vigas por nivel
for lev = range(1, divs, 1)
  b = lev*4 + 1
  els(e,1)=b; els(e,2)=b+1; e=e+1
  els(e,1)=b+1; els(e,2)=b+2; e=e+1
  els(e,1)=b+2; els(e,2)=b+3; e=e+1
  els(e,1)=b+3; els(e,2)=b; e=e+1
  els(e,1)=b; els(e,2)=b+2; e=e+1
end
% Columnas
for i = range(0, divs-1, 1)
  b = i*4 + 1
  els(e,1)=b; els(e,2)=b+4; e=e+1
  els(e,1)=b+1; els(e,2)=b+5; e=e+1
  els(e,1)=b+2; els(e,2)=b+6; e=e+1
  els(e,1)=b+3; els(e,2)=b+7; e=e+1
end
% Diagonales
for i = range(0, divs-1, 1)
  b = i*4 + 1
  els(e,1)=b; els(e,2)=b+5; e=e+1
  els(e,1)=b+3; els(e,2)=b+6; e=e+1
  els(e,1)=b; els(e,2)=b+7; e=e+1
  els(e,1)=b+1; els(e,2)=b+6; e=e+1
end
nElem = e - 1
els_out = zeros(nElem, 2)
for i = range(1, nElem, 1)
  els_out(i,1) = els(i,1)
  els_out(i,2) = els(i,2)
end
els = els_out`
  },

  // ═══════════════════════════════════════
  // ASSEMBLY HELPERS
  // ═══════════════════════════════════════

  {
    name: 'truss2d_Ke',
    params: ['E', 'A', 'Le', 'c', 's'],
    description: 'Truss 2D: rigidez global 4x4 (con transformacion)',
    body: `ke = E * A / Le
Kl = ke * [1,0,-1,0; 0,0,0,0; -1,0,1,0; 0,0,0,0]
T = [c,s,0,0; -s,c,0,0; 0,0,c,s; 0,0,-s,c]
Ke = transpose(T) * Kl * T`
  },

  {
    name: 'truss3d_Ke',
    params: ['E', 'A', 'Le', 'lx', 'ly', 'lz'],
    description: 'Truss 3D: rigidez global 6x6 directa',
    body: `ke = E * A / Le
Ke = ke * [lx*lx,lx*ly,lx*lz,-lx*lx,-lx*ly,-lx*lz;
           ly*lx,ly*ly,ly*lz,-ly*lx,-ly*ly,-ly*lz;
           lz*lx,lz*ly,lz*lz,-lz*lx,-lz*ly,-lz*lz;
           -lx*lx,-lx*ly,-lx*lz,lx*lx,lx*ly,lx*lz;
           -ly*lx,-ly*ly,-ly*lz,ly*lx,ly*ly,ly*lz;
           -lz*lx,-lz*ly,-lz*lz,lz*lx,lz*ly,lz*lz]`
  },

  {
    name: 'fixed_left_edge',
    params: ['nx', 'ny'],
    description: 'DOFs fijos del borde izquierdo (x=0) para 2 DOF/nodo',
    body: `fdofs = []
for j = range(0, ny, 1)
  n = j*(nx+1) + 1
  fdofs = [fdofs, 2*n-1, 2*n]
end`
  },

  // ═══════════════════════════════════════
  // SHELL TRIANGULAR 18×18 (awatif C++ → MATLAB)
  // Membrana con drilling DOF + DKT bending + cell-smoothed shear
  // 3 nodos × 6 DOF/nodo = 18 DOF
  // DOFs por nodo: [ux, uy, uz, θx, θy, θz]
  // ═══════════════════════════════════════

  {
    name: 'buildIsoDb',
    params: ['E', 'nu', 't'],
    description: 'Matriz constitutiva flexion isotropica Db (3x3)',
    body: `factor = (E * t^3) / (12 * (1 - nu^2))
Db = factor * [1, nu, 0; nu, 1, 0; 0, 0, (1-nu)/2]`
  },

  {
    name: 'buildIsoDs',
    params: ['E', 'nu', 't'],
    description: 'Matriz constitutiva corte isotropica Ds (2x2)',
    body: `ks = 5/6
qs = E / (2 * (1 + nu))
Ds = [ks*qs*t, 0; 0, ks*qs*t]`
  },

  {
    name: 'buildIsoQm',
    params: ['E', 'nu'],
    description: 'Matriz constitutiva membrana isotropica Q (3x3)',
    body: `q1 = E / (1 - nu^2)
Q = [q1, q1*nu, 0; q1*nu, q1, 0; 0, 0, q1*(1-nu)/2]`
  },

  {
    name: 'shell_bending_B',
    params: ['x1','y1','x2','y2','x3','y3'],
    description: 'Matriz B de deformacion-flexion (3x18) para shell triangular',
    body: `x21 = x2-x1; x31 = x3-x1; x32 = x3-x2
y23 = y2-y3; y31 = y3-y1; y12 = y1-y2
Ae = 0.5 * (x21*y31 - x31*(-y12))
dNdx1 = y23/(2*Ae); dNdy1 = x32/(2*Ae)
dNdx2 = y31/(2*Ae); dNdy2 = -x31/(2*Ae)
dNdx3 = y12/(2*Ae); dNdy3 = x21/(2*Ae)
Bb = zeros(3, 18)
% theta_y contribuye a kappa_xx
Bb(1,5) = dNdx1; Bb(1,11) = dNdx2; Bb(1,17) = dNdx3
% -theta_x contribuye a kappa_yy
Bb(2,4) = -dNdy1; Bb(2,10) = -dNdy2; Bb(2,16) = -dNdy3
% kappa_xy
Bb(3,4) = -dNdx1; Bb(3,5) = dNdy1
Bb(3,10) = -dNdx2; Bb(3,11) = dNdy2
Bb(3,16) = -dNdx3; Bb(3,17) = dNdy3`
  },

  {
    name: 'shell_shear_B',
    params: ['x1','y1','x2','y2','x3','y3'],
    description: 'Matriz B de deformacion-corte cell-smoothed (2x18) para shell triangular',
    body: `% Coordenadas del centroide
cx = (x1+x2+x3)/3; cy = (y1+y2+y3)/3
Ae_main = 0.5*((x2-x1)*(y3-y1) - (x3-x1)*(-(y1-y2)))
% 3 sub-triangulos: centroide + pares de nodos
% Sub-tri 1: (cx,cy), (x1,y1), (x2,y2)
% Sub-tri 2: (cx,cy), (x2,y2), (x3,y3)
% Sub-tri 3: (cx,cy), (x3,y3), (x1,y1)
Bs = zeros(2, 18)
t3 = 1/3
% Para cada sub-triangulo, calcular cell-smoothing terms
% Sub-tri 1
X1s = [cx,x1,x2]; Y1s = [cy,y1,y2]
sx21 = X1s(2)-X1s(1); sx13 = X1s(1)-X1s(3); sy31 = Y1s(3)-Y1s(1); sy12 = Y1s(1)-Y1s(2); sx32 = X1s(3)-X1s(2); sy23 = Y1s(2)-Y1s(3)
Ae1 = 0.5*(sx21*sy31 - sx13*sy12)
a1_1 = 0.5*sy12*sx13; a2_1 = 0.5*sy31*sx21; a3_1 = 0.5*sx21*sx13; a4_1 = 0.5*sy12*sy31
bs1_1 = zeros(2,6); bs2_1 = zeros(2,6); bs3_1 = zeros(2,6)
bs1_1(1,3) = 0.5*sx32/Ae1; bs1_1(1,4) = -0.5; bs1_1(2,3) = 0.5*sy23/Ae1; bs1_1(2,5) = 0.5
bs2_1(1,3) = 0.5*sx13/Ae1; bs2_1(1,4) = 0.5*a1_1/Ae1; bs2_1(1,5) = 0.5*a3_1/Ae1
bs2_1(2,3) = 0.5*sy31/Ae1; bs2_1(2,4) = 0.5*a4_1/Ae1; bs2_1(2,5) = 0.5*a2_1/Ae1
bs3_1(1,3) = 0.5*sx21/Ae1; bs3_1(1,4) = -0.5*a2_1/Ae1; bs3_1(1,5) = -0.5*a3_1/Ae1
bs3_1(2,3) = 0.5*sy12/Ae1; bs3_1(2,4) = -0.5*a4_1/Ae1; bs3_1(2,5) = -0.5*a1_1/Ae1
B1 = zeros(2,18)
for ii = range(1,6,1)
  B1(1,ii) = t3*bs1_1(1,ii) + bs2_1(1,ii); B1(1,ii+6) = t3*bs1_1(1,ii) + bs3_1(1,ii); B1(1,ii+12) = t3*bs1_1(1,ii)
  B1(2,ii) = t3*bs1_1(2,ii) + bs2_1(2,ii); B1(2,ii+6) = t3*bs1_1(2,ii) + bs3_1(2,ii); B1(2,ii+12) = t3*bs1_1(2,ii)
end
B1 = B1 * Ae1
% Sub-tri 2
X2s = [cx,x2,x3]; Y2s = [cy,y2,y3]
sx21b = X2s(2)-X2s(1); sx13b = X2s(1)-X2s(3); sy31b = Y2s(3)-Y2s(1); sy12b = Y2s(1)-Y2s(2); sx32b = X2s(3)-X2s(2); sy23b = Y2s(2)-Y2s(3)
Ae2 = 0.5*(sx21b*sy31b - sx13b*sy12b)
a1_2 = 0.5*sy12b*sx13b; a2_2 = 0.5*sy31b*sx21b; a3_2 = 0.5*sx21b*sx13b; a4_2 = 0.5*sy12b*sy31b
bs1_2 = zeros(2,6); bs2_2 = zeros(2,6); bs3_2 = zeros(2,6)
bs1_2(1,3) = 0.5*sx32b/Ae2; bs1_2(1,4) = -0.5; bs1_2(2,3) = 0.5*sy23b/Ae2; bs1_2(2,5) = 0.5
bs2_2(1,3) = 0.5*sx13b/Ae2; bs2_2(1,4) = 0.5*a1_2/Ae2; bs2_2(1,5) = 0.5*a3_2/Ae2
bs2_2(2,3) = 0.5*sy31b/Ae2; bs2_2(2,4) = 0.5*a4_2/Ae2; bs2_2(2,5) = 0.5*a2_2/Ae2
bs3_2(1,3) = 0.5*sx21b/Ae2; bs3_2(1,4) = -0.5*a2_2/Ae2; bs3_2(1,5) = -0.5*a3_2/Ae2
bs3_2(2,3) = 0.5*sy12b/Ae2; bs3_2(2,4) = -0.5*a4_2/Ae2; bs3_2(2,5) = -0.5*a1_2/Ae2
B2 = zeros(2,18)
for ii = range(1,6,1)
  B2(1,ii) = t3*bs1_2(1,ii); B2(1,ii+6) = t3*bs1_2(1,ii) + bs2_2(1,ii); B2(1,ii+12) = t3*bs1_2(1,ii) + bs3_2(1,ii)
  B2(2,ii) = t3*bs1_2(2,ii); B2(2,ii+6) = t3*bs1_2(2,ii) + bs2_2(2,ii); B2(2,ii+12) = t3*bs1_2(2,ii) + bs3_2(2,ii)
end
B2 = B2 * Ae2
% Sub-tri 3
X3s = [cx,x3,x1]; Y3s = [cy,y3,y1]
sx21c = X3s(2)-X3s(1); sx13c = X3s(1)-X3s(3); sy31c = Y3s(3)-Y3s(1); sy12c = Y3s(1)-Y3s(2); sx32c = X3s(3)-X3s(2); sy23c = Y3s(2)-Y3s(3)
Ae3 = 0.5*(sx21c*sy31c - sx13c*sy12c)
a1_3 = 0.5*sy12c*sx13c; a2_3 = 0.5*sy31c*sx21c; a3_3 = 0.5*sx21c*sx13c; a4_3 = 0.5*sy12c*sy31c
bs1_3 = zeros(2,6); bs2_3 = zeros(2,6); bs3_3 = zeros(2,6)
bs1_3(1,3) = 0.5*sx32c/Ae3; bs1_3(1,4) = -0.5; bs1_3(2,3) = 0.5*sy23c/Ae3; bs1_3(2,5) = 0.5
bs2_3(1,3) = 0.5*sx13c/Ae3; bs2_3(1,4) = 0.5*a1_3/Ae3; bs2_3(1,5) = 0.5*a3_3/Ae3
bs2_3(2,3) = 0.5*sy31c/Ae3; bs2_3(2,4) = 0.5*a4_3/Ae3; bs2_3(2,5) = 0.5*a2_3/Ae3
bs3_3(1,3) = 0.5*sx21c/Ae3; bs3_3(1,4) = -0.5*a2_3/Ae3; bs3_3(1,5) = -0.5*a3_3/Ae3
bs3_3(2,3) = 0.5*sy12c/Ae3; bs3_3(2,4) = -0.5*a4_3/Ae3; bs3_3(2,5) = -0.5*a1_3/Ae3
B3 = zeros(2,18)
for ii = range(1,6,1)
  B3(1,ii) = t3*bs1_3(1,ii) + bs3_3(1,ii); B3(1,ii+6) = t3*bs1_3(1,ii); B3(1,ii+12) = t3*bs1_3(1,ii) + bs2_3(1,ii)
  B3(2,ii) = t3*bs1_3(2,ii) + bs3_3(2,ii); B3(2,ii+6) = t3*bs1_3(2,ii); B3(2,ii+12) = t3*bs1_3(2,ii) + bs2_3(2,ii)
end
B3 = B3 * Ae3
% Combinar
for ii = range(1,2,1)
  for jj = range(1,18,1)
    Bs(ii,jj) = (B1(ii,jj) + B2(ii,jj) + B3(ii,jj)) / Ae_main
  end
end`
  },

  {
    name: 'shell_membrane_K9',
    params: ['x1','y1','x2','y2','x3','y3','E','nu','t'],
    description: 'Membrana con drilling DOF alpha=1/8 (9x9) para shell triangular',
    body: `% Matriz constitutiva membrana
q1 = E / (1 - nu^2)
Qm = [q1, q1*nu, 0; q1*nu, q1, 0; 0, 0, q1*(1-nu)/2]
alpha = 1/8
ab = alpha / 6
b0 = alpha^2 / 4
x12=x1-x2; x23=x2-x3; x31=x3-x1; y12=y1-y2; y23=y2-y3; y31=y3-y1
x21=-x12; x32=-x23; x13=-x31; y21=-y12; y32=-y23; y13=-y31
Ae = 0.5*(x21*y31 - x31*(-y12))
A2 = 2*Ae; A4 = 4*Ae; h2 = 0.5*t; vol = Ae*t
LL21 = x21^2+y21^2; LL32 = x32^2+y32^2; LL13 = x13^2+y13^2
% L matrix (9x3)
Lm = zeros(9,3)
Lm(1,1)=h2*y23; Lm(1,3)=h2*x32
Lm(2,2)=h2*x32; Lm(2,3)=h2*y23
Lm(3,1)=h2*y23*(y13-y21)*ab; Lm(3,2)=h2*x32*(x31-x12)*ab; Lm(3,3)=h2*(x31*y13-x12*y21)*2*ab
Lm(4,1)=h2*y31; Lm(4,3)=h2*x13
Lm(5,2)=h2*x13; Lm(5,3)=h2*y31
Lm(6,1)=h2*y31*(y21-y32)*ab; Lm(6,2)=h2*x13*(x12-x23)*ab; Lm(6,3)=h2*(x12*y21-x23*y32)*2*ab
Lm(7,1)=h2*y12; Lm(7,3)=h2*x21
Lm(8,2)=h2*x21; Lm(8,3)=h2*y12
Lm(9,1)=h2*y12*(y32-y13)*ab; Lm(9,2)=h2*x21*(x23-x31)*ab; Lm(9,3)=h2*(x23*y32-x31*y13)*2*ab
Kb9 = Lm * Qm * transpose(Lm) / vol
% T0 matrix (3x9)
T0 = zeros(3,9)
T0(1,1)=x32/A4; T0(1,2)=y32/A4; T0(1,3)=1; T0(1,4)=x13/A4; T0(1,5)=y13/A4; T0(1,7)=x21/A4; T0(1,8)=y21/A4
T0(2,1)=x32/A4; T0(2,2)=y32/A4; T0(2,4)=x13/A4; T0(2,5)=y13/A4; T0(2,6)=1; T0(2,7)=x21/A4; T0(2,8)=y21/A4
T0(3,1)=x32/A4; T0(3,2)=y32/A4; T0(3,4)=x13/A4; T0(3,5)=y13/A4; T0(3,7)=x21/A4; T0(3,8)=y21/A4; T0(3,9)=1
% Te matrix (3x3)
A14 = 1/(Ae*A4)
Te = zeros(3,3)
Te(1,1)=A14*y23*y13*LL21; Te(1,2)=A14*y31*y21*LL32; Te(1,3)=A14*y12*y32*LL13
Te(2,1)=A14*x23*x13*LL21; Te(2,2)=A14*x31*x21*LL32; Te(2,3)=A14*x12*x32*LL13
Te(3,1)=A14*(y23*x31+x32*y13)*LL21; Te(3,2)=A14*(y31*x12+x13*y21)*LL32; Te(3,3)=A14*(y12*x23+x21*y32)*LL13
% Q matrices (3x3) para higher order
A14b = A2/3
Q1 = zeros(3,3); Q2 = zeros(3,3); Q3 = zeros(3,3)
Q1(1,1)=A14b*1/LL21; Q1(1,2)=A14b*2/LL21; Q1(1,3)=A14b*1/LL21
Q1(2,1)=A14b*0/LL32; Q1(2,2)=A14b*1/LL32; Q1(2,3)=A14b*(-1)/LL32
Q1(3,1)=A14b*(-1)/LL13; Q1(3,2)=A14b*(-1)/LL13; Q1(3,3)=A14b*(-2)/LL13
Q2(1,1)=A14b*(-2)/LL21; Q2(1,2)=A14b*(-1)/LL21; Q2(1,3)=A14b*(-1)/LL21
Q2(2,1)=A14b*1/LL32; Q2(2,2)=A14b*1/LL32; Q2(2,3)=A14b*2/LL32
Q2(3,1)=A14b*(-1)/LL13; Q2(3,2)=A14b*0/LL13; Q2(3,3)=A14b*1/LL13
Q3(1,1)=A14b*1/LL21; Q3(1,2)=A14b*(-1)/LL21; Q3(1,3)=A14b*0/LL21
Q3(2,1)=A14b*(-1)/LL32; Q3(2,2)=A14b*(-2)/LL32; Q3(2,3)=A14b*(-1)/LL32
Q3(3,1)=A14b*2/LL13; Q3(3,2)=A14b*1/LL13; Q3(3,3)=A14b*1/LL13
Q4 = (Q1+Q2)*0.5; Q5 = (Q2+Q3)*0.5; Q6 = (Q3+Q1)*0.5
Kn = transpose(Te) * Qm * Te
KO = (transpose(Q4)*Kn*Q4 + transpose(Q5)*Kn*Q5 + transpose(Q6)*Kn*Q6) * (0.75*b0*vol)
% Kh = T0' * KO * T0
Kh = transpose(T0) * KO * T0
Km9 = Kb9 + Kh`
  },

  {
    name: 'k_shell_tri',
    params: ['E','nu','t','x1','y1','x2','y2','x3','y3'],
    description: 'Shell triangular 18x18: membrana(9x9) + flexion + corte. 6 DOF/nodo',
    body: `% Matrices constitutivas
Db = buildIsoDb(E, nu, t)
Ds = buildIsoDs(E, nu, t)
% Bending strain-displacement (3x18)
Bb = shell_bending_B(x1,y1,x2,y2,x3,y3)
% Shear strain-displacement (2x18) cell-smoothed
Bs = shell_shear_B(x1,y1,x2,y2,x3,y3)
% Area
Ae = 0.5*((x2-x1)*(y3-y1) - (x3-x1)*(-(y1-y2)))
% Plate bending + shear stiffness (18x18)
Kp = (transpose(Bs)*Ds*Bs + transpose(Bb)*Db*Bb) * Ae
% Membrane stiffness (9x9) con drilling DOF
Km9 = shell_membrane_K9(x1,y1,x2,y2,x3,y3,E,nu,t)
% Ensamblar 18x18: membrana DOFs = [1,2,6, 7,8,12, 13,14,18]
K = Kp
mi = [1,2,6, 7,8,12, 13,14,18]
for r = range(1,9,1)
  for c = range(1,9,1)
    K(mi(r), mi(c)) = K(mi(r), mi(c)) + Km9(r, c)
  end
end`
  },

  // ═══════════════════════════════════════
  // SOLVER UTILITIES (equivalentes a deform.ts)
  // Estas reemplazan las funciones TypeScript ocultas
  // ═══════════════════════════════════════

  // ── Solver utilities (implemented as JS builtins for performance) ──
  // These are shown in the 📚 panel but executed as native JS functions
  {
    name: 'freedofs',
    params: ['nDof', 'fixed'],
    description: '[Builtin JS] DOFs libres: complemento de los fijos',
    body: `% Implementado como builtin JS (rapido)
% Equivalente MATLAB:
% result = []
% for i = 1:nDof
%   if ~any(fixed == i)
%     result = [result, i]
%   end
% end`
  },
  {
    name: 'submat',
    params: ['K', 'dofs'],
    description: '[Builtin JS] Submatriz en DOFs dados',
    body: `% Implementado como builtin JS (rapido)
% Equivalente MATLAB:
% n = length(dofs)
% Ksub = zeros(n,n)
% for i = 1:n
%   for j = 1:n
%     Ksub(i,j) = K(dofs(i), dofs(j))
%   end
% end`
  },
  {
    name: 'subvec',
    params: ['F', 'dofs'],
    description: '[Builtin JS] Subvector en DOFs dados',
    body: `% Implementado como builtin JS (rapido)
% Equivalente: Fsub(i) = F(dofs(i))`
  },
  {
    name: 'fullvec',
    params: ['Ur', 'free', 'nTotal'],
    description: '[Builtin JS] Expandir vector reducido a vector completo',
    body: `% Implementado como builtin JS (rapido)
% Equivalente: Ufull = zeros(nTotal,1); Ufull(free(i)) = Ur(i)`
  },
  {
    name: 'assemble_k',
    params: ['Kg', 'Ke', 'dofs'],
    description: '[Builtin JS] Ensamblaje K global',
    body: `% Implementado como builtin JS = assemble(Kg, Ke, dofs)
% Equivalente: Kg(dofs(i),dofs(j)) += Ke(i,j)`
  },
  {
    name: 'solve_fem',
    params: ['Kg', 'Fv', 'fixed'],
    description: '[Builtin JS] Resolver sistema FEM completo',
    body: `% Implementado como builtin JS (rapido)
% Equivalente:
% free = freedofs(nDof, fixed)
% Kr = submat(Kg, free)
% Fr = subvec(Fv, free)
% Ur = Kr \\ Fr
% Uf = fullvec(Ur, free, nDof)`
  },

  {
    name: 'frame_forces',
    params: ['Ke', 'T', 'ue'],
    description: 'Fuerzas internas: f_local = Ke * T * u_global',
    body: `% Ke = rigidez local, T = transformacion, ue = desplaz. globales del elem.
% Retorna vector de fuerzas en coordenadas locales
u_local = T * ue
f_local = Ke * u_local`
  },

  {
    name: 'solve_fem',
    params: ['Kg', 'Fv', 'fixed'],
    description: 'Solver FEM completo: aplica BC, resuelve, expande (deform.ts en MATLAB)',
    body: `% Kg = rigidez global, Fv = fuerzas, fixed = DOFs fijos
% Retorna: Uf = desplazamientos completos
%
% Esto es EXACTAMENTE lo que hace deform.ts de awatif:
% 1. Identificar DOFs libres
% 2. Extraer submatriz y subvector
% 3. Resolver sistema lineal
% 4. Expandir solucion
nDof = size(Kg, 1)
free = freedofs(nDof, fixed)
Kr = submat(Kg, free)
Fr = subvec(Fv, free)
Ur = inv(Kr) * Fr
Uf = fullvec(Ur, free, nDof)`
  },

  {
    name: 'reactions',
    params: ['Kg', 'Uf'],
    description: 'Reacciones: R = K * U (fuerzas en apoyos)',
    body: `% Kg = rigidez global, Uf = desplazamientos completos
R = Kg * Uf`
  },

  // ═══════════════════════════════════════
  // ANALYZE — Tensiones y fuerzas internas
  // (port de awatif analyze.ts a MATLAB)
  // ═══════════════════════════════════════

  {
    name: 'shell_stress',
    params: ['E', 'nu', 't', 'x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'ue'],
    description: 'Tensiones de membrana y momentos en shell triangular (analyze)',
    body: `% Calcula tensiones de membrana (Nx,Ny,Nxy) y momentos (Mx,My,Mxy)
% ue = vector 18x1 de desplazamientos del elemento
% Retorna: stress = [Nx; Ny; Nxy; Mx; My; Mxy]

% Coordenadas
y23 = y2 - y3; y31 = y3 - y1; y12 = y1 - y2
x32 = x3 - x2; x13 = x1 - x3; x21 = x2 - x1

% Area del triangulo
Area = 0.5 * (x21 * y31 - x31 * (-y12))
x31 = x3 - x1

% Matriz B de campo lineal (3x6) — linearFieldMatrix
Bf = [y23,y31,y12,0,0,0; 0,0,0,x32,x13,x21; x32,x13,x21,y23,y31,y12]

% Desplazamientos de membrana: u1,u2,u3,v1,v2,v3
% y rotaciones theta: -thetay1,-thetay2,-thetay3,thetax1,thetax2,thetax3
u1 = ue(1); u2 = ue(7); u3 = ue(13)
v1 = ue(2); v2 = ue(8); v3 = ue(14)
ty1 = ue(5); ty2 = ue(11); ty3 = ue(17)
tx1 = ue(4); tx2 = ue(10); tx3 = ue(16)
Ud = [u1,-ty1; u2,-ty2; u3,-ty3; v1,tx1; v2,tx2; v3,tx3]

% Matriz constitutiva (plane stress)
D = (E / (1 - nu^2)) * [1,nu,0; nu,1,0; 0,0,(1-nu)/2]

% sigma_and_kappa = (1/(2*Area)) * D * Bf * Ud → 3x2
% col1 = tensiones membrana, col2 = curvaturas
SK = (1 / (2 * Area)) * D * Bf * Ud

% Fuerzas de membrana: N = sigma * t
Nx = SK(1,1) * t; Ny = SK(2,1) * t; Nxy = SK(3,1) * t

% Momentos flectores: M = kappa * t^3/12
Mx = SK(1,2) * (t^3 / 12)
My = SK(2,2) * (t^3 / 12)
Mxy = SK(3,2) * (t^3 / 12)

stress = [Nx; Ny; Nxy; Mx; My; Mxy]`
  },

  {
    name: 'analyze_frame',
    params: ['Ke', 'T', 'ue'],
    description: 'Fuerzas internas frame: N, Vy, Vz, Mx, My, Mz en ambos extremos',
    body: `% Ke = rigidez local 12x12, T = transformacion 12x12, ue = desplaz. globales
% Retorna: fLocal = vector 12x1 de fuerzas locales
% [N1,Vy1,Vz1,Mx1,My1,Mz1, N2,Vy2,Vz2,Mx2,My2,Mz2]
u_local = T * ue
fLocal = Ke * u_local
N = [fLocal(1), fLocal(7)]
Vy = [fLocal(2), fLocal(8)]
Vz = [fLocal(3), fLocal(9)]
Mx = [fLocal(4), fLocal(10)]
My = [fLocal(5), fLocal(11)]
Mz = [fLocal(6), fLocal(12)]`
  },

];
