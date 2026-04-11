// ── HékatanLab FEM — Minimal helper functions ──
// Only K_local, T_rotation, assemble. User does the rest in script.
import * as math from 'mathjs';

// ── 2D Truss: 4×4 local stiffness ──
// k_truss2d(E, A, L) → 4×4 in LOCAL coords
export function k_truss2d(E: number, A: number, L: number): math.Matrix {
  const k = E * A / L;
  return math.matrix([
    [ k, 0, -k, 0],
    [ 0, 0,  0, 0],
    [-k, 0,  k, 0],
    [ 0, 0,  0, 0]
  ]);
}

// ── 2D Frame: 6×6 local stiffness ──
// k_frame2d(E, A, I, L) → 6×6 in LOCAL coords
export function k_frame2d(E: number, A: number, I: number, L: number): math.Matrix {
  const ea = E * A / L;
  const ei = E * I;
  const L2 = L * L, L3 = L2 * L;
  return math.matrix([
    [  ea,          0,          0, -ea,          0,          0],
    [   0,  12*ei/L3,   6*ei/L2,   0, -12*ei/L3,   6*ei/L2],
    [   0,   6*ei/L2,   4*ei/L,    0,  -6*ei/L2,   2*ei/L ],
    [ -ea,          0,          0,  ea,          0,          0],
    [   0, -12*ei/L3,  -6*ei/L2,   0,  12*ei/L3,  -6*ei/L2],
    [   0,   6*ei/L2,   2*ei/L,    0,  -6*ei/L2,   4*ei/L ]
  ]);
}

// ── 3D Frame: 12×12 local stiffness ──
// k_frame3d(E, G, A, Iy, Iz, J, L) → 12×12 in LOCAL coords
// DOFs: [u1,v1,w1,θx1,θy1,θz1, u2,v2,w2,θx2,θy2,θz2]
export function k_frame3d(E: number, G: number, A: number,
  Iy: number, Iz: number, J: number, L: number): math.Matrix {
  const ea = E * A / L;
  const gj = G * J / L;
  const eiz = E * Iz, eiy = E * Iy;
  const L2 = L * L, L3 = L2 * L;

  // Initialize 12×12 zeros
  const K = math.zeros(12, 12) as math.Matrix;
  const k = K.toArray() as number[][];

  // Axial
  k[0][0] = ea;   k[0][6] = -ea;
  k[6][0] = -ea;  k[6][6] = ea;

  // Torsion
  k[3][3] = gj;   k[3][9] = -gj;
  k[9][3] = -gj;  k[9][9] = gj;

  // Bending about Z (in XY plane): v, θz
  k[1][1] = 12*eiz/L3;   k[1][5] = 6*eiz/L2;    k[1][7] = -12*eiz/L3;  k[1][11] = 6*eiz/L2;
  k[5][1] = 6*eiz/L2;    k[5][5] = 4*eiz/L;      k[5][7] = -6*eiz/L2;   k[5][11] = 2*eiz/L;
  k[7][1] = -12*eiz/L3;  k[7][5] = -6*eiz/L2;   k[7][7] = 12*eiz/L3;   k[7][11] = -6*eiz/L2;
  k[11][1] = 6*eiz/L2;   k[11][5] = 2*eiz/L;    k[11][7] = -6*eiz/L2;  k[11][11] = 4*eiz/L;

  // Bending about Y (in XZ plane): w, θy
  k[2][2] = 12*eiy/L3;   k[2][4] = -6*eiy/L2;   k[2][8] = -12*eiy/L3;  k[2][10] = -6*eiy/L2;
  k[4][2] = -6*eiy/L2;   k[4][4] = 4*eiy/L;      k[4][8] = 6*eiy/L2;    k[4][10] = 2*eiy/L;
  k[8][2] = -12*eiy/L3;  k[8][4] = 6*eiy/L2;    k[8][8] = 12*eiy/L3;   k[8][10] = 6*eiy/L2;
  k[10][2] = -6*eiy/L2;  k[10][4] = 2*eiy/L;    k[10][8] = 6*eiy/L2;   k[10][10] = 4*eiy/L;

  return math.matrix(k);
}

