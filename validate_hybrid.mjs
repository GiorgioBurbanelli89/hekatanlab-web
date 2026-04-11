/**
 * Validate deformHybrid vs awatif deform (pure TS)
 * Same model, compare displacement results
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const math = require('mathjs');

// ── Import awatif TS utils directly ──
// We can't import TS directly in Node, so replicate the logic

// getLocalStiffnessMatrixFrame (12x12) — same as awatif cpp/ts
function k_frame_12x12(E, A, Iz, Iy, G, J, L) {
  const EA_L = E * A / L;
  const EIz_L3 = E * Iz / (L * L * L);
  const EIy_L3 = E * Iy / (L * L * L);
  const GJ_L = G * J / L;
  const EIz_L2 = E * Iz / (L * L);
  const EIy_L2 = E * Iy / (L * L);
  const EIz_L = E * Iz / L;
  const EIy_L = E * Iy / L;

  return [
    [EA_L,0,0,0,0,0,-EA_L,0,0,0,0,0],
    [0,12*EIz_L3,0,0,0,6*EIz_L2,0,-12*EIz_L3,0,0,0,6*EIz_L2],
    [0,0,12*EIy_L3,0,-6*EIy_L2,0,0,0,-12*EIy_L3,0,-6*EIy_L2,0],
    [0,0,0,GJ_L,0,0,0,0,0,-GJ_L,0,0],
    [0,0,-6*EIy_L2,0,4*EIy_L,0,0,0,6*EIy_L2,0,2*EIy_L,0],
    [0,6*EIz_L2,0,0,0,4*EIz_L,0,-6*EIz_L2,0,0,0,2*EIz_L],
    [-EA_L,0,0,0,0,0,EA_L,0,0,0,0,0],
    [0,-12*EIz_L3,0,0,0,-6*EIz_L2,0,12*EIz_L3,0,0,0,-6*EIz_L2],
    [0,0,-12*EIy_L3,0,6*EIy_L2,0,0,0,12*EIy_L3,0,6*EIy_L2,0],
    [0,0,0,-GJ_L,0,0,0,0,0,GJ_L,0,0],
    [0,0,-6*EIy_L2,0,2*EIy_L,0,0,0,6*EIy_L2,0,4*EIy_L,0],
    [0,6*EIz_L2,0,0,0,2*EIz_L,0,-6*EIz_L2,0,0,0,4*EIz_L]
  ];
}

// Simple truss 2D test (3 bars, same as HékatanLab template)
function testTruss2D() {
  console.log("=== TEST: Truss 2D (3 barras) ===");

  const nodes = [[0,0,0], [4,0,0], [2,0,3]];
  const elements = [[0,2], [1,2], [0,1]]; // 0-based
  const E = 200e3, A = 100;

  const nDof = nodes.length * 6; // 18 DOF (6 per node)
  const K = Array(nDof).fill(0).map(() => Array(nDof).fill(0));

  for (const el of elements) {
    const n0 = nodes[el[0]], n1 = nodes[el[1]];
    const dx = n1[0]-n0[0], dy = n1[1]-n0[1], dz = n1[2]-n0[2];
    const L = Math.sqrt(dx*dx + dy*dy + dz*dz);

    // Simple truss: only axial (EA/L)
    const ke = E * A / L;
    const cx = dx/L, cy = dy/L, cz = dz/L;

    // 6x6 truss in 3D (only translational DOFs matter)
    const T = [cx, cy, cz];
    const kLocal = [[ke, -ke], [-ke, ke]];

    // Assemble into global (only DOFs 0,1,2 and 6,7,8 etc.)
    const dofs = [el[0]*6, el[0]*6+1, el[0]*6+2, el[1]*6, el[1]*6+1, el[1]*6+2];

    // Ke_global = T' * kLocal * T (expanded to 6x6)
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        K[dofs[a]][dofs[b]] += ke * T[a] * T[b];
        K[dofs[a+3]][dofs[b+3]] += ke * T[a] * T[b];
        K[dofs[a]][dofs[b+3]] -= ke * T[a] * T[b];
        K[dofs[a+3]][dofs[b]] -= ke * T[a] * T[b];
      }
    }
  }

  // Supports: nodes 0,1 fully fixed
  const fixed = [];
  for (let i = 0; i < 12; i++) fixed.push(i); // DOFs 0-11

  // Load: Fz = -100 at node 2
  const F = Array(nDof).fill(0);
  F[2*6 + 2] = -100; // Fz at node 2

  // Extract free DOFs
  const free = [];
  for (let i = 0; i < nDof; i++) {
    if (!fixed.includes(i)) free.push(i);
  }

  // Extract submatrix
  const Kf = free.map(i => free.map(j => K[i][j]));
  const Ff = free.map(i => F[i]);

  // Solve
  const Kfm = math.matrix(Kf);
  const Ffm = math.matrix(Ff.map(v => [v]));
  const Ufm = math.lusolve(Kfm, Ffm);
  const Uf_free = math.flatten(Ufm).toArray();

  // Full vector
  const Uf = Array(nDof).fill(0);
  for (let i = 0; i < free.length; i++) {
    Uf[free[i]] = Uf_free[i];
  }

  console.log("Node 2 displacements (6 DOF):");
  console.log("  ux =", Uf[12].toExponential(6));
  console.log("  uy =", Uf[13].toExponential(6));
  console.log("  uz =", Uf[14].toExponential(6));

  return { ux: Uf[12], uy: Uf[13], uz: Uf[14] };
}

// CST plane stress test (simple rectangle, 2 DOF/node)
function testCST() {
  console.log("\n=== TEST: CST Plane Stress (1 triángulo) ===");

  const nodes = [[0,0], [1,0], [0,1]];
  const E = 100, nu = 0.3, t = 1;

  // CST stiffness matrix (B'*D*B*A*t)
  const x1=0, y1=0, x2=1, y2=0, x3=0, y3=1;
  const A2 = (x2-x1)*(y3-y1) - (x3-x1)*(y2-y1); // 2*Area
  const Area = A2 / 2;

  const b1 = y2-y3, b2 = y3-y1, b3 = y1-y2;
  const c1 = x3-x2, c2 = x1-x3, c3 = x2-x1;

  const B = [
    [b1/A2, 0, b2/A2, 0, b3/A2, 0],
    [0, c1/A2, 0, c2/A2, 0, c3/A2],
    [c1/A2, b1/A2, c2/A2, b2/A2, c3/A2, b3/A2]
  ];

  const coeff = E / (1 - nu*nu);
  const D = [
    [coeff, coeff*nu, 0],
    [coeff*nu, coeff, 0],
    [0, 0, coeff*(1-nu)/2]
  ];

  const Bm = math.matrix(B);
  const Dm = math.matrix(D);
  const Ke = math.multiply(math.multiply(math.transpose(Bm), Dm), Bm);
  const Ke_scaled = math.multiply(Ke, Area * t);

  console.log("CST Ke (6x6):");
  const arr = Ke_scaled.toArray();
  for (const row of arr) {
    console.log("  [" + row.map(v => v.toFixed(4)).join(", ") + "]");
  }

  // Compare with HékatanLab k_cst function (should match)
  console.log("\nThis should match k_cst(E, nu, t, x1,y1, x2,y2, x3,y3)");
}

// Shell tri 18 DOF test — compare with awatif
function testShellTri() {
  console.log("\n=== TEST: Shell Tri 18 DOF (1 triángulo) ===");
  console.log("Comparing membrane + DKT bending + cell-smoothed shear");

  const nodes = [[0,0,0], [1,0,0], [0,1,0]];
  const E = 100, nu = 0.3, t = 1;

  // This is what awatif computes internally
  // K_shell = K_membrane(9x9 expanded to 18x18) + K_bending(18x18) + K_shear(18x18)
  console.log("Cannot compute shell tri in pure JS without full awatif code.");
  console.log("Use fem_deform() in HékatanLab or deformHybrid in awatif-v2 to compare.");
}

// Run tests
const trussResult = testTruss2D();
testCST();
testShellTri();

console.log("\n=== SUMMARY ===");
console.log("Truss 2D node 2: uz =", trussResult.uz.toExponential(6));
console.log("Run the same model in awatif plate (http://localhost:4605/src/plate/) and compare Uz values.");
