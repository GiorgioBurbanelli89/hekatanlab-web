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

];