// ── 2D Rotation: 6×6 transformation ──
// T2d(theta) → 6×6, theta in radians
export function T2d(theta: number): math.Matrix {
  const c = Math.cos(theta), s = Math.sin(theta);
  return math.matrix([
    [ c, s, 0, 0, 0, 0],
    [-s, c, 0, 0, 0, 0],
    [ 0, 0, 1, 0, 0, 0],
    [ 0, 0, 0, c, s, 0],
    [ 0, 0, 0,-s, c, 0],
    [ 0, 0, 0, 0, 0, 1]
  ]);
}

// ── 3D Rotation: 12×12 transformation ──
// T3d(dx, dy, dz, vx, vy, vz) → 12×12
// (dx,dy,dz) = element direction vector, (vx,vy,vz) = local y-axis reference
export function T3d(dx: number, dy: number, dz: number,
  vx: number, vy: number, vz: number): math.Matrix {
  // Local x-axis = element direction
  const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const lx = dx/L, ly = dy/L, lz = dz/L;

  // Local z = cross(local_x, v) normalized
  let zx = ly*vz - lz*vy;
  let zy = lz*vx - lx*vz;
  let zz = lx*vy - ly*vx;
  const zn = Math.sqrt(zx*zx + zy*zy + zz*zz);
  if (zn < 1e-10) {
    // Element parallel to v — use fallback
    if (Math.abs(lz) > 0.9) { vx=1; vy=0; vz=0; }
    else { vx=0; vy=0; vz=1; }
    zx = ly*vz - lz*vy;
    zy = lz*vx - lx*vz;
    zz = lx*vy - ly*vx;
    const zn2 = Math.sqrt(zx*zx + zy*zy + zz*zz);
    zx/=zn2; zy/=zn2; zz/=zn2;
  } else {
    zx/=zn; zy/=zn; zz/=zn;
  }

  // Local y = cross(z, x)
  const mx = zy*lz - zz*ly;
  const my = zz*lx - zx*lz;
  const mz = zx*ly - zy*lx;

  // 3×3 rotation
  const R = [
    [lx, ly, lz],
    [mx, my, mz],
    [zx, zy, zz]
  ];

  // Build 12×12 block diagonal
  const T = math.zeros(12, 12) as math.Matrix;
  const t = T.toArray() as number[][];
  for (let b = 0; b < 4; b++) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        t[b*3+i][b*3+j] = R[i][j];
      }
    }
  }
  return math.matrix(t);
}

// ── Assemble: add Ke into Kg at DOF positions ──
// assemble(Kg, Ke, dofs) → modified Kg
// dofs is 1-based array of global DOF numbers
export function assemble(Kg: math.Matrix, Ke: math.Matrix, dofs: number[]): math.Matrix {
  const kg = Kg.toArray() as number[][];
  const ke = Ke.toArray() as number[][];
  const n = dofs.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const gi = dofs[i] - 1; // 1-based → 0-based
      const gj = dofs[j] - 1;
      if (gi >= 0 && gj >= 0 && gi < kg.length && gj < kg[0].length) {
        kg[gi][gj] += ke[i][j];
      }
    }
  }
  return math.matrix(kg);
}

