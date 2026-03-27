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
  console.log('[DBG-ASM] dofs:', dofs, 'Ke(0,0):', ke[0]?.[0], 'Kg size:', kg.length);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const gi = dofs[i] - 1; // 1-based → 0-based
      const gj = dofs[j] - 1;
      if (gi >= 0 && gj >= 0 && gi < kg.length && gj < kg[0].length) {
        kg[gi][gj] += ke[i][j];
      }
    }
  }
  console.log('[DBG-ASM] after: Kg(0,0)=', kg[0][0], 'Kg(1,1)=', kg[1]?.[1]);
  return math.matrix(kg);
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