// ── Space Frame Element with 3-node orientation (Logan Problem 13.1) ──
// Returns GLOBAL 12×12 stiffness: T' * Klocal * T
// coord: [[x1,y1,z1], [x2,y2,z2], [x3,y3,z3]] — 3rd node defines local xy plane
export function space_frame_ke(E: number, G: number, Iz: number, Iy: number,
  J: number, A: number, coord: number[][]): math.Matrix {
  const n1 = coord[0], n2 = coord[1], n3 = coord[2];
  const dx = n2[0]-n1[0], dy = n2[1]-n1[1], dz = n2[2]-n1[2];
  const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const EIz = E*Iz, EIy = E*Iy, GJ = G*J, EA = E*A;
  const L2 = L*L, L3 = L2*L;

  // Local axes from 3-node orientation
  const ex = [dx/L, dy/L, dz/L];
  const v31 = [n3[0]-n1[0], n3[1]-n1[1], n3[2]-n1[2]];
  const v21 = [n2[0]-n1[0], n2[1]-n1[1], n2[2]-n1[2]];
  // ey = cross(n3-n1, n2-n1) normalized
  let eyy = [v31[1]*v21[2]-v31[2]*v21[1], v31[2]*v21[0]-v31[0]*v21[2], v31[0]*v21[1]-v31[1]*v21[0]];
  const eyn = Math.sqrt(eyy[0]*eyy[0]+eyy[1]*eyy[1]+eyy[2]*eyy[2]);
  const ey = [eyy[0]/eyn, eyy[1]/eyn, eyy[2]/eyn];
  // ez = cross(ex, ey)
  const ez = [ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0]];

  // H = [ex; ey; ez] — 3×3 rotation
  const H = [ex, ey, ez];
  // T = block diagonal 12×12
  const T: number[][] = Array.from({length:12}, () => Array(12).fill(0));
  for (let b = 0; b < 4; b++) {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        T[b*3+i][b*3+j] = H[i][j];
  }

  // Local stiffness (same as k_frame3d)
  const kl: number[][] = Array.from({length:12}, () => Array(12).fill(0));
  kl[0][0]=EA/L; kl[0][6]=-EA/L; kl[6][0]=-EA/L; kl[6][6]=EA/L;
  kl[3][3]=GJ/L; kl[3][9]=-GJ/L; kl[9][3]=-GJ/L; kl[9][9]=GJ/L;
  // Bending z
  kl[1][1]=12*EIz/L3; kl[1][5]=6*EIz/L2; kl[1][7]=-12*EIz/L3; kl[1][11]=6*EIz/L2;
  kl[5][1]=6*EIz/L2; kl[5][5]=4*EIz/L; kl[5][7]=-6*EIz/L2; kl[5][11]=2*EIz/L;
  kl[7][1]=-12*EIz/L3; kl[7][5]=-6*EIz/L2; kl[7][7]=12*EIz/L3; kl[7][11]=-6*EIz/L2;
  kl[11][1]=6*EIz/L2; kl[11][5]=2*EIz/L; kl[11][7]=-6*EIz/L2; kl[11][11]=4*EIz/L;
  // Bending y
  kl[2][2]=12*EIy/L3; kl[2][4]=-6*EIy/L2; kl[2][8]=-12*EIy/L3; kl[2][10]=-6*EIy/L2;
  kl[4][2]=-6*EIy/L2; kl[4][4]=4*EIy/L; kl[4][8]=6*EIy/L2; kl[4][10]=2*EIy/L;
  kl[8][2]=-12*EIy/L3; kl[8][4]=6*EIy/L2; kl[8][8]=12*EIy/L3; kl[8][10]=6*EIy/L2;
  kl[10][2]=-6*EIy/L2; kl[10][4]=2*EIy/L; kl[10][8]=6*EIy/L2; kl[10][10]=4*EIy/L;

  // ke_global = T' * kl * T
  const Tm = math.matrix(T);
  const Klm = math.matrix(kl);
  return math.multiply(math.transpose(Tm), math.multiply(Klm, Tm)) as math.Matrix;
}

// ── Space Frame Consistent Mass (Logan) ──
// Returns GLOBAL 12×12 mass matrix: T' * ml * T
export function space_frame_mass(m_bar: number, I0: number, A: number, coord: number[][]): math.Matrix {
  const n1 = coord[0], n2 = coord[1], n3 = coord[2];
  const dx = n2[0]-n1[0], dy = n2[1]-n1[1], dz = n2[2]-n1[2];
  const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const L2 = L*L;
  const r = I0/A; // ratio

  // Local axes
  const ex = [dx/L, dy/L, dz/L];
  const v31 = [n3[0]-n1[0], n3[1]-n1[1], n3[2]-n1[2]];
  const v21 = [n2[0]-n1[0], n2[1]-n1[1], n2[2]-n1[2]];
  let eyy = [v31[1]*v21[2]-v31[2]*v21[1], v31[2]*v21[0]-v31[0]*v21[2], v31[0]*v21[1]-v31[1]*v21[0]];
  const eyn = Math.sqrt(eyy[0]*eyy[0]+eyy[1]*eyy[1]+eyy[2]*eyy[2]);
  const ey = [eyy[0]/eyn, eyy[1]/eyn, eyy[2]/eyn];
  const ez = [ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0]];
  const H = [ex, ey, ez];
  const T: number[][] = Array.from({length:12}, () => Array(12).fill(0));
  for (let b = 0; b < 4; b++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        T[b*3+i][b*3+j] = H[i][j];

  // Consistent mass matrix (local)
  const ml: number[][] = [
    [140,0,0,0,0,0, 70,0,0,0,0,0],
    [0,156,0,0,0,22*L, 0,54,0,0,0,-13*L],
    [0,0,156,0,-22*L,0, 0,0,54,0,13*L,0],
    [0,0,0,140*r,0,0, 0,0,0,70*r,0,0],
    [0,0,-22*L,0,4*L2,0, 0,0,-13*L,0,-3*L2,0],
    [0,22*L,0,0,0,4*L2, 0,13*L,0,0,0,-3*L2],
    [70,0,0,0,0,0, 140,0,0,0,0,0],
    [0,54,0,0,0,13*L, 0,156,0,0,0,-22*L],
    [0,0,54,0,-13*L,0, 0,0,156,0,22*L,0],
    [0,0,0,70*r,0,0, 0,0,0,140*r,0,0],
    [0,0,13*L,0,-3*L2,0, 0,0,22*L,0,4*L2,0],
    [0,-13*L,0,0,0,-3*L2, 0,-22*L,0,0,0,4*L2]
  ];

  // Scale and transform: m_bar*L/420 * T' * ml * T
  const scale = m_bar * L / 420;
  const Tm = math.matrix(T);
  const Mlm = math.matrix(ml.map(row => row.map(v => v * scale)));
  return math.multiply(math.transpose(Tm), math.multiply(Mlm, Tm)) as math.Matrix;
}

// ── CST (Constant Strain Triangle): 6×6 plane stress stiffness ──
// k_cst(E, nu, t, x1,y1, x2,y2, x3,y3) → 6×6
export function k_cst(E: number, nu: number, t: number,
  x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): math.Matrix {
  const A2 = Math.abs((x2-x1)*(y3-y1) - (x3-x1)*(y2-y1)); // 2*Area
  const Area = A2 / 2;

  // B matrix (3×6)
  const b1 = y2-y3, b2 = y3-y1, b3 = y1-y2;
  const c1 = x3-x2, c2 = x1-x3, c3 = x2-x1;

  const B = [
    [b1, 0, b2, 0, b3, 0],
    [0, c1, 0, c2, 0, c3],
    [c1, b1, c2, b2, c3, b3]
  ];

  // D matrix (plane stress)
  const coeff = E / (1 - nu*nu);
  const D = [
    [coeff,      coeff*nu,  0],
    [coeff*nu,   coeff,     0],
    [0,          0,         coeff*(1-nu)/2]
  ];

  // K = t * A * Bt * D * B / (4*A²) = t/(4*A) * Bt*D*B
  const factor = t / (4 * Area);

  // Compute Bt*D*B (6×6)
  const K: number[][] = Array.from({length: 6}, () => Array(6).fill(0));
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let sum = 0;
      for (let p = 0; p < 3; p++) {
        for (let q = 0; q < 3; q++) {
          sum += B[p][i] * D[p][q] * B[q][j];
        }
      }
      K[i][j] = factor * sum;
    }
  }

  return math.matrix(K);
}

// ── Q4 (4-node Quad): 8×8 plane stress stiffness (2×2 Gauss) ──
// k_q4(E, nu, t, coords) where coords = [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
export function k_q4(E: number, nu: number, t: number, coords: number[][]): math.Matrix {
  const coeff = E / (1 - nu*nu);
  const D = [
    [coeff, coeff*nu, 0],
    [coeff*nu, coeff, 0],
    [0, 0, coeff*(1-nu)/2]
  ];

  const K: number[][] = Array.from({length: 8}, () => Array(8).fill(0));

  // 2×2 Gauss points
  const gp = 1 / Math.sqrt(3);
  const pts = [[-gp,-gp],[gp,-gp],[gp,gp],[-gp,gp]];
  const wts = [1, 1, 1, 1];

  for (let g = 0; g < 4; g++) {
    const [xi, eta] = pts[g];
    const w = wts[g];

    // Shape function derivatives dN/dxi, dN/deta
    const dNdxi = [-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4];
    const dNdeta = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];

    // Jacobian
    let J11=0, J12=0, J21=0, J22=0;
    for (let i = 0; i < 4; i++) {
      J11 += dNdxi[i] * coords[i][0];
      J12 += dNdxi[i] * coords[i][1];
      J21 += dNdeta[i] * coords[i][0];
      J22 += dNdeta[i] * coords[i][1];
    }
    const detJ = J11*J22 - J12*J21;

    // dN/dx, dN/dy
    const dNdx: number[] = [], dNdy: number[] = [];
    for (let i = 0; i < 4; i++) {
      dNdx.push((J22*dNdxi[i] - J12*dNdeta[i]) / detJ);
      dNdy.push((-J21*dNdxi[i] + J11*dNdeta[i]) / detJ);
    }

    // B matrix (3×8)
    const B: number[][] = [[],[],[]];
    for (let i = 0; i < 4; i++) {
      B[0].push(dNdx[i], 0);
      B[1].push(0, dNdy[i]);
      B[2].push(dNdy[i], dNdx[i]);
    }

    // K += w * t * Bt*D*B * detJ
    const factor = w * t * Math.abs(detJ);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        let sum = 0;
        for (let p = 0; p < 3; p++) {
          for (let q = 0; q < 3; q++) {
            sum += B[p][i] * D[p][q] * B[q][j];
          }
        }
        K[i][j] += factor * sum;
      }
    }
  }

  return math.matrix(K);
}

// ── Plate Q4 Mindlin-Reissner: 12×12 plate bending stiffness ──
// 3 DOF/node: w, theta_x, theta_y
// Selective integration: 2×2 Gauss bending + 1×1 Gauss shear (no locking)
// k_plate_q4(E, nu, t, kappa, coords) coords=[[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
export function k_plate_q4(E: number, nu: number, t: number, kappa: number, coords: number[][]): math.Matrix {
  const K: number[][] = Array.from({length: 12}, () => Array(12).fill(0));
  const Dc = E*t*t*t/(12*(1-nu*nu));
  const Db = [[Dc, Dc*nu, 0],[Dc*nu, Dc, 0],[0, 0, Dc*(1-nu)/2]];
  const Sc = kappa*E*t/(2*(1+nu));
  const Ds = [[Sc,0],[0,Sc]];

  function ev(xi: number, eta: number) {
    const N = [(1-xi)*(1-eta)/4,(1+xi)*(1-eta)/4,(1+xi)*(1+eta)/4,(1-xi)*(1+eta)/4];
    const dxi = [-(1-eta)/4,(1-eta)/4,(1+eta)/4,-(1+eta)/4];
    const det = [-(1-xi)/4,-(1+xi)/4,(1+xi)/4,(1-xi)/4];
    let J11=0,J12=0,J21=0,J22=0;
    for(let i=0;i<4;i++){J11+=dxi[i]*coords[i][0];J12+=dxi[i]*coords[i][1];J21+=det[i]*coords[i][0];J22+=det[i]*coords[i][1];}
    const dJ=J11*J22-J12*J21;
    const dx:number[]=[],dy:number[]=[];
    for(let i=0;i<4;i++){dx.push((J22*dxi[i]-J12*det[i])/dJ);dy.push((-J21*dxi[i]+J11*det[i])/dJ);}
    return {N,dx,dy,dJ};
  }

  // Bending 2×2 Gauss
  const g=1/Math.sqrt(3);
  for(const[xi,eta]of[[-g,-g],[g,-g],[g,g],[-g,g]]as number[][]){
    const{dx,dy,dJ}=ev(xi,eta);
    // Bb (3×12): κ_xx = ∂θ_y/∂x, κ_yy = -∂θ_x/∂y, κ_xy = ∂θ_y/∂y - ∂θ_x/∂x
    // DOFs per node: [w(3i), θ_x(3i+1), θ_y(3i+2)]
    const Bb:number[][]=[[],[],[]];
    for(let i=0;i<4;i++){
      // κ_xx = ∂θ_y/∂x → col 3i+2
      Bb[0].push(0, 0, dx[i]);
      // κ_yy = -∂θ_x/∂y → col 3i+1 with negative sign
      Bb[1].push(0, -dy[i], 0);
      // κ_xy = ∂θ_y/∂y - ∂θ_x/∂x → col 3i+1 and 3i+2
      Bb[2].push(0, -dx[i], dy[i]);
    }
    const f=Math.abs(dJ);
    for(let i=0;i<12;i++)for(let j=0;j<12;j++){let s=0;for(let p=0;p<3;p++)for(let q=0;q<3;q++)s+=Bb[p][i]*Db[p][q]*Bb[q][j];K[i][j]+=f*s;}
  }

  // Shear 1×1 Gauss center
  // γ_xz = ∂w/∂x - θ_y, γ_yz = ∂w/∂y + θ_x
  {
    const{N,dx,dy,dJ}=ev(0,0);
    const Bs:number[][]=[[],[]];
    for(let i=0;i<4;i++){
      // γ_xz = ∂w/∂x - θ_y → w(3i) and θ_y(3i+2) with negative
      Bs[0].push(dx[i], 0, -N[i]);
      // γ_yz = ∂w/∂y + θ_x → w(3i) and θ_x(3i+1)
      Bs[1].push(dy[i], N[i], 0);
    }
    const f=Math.abs(dJ)*4;
    for(let i=0;i<12;i++)for(let j=0;j<12;j++){let s=0;for(let p=0;p<2;p++)for(let q=0;q<2;q++)s+=Bs[p][i]*Ds[p][q]*Bs[q][j];K[i][j]+=f*s;}
  }

  return math.matrix(K);
}

// ═══════════════════════════════════════════════════════════════════════════
// MITC4 Mindlin-Reissner plate element (Bathe & Dvorkin 1986)
// Mixed Interpolation of Tensorial Components — no shear locking
// 12×12 stiffness matrix, 3 DOF/node: [w, θ_x, θ_y]
// Full 2×2 Gauss integration for both bending and shear
// Ref: Owen & Hinton "FE in Plasticity" §6.4.8-6.4.10 (BMATPB, MODPB)
// ═══════════════════════════════════════════════════════════════════════════
export function k_plate_mitc4(E: number, nu: number, t: number, kappa: number, coords: number[][]): math.Matrix {
  const nDof = 12;
  const K: number[][] = Array.from({length: nDof}, () => Array(nDof).fill(0));

  // ─── Material matrices (Owen §6.4.10 MODPB) ───
  const Dc = E * t * t * t / (12 * (1 - nu * nu));
  const Db = [[Dc, Dc * nu, 0], [Dc * nu, Dc, 0], [0, 0, Dc * (1 - nu) / 2]];
  const Sc = kappa * E * t / (2 * (1 + nu));
  const Ds = [[Sc, 0], [0, Sc]];

  // ─── Shape functions and Jacobian at (ξ,η) ───
  function evalPt(xi: number, eta: number) {
    const N = [(1-xi)*(1-eta)/4, (1+xi)*(1-eta)/4, (1+xi)*(1+eta)/4, (1-xi)*(1+eta)/4];
    const dxi = [-(1-eta)/4, (1-eta)/4, (1+eta)/4, -(1+eta)/4];
    const det = [-(1-xi)/4, -(1+xi)/4, (1+xi)/4, (1-xi)/4];
    let J11=0, J12=0, J21=0, J22=0;
    for (let i = 0; i < 4; i++) {
      J11 += dxi[i]*coords[i][0]; J12 += dxi[i]*coords[i][1];
      J21 += det[i]*coords[i][0]; J22 += det[i]*coords[i][1];
    }
    const dJ = J11*J22 - J12*J21;
    const dx: number[] = [], dy: number[] = [];
    for (let i = 0; i < 4; i++) {
      dx.push((J22*dxi[i] - J12*det[i]) / dJ);
      dy.push((-J21*dxi[i] + J11*det[i]) / dJ);
    }
    return {N, dx, dy, J11, J12, J21, J22, dJ};
  }

  // ─── Covariant shear strain B-row at tying point ───
  // e_α3 = J_α1·γ_xz + J_α2·γ_yz
  // γ_xz=[∂w/∂x, 0, −N_i], γ_yz=[∂w/∂y, N_i, 0]
  function covShearRow(xi: number, eta: number, alpha: number): number[] {
    const {N, dx, dy, J11, J12, J21, J22} = evalPt(xi, eta);
    const Ja1 = alpha === 0 ? J11 : J21;
    const Ja2 = alpha === 0 ? J12 : J22;
    const row: number[] = [];
    for (let i = 0; i < 4; i++) {
      row.push(
        Ja1*dx[i] + Ja2*dy[i],   // w coeff
        Ja2*N[i],                  // θ_x coeff
        -Ja1*N[i]                  // θ_y coeff
      );
    }
    return row;
  }

  // ─── MITC4 tying points (Bathe & Dvorkin 1986) ───
  // e_ξ3: sample at A=(0,−1), C=(0,+1) → interpolate linearly in η
  // e_η3: sample at B=(−1,0), D=(+1,0) → interpolate linearly in ξ
  const e13_A = covShearRow(0, -1, 0);
  const e13_C = covShearRow(0, +1, 0);
  const e23_B = covShearRow(-1, 0, 1);
  const e23_D = covShearRow(+1, 0, 1);

  // ─── 2×2 Gauss integration ───
  const g = 1 / Math.sqrt(3);
  for (const [xi, eta] of [[-g,-g],[g,-g],[g,g],[-g,g]] as [number,number][]) {
    const {dx, dy, J11, J12, J21, J22, dJ} = evalPt(xi, eta);
    const wt = Math.abs(dJ);

    // Bending B-matrix (Owen §6.4.8 BMATPB — flexural part)
    const Bb: number[][] = [[], [], []];
    for (let i = 0; i < 4; i++) {
      Bb[0].push(0, 0, dx[i]);         // κ_x = ∂θ_y/∂x
      Bb[1].push(0, -dy[i], 0);        // κ_y = −∂θ_x/∂y
      Bb[2].push(0, -dx[i], dy[i]);    // κ_xy = ∂θ_y/∂y − ∂θ_x/∂x
    }
    for (let i = 0; i < nDof; i++)
      for (let j = 0; j < nDof; j++) {
        let s = 0;
        for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) s += Bb[p][i] * Db[p][q] * Bb[q][j];
        K[i][j] += wt * s;
      }

    // MITC4 assumed shear B-matrix (replaces standard selective integration)
    const ae13 = new Array(nDof);
    const ae23 = new Array(nDof);
    for (let j = 0; j < nDof; j++) {
      ae13[j] = 0.5*(1 - eta)*e13_A[j] + 0.5*(1 + eta)*e13_C[j];
      ae23[j] = 0.5*(1 - xi)*e23_B[j]  + 0.5*(1 + xi)*e23_D[j];
    }
    // Transform covariant → Cartesian: [γ_xz; γ_yz] = J⁻¹·[ê_ξ3; ê_η3]
    const invD = 1 / dJ;
    const BsM: number[][] = [new Array(nDof), new Array(nDof)];
    for (let j = 0; j < nDof; j++) {
      BsM[0][j] = invD * ( J22*ae13[j] - J12*ae23[j]);
      BsM[1][j] = invD * (-J21*ae13[j] + J11*ae23[j]);
    }
    for (let i = 0; i < nDof; i++)
      for (let j = 0; j < nDof; j++) {
        let s = 0;
        for (let p = 0; p < 2; p++) for (let q = 0; q < 2; q++) s += BsM[p][i] * Ds[p][q] * BsM[q][j];
        K[i][j] += wt * s;
      }
  }

  return math.matrix(K);
}

// Shell 6DOF Q4: Membrane + MITC4 Plate + Drilling
// 24x24, 6 DOF/node: [ux,uy,uz,thx,thy,thz] — for walls and slabs
export function k_shell6(E: number, nu: number, t: number, kappa: number, coords: number[][], alphaDrill: number = 0.01): math.Matrix {
  const cm=E*t/(1-nu*nu);
  const Dm=[[cm,cm*nu,0],[cm*nu,cm,0],[0,0,cm*(1-nu)/2]];
  const Dc=E*t*t*t/(12*(1-nu*nu));
  const Db=[[Dc,Dc*nu,0],[Dc*nu,Dc,0],[0,0,Dc*(1-nu)/2]];
  const Sc=kappa*E*t/(2*(1+nu));
  const Ds=[[Sc,0],[0,Sc]];
  const Km:number[][]=Array.from({length:8},()=>Array(8).fill(0));
  const Kp:number[][]=Array.from({length:12},()=>Array(12).fill(0));
  const g=1/Math.sqrt(3);
  function ev(xi:number,eta:number){
    const N=[(1-xi)*(1-eta)/4,(1+xi)*(1-eta)/4,(1+xi)*(1+eta)/4,(1-xi)*(1+eta)/4];
    const dxi=[-(1-eta)/4,(1-eta)/4,(1+eta)/4,-(1+eta)/4];
    const det=[-(1-xi)/4,-(1+xi)/4,(1+xi)/4,(1-xi)/4];
    let J11=0,J12=0,J21=0,J22=0;
    for(let i=0;i<4;i++){J11+=dxi[i]*coords[i][0];J12+=dxi[i]*coords[i][1];J21+=det[i]*coords[i][0];J22+=det[i]*coords[i][1];}
    const dJ=J11*J22-J12*J21;
    const dx:number[]=[],dy:number[]=[];
    for(let i=0;i<4;i++){dx.push((J22*dxi[i]-J12*det[i])/dJ);dy.push((-J21*dxi[i]+J11*det[i])/dJ);}
    return {N,dx,dy,J11,J12,J21,J22,dJ};
  }
  // Membrane 2x2
  for(const[xi,eta]of[[-g,-g],[g,-g],[g,g],[-g,g]]as number[][]){
    const{N,dx,dy,dJ}=ev(xi,eta);
    const Bm:number[][]=[[],[],[]];
    for(let i=0;i<4;i++){Bm[0].push(dx[i],0);Bm[1].push(0,dy[i]);Bm[2].push(dy[i],dx[i]);}
    const f=Math.abs(dJ);
    for(let i=0;i<8;i++)for(let j=0;j<8;j++){let s=0;for(let p=0;p<3;p++)for(let q=0;q<3;q++)s+=Bm[p][i]*Dm[p][q]*Bm[q][j];Km[i][j]+=f*s;}
  }
  // Plate MITC4
  function covRow(xi:number,eta:number,a:number):number[]{
    const{N,dx,dy,J11,J12,J21,J22}=ev(xi,eta);
    const Ja1=a===0?J11:J21,Ja2=a===0?J12:J22;
    const r:number[]=[];for(let i=0;i<4;i++){r.push(Ja1*dx[i]+Ja2*dy[i],Ja2*N[i],-Ja1*N[i]);}return r;
  }
  const e13A=covRow(0,-1,0),e13C=covRow(0,+1,0),e23B=covRow(-1,0,1),e23D=covRow(+1,0,1);
  for(const[xi,eta]of[[-g,-g],[g,-g],[g,g],[-g,g]]as number[][]){
    const{dx,dy,J11,J12,J21,J22,dJ}=ev(xi,eta);
    const wt=Math.abs(dJ);
    const Bb:number[][]=[[],[],[]];
    for(let i=0;i<4;i++){Bb[0].push(0,0,dx[i]);Bb[1].push(0,-dy[i],0);Bb[2].push(0,-dx[i],dy[i]);}
    for(let i=0;i<12;i++)for(let j=0;j<12;j++){let s=0;for(let p=0;p<3;p++)for(let q=0;q<3;q++)s+=Bb[p][i]*Db[p][q]*Bb[q][j];Kp[i][j]+=wt*s;}
    const ae13=new Array(12),ae23=new Array(12);
    for(let j=0;j<12;j++){ae13[j]=.5*(1-eta)*e13A[j]+.5*(1+eta)*e13C[j];ae23[j]=.5*(1-xi)*e23B[j]+.5*(1+xi)*e23D[j];}
    const inv=1/dJ;
    const BsM:number[][]=[new Array(12),new Array(12)];
    for(let j=0;j<12;j++){BsM[0][j]=inv*(J22*ae13[j]-J12*ae23[j]);BsM[1][j]=inv*(-J21*ae13[j]+J11*ae23[j]);}
    for(let i=0;i<12;i++)for(let j=0;j<12;j++){let s=0;for(let p=0;p<2;p++)for(let q=0;q<2;q++)s+=BsM[p][i]*Ds[p][q]*BsM[q][j];Kp[i][j]+=wt*s;}
  }
  // Assemble 24x24
  const Ks:number[][]=Array.from({length:24},()=>Array(24).fill(0));
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
    Ks[6*i][6*j]+=Km[2*i][2*j];Ks[6*i][6*j+1]+=Km[2*i][2*j+1];
    Ks[6*i+1][6*j]+=Km[2*i+1][2*j];Ks[6*i+1][6*j+1]+=Km[2*i+1][2*j+1];
    for(let p=0;p<3;p++)for(let q=0;q<3;q++)Ks[6*i+2+p][6*j+2+q]+=Kp[3*i+p][3*j+q];
  }
  const kDrill=alphaDrill*E*t;
  for(let i=0;i<4;i++)Ks[6*i+5][6*i+5]+=kDrill;
  return math.matrix(Ks);
}
