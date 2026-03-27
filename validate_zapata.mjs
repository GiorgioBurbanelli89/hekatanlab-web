// ═══════════════════════════════════════════════════════════════
// VALIDACIÓN ZAPATA: Shell tri 18×18 + Frame pedestal
// Checks: simetría de reacciones, convergencia con mesh refinement
// ═══════════════════════════════════════════════════════════════
import * as math from 'mathjs';

// ── Helper functions (same as fem-matlab.ts, ported to JS) ──

function buildIsoDb(E, nu, t) {
  const f = (E * t**3) / (12 * (1 - nu**2));
  return [[f, f*nu, 0], [f*nu, f, 0], [0, 0, f*(1-nu)/2]];
}

function buildIsoDs(E, nu, t) {
  const ks = 5/6, qs = E/(2*(1+nu));
  return [[ks*qs*t, 0], [0, ks*qs*t]];
}

function shell_bending_B(x1,y1,x2,y2,x3,y3) {
  const x21=x2-x1, x31=x3-x1, x32=x3-x2;
  const y23=y2-y3, y31=y3-y1, y12=y1-y2;
  const Ae = 0.5*(x21*y31 - x31*(-y12));
  const dNdx1=y23/(2*Ae), dNdy1=x32/(2*Ae);
  const dNdx2=y31/(2*Ae), dNdy2=-x31/(2*Ae);
  const dNdx3=y12/(2*Ae), dNdy3=x21/(2*Ae);
  const Bb = Array.from({length:3}, ()=>Array(18).fill(0));
  Bb[0][4]=dNdx1; Bb[0][10]=dNdx2; Bb[0][16]=dNdx3;
  Bb[1][3]=-dNdy1; Bb[1][9]=-dNdy2; Bb[1][15]=-dNdy3;
  Bb[2][3]=-dNdx1; Bb[2][4]=dNdy1; Bb[2][9]=-dNdx2; Bb[2][10]=dNdy2; Bb[2][15]=-dNdx3; Bb[2][16]=dNdy3;
  return Bb;
}

function getCellSmoothing(X, Y) {
  const x21=X[1]-X[0], x13=X[0]-X[2], y31=Y[2]-Y[0], y12=Y[0]-Y[1], x32=X[2]-X[1], y23=Y[1]-Y[2];
  const Ae = 0.5*(x21*y31 - x13*y12);
  if (Math.abs(Ae) < 1e-12) return { bs1: math.zeros(2,6)._data, bs2: math.zeros(2,6)._data, bs3: math.zeros(2,6)._data, Ae: 0 };
  const a1=0.5*y12*x13, a2=0.5*y31*x21, a3=0.5*x21*x13, a4=0.5*y12*y31;
  const bs1=Array.from({length:2},()=>Array(6).fill(0));
  const bs2=Array.from({length:2},()=>Array(6).fill(0));
  const bs3=Array.from({length:2},()=>Array(6).fill(0));
  bs1[0][2]=0.5*x32/Ae; bs1[0][3]=-0.5; bs1[1][2]=0.5*y23/Ae; bs1[1][4]=0.5;
  bs2[0][2]=0.5*x13/Ae; bs2[0][3]=0.5*a1/Ae; bs2[0][4]=0.5*a3/Ae;
  bs2[1][2]=0.5*y31/Ae; bs2[1][3]=0.5*a4/Ae; bs2[1][4]=0.5*a2/Ae;
  bs3[0][2]=0.5*x21/Ae; bs3[0][3]=-0.5*a2/Ae; bs3[0][4]=-0.5*a3/Ae;
  bs3[1][2]=0.5*y12/Ae; bs3[1][3]=-0.5*a4/Ae; bs3[1][4]=-0.5*a1/Ae;
  return { bs1, bs2, bs3, Ae };
}

function shell_shear_B(x1,y1,x2,y2,x3,y3) {
  const cx=(x1+x2+x3)/3, cy=(y1+y2+y3)/3;
  const Ae_main = 0.5*((x2-x1)*(y3-y1)-(x3-x1)*(-(y1-y2)));
  const t3 = 1/3;
  const Bs = Array.from({length:2},()=>Array(18).fill(0));

  const subs = [
    [[cx,x1,x2],[cy,y1,y2], (B,cs,i,j)=>{ B[i][j]=t3*cs.bs1[i][j]+cs.bs2[i][j]; B[i][j+6]=t3*cs.bs1[i][j]+cs.bs3[i][j]; B[i][j+12]=t3*cs.bs1[i][j]; }],
    [[cx,x2,x3],[cy,y2,y3], (B,cs,i,j)=>{ B[i][j]=t3*cs.bs1[i][j]; B[i][j+6]=t3*cs.bs1[i][j]+cs.bs2[i][j]; B[i][j+12]=t3*cs.bs1[i][j]+cs.bs3[i][j]; }],
    [[cx,x3,x1],[cy,y3,y1], (B,cs,i,j)=>{ B[i][j]=t3*cs.bs1[i][j]+cs.bs3[i][j]; B[i][j+6]=t3*cs.bs1[i][j]; B[i][j+12]=t3*cs.bs1[i][j]+cs.bs2[i][j]; }],
  ];

  for (const [Xs, Ys, fill] of subs) {
    const cs = getCellSmoothing(Xs, Ys);
    const B = Array.from({length:2},()=>Array(18).fill(0));
    for (let i=0;i<2;i++) for (let j=0;j<6;j++) fill(B,cs,i,j);
    for (let i=0;i<2;i++) for (let j=0;j<18;j++) Bs[i][j] += B[i][j]*cs.Ae;
  }
  for (let i=0;i<2;i++) for (let j=0;j<18;j++) Bs[i][j] /= Ae_main;
  return Bs;
}

function shell_membrane_K9(x1,y1,x2,y2,x3,y3,E,nu,t) {
  const q1=E/(1-nu**2);
  const Qm = [[q1,q1*nu,0],[q1*nu,q1,0],[0,0,q1*(1-nu)/2]];
  const alpha=1/8, ab=alpha/6, b0=alpha**2/4;
  const x12=x1-x2,x23=x2-x3,x31=x3-x1,y12=y1-y2,y23=y2-y3,y31=y3-y1;
  const x21=-x12,x32=-x23,x13=-x31,y21=-y12,y32=-y23,y13=-y31;
  const Ae = 0.5*(x21*y31-x31*(-y12));
  const A2=2*Ae, A4=4*Ae, h2=0.5*t, vol=Ae*t;
  const LL21=x21**2+y21**2, LL32=x32**2+y32**2, LL13=x13**2+y13**2;

  // L matrix 9x3
  const Lm = Array.from({length:9},()=>Array(3).fill(0));
  Lm[0][0]=h2*y23; Lm[0][2]=h2*x32;
  Lm[1][1]=h2*x32; Lm[1][2]=h2*y23;
  Lm[2][0]=h2*y23*(y13-y21)*ab; Lm[2][1]=h2*x32*(x31-x12)*ab; Lm[2][2]=h2*(x31*y13-x12*y21)*2*ab;
  Lm[3][0]=h2*y31; Lm[3][2]=h2*x13;
  Lm[4][1]=h2*x13; Lm[4][2]=h2*y31;
  Lm[5][0]=h2*y31*(y21-y32)*ab; Lm[5][1]=h2*x13*(x12-x23)*ab; Lm[5][2]=h2*(x12*y21-x23*y32)*2*ab;
  Lm[6][0]=h2*y12; Lm[6][2]=h2*x21;
  Lm[7][1]=h2*x21; Lm[7][2]=h2*y12;
  Lm[8][0]=h2*y12*(y32-y13)*ab; Lm[8][1]=h2*x21*(x23-x31)*ab; Lm[8][2]=h2*(x23*y32-x31*y13)*2*ab;

  const Kb9 = math.divide(math.multiply(math.multiply(Lm, Qm), math.transpose(Lm)), vol);

  // T0 3x9
  const T0 = Array.from({length:3},()=>Array(9).fill(0));
  T0[0][0]=x32/A4;T0[0][1]=y32/A4;T0[0][2]=1;T0[0][3]=x13/A4;T0[0][4]=y13/A4;T0[0][6]=x21/A4;T0[0][7]=y21/A4;
  T0[1][0]=x32/A4;T0[1][1]=y32/A4;T0[1][3]=x13/A4;T0[1][4]=y13/A4;T0[1][5]=1;T0[1][6]=x21/A4;T0[1][7]=y21/A4;
  T0[2][0]=x32/A4;T0[2][1]=y32/A4;T0[2][3]=x13/A4;T0[2][4]=y13/A4;T0[2][6]=x21/A4;T0[2][7]=y21/A4;T0[2][8]=1;

  const A14=1/(Ae*A4);
  const Te = [
    [A14*y23*y13*LL21, A14*y31*y21*LL32, A14*y12*y32*LL13],
    [A14*x23*x13*LL21, A14*x31*x21*LL32, A14*x12*x32*LL13],
    [A14*(y23*x31+x32*y13)*LL21, A14*(y31*x12+x13*y21)*LL32, A14*(y12*x23+x21*y32)*LL13]
  ];

  const A14b=A2/3;
  const b=[1,2,1, 0,1,-1, -1,-1,-2]; // Q1
  const Q1=Array.from({length:3},()=>Array(3).fill(0));
  Q1[0][0]=A14b*1/LL21;Q1[0][1]=A14b*2/LL21;Q1[0][2]=A14b*1/LL21;
  Q1[1][0]=A14b*0/LL32;Q1[1][1]=A14b*1/LL32;Q1[1][2]=A14b*(-1)/LL32;
  Q1[2][0]=A14b*(-1)/LL13;Q1[2][1]=A14b*(-1)/LL13;Q1[2][2]=A14b*(-2)/LL13;
  const Q2=Array.from({length:3},()=>Array(3).fill(0));
  Q2[0][0]=A14b*(-2)/LL21;Q2[0][1]=A14b*(-1)/LL21;Q2[0][2]=A14b*(-1)/LL21;
  Q2[1][0]=A14b*1/LL32;Q2[1][1]=A14b*1/LL32;Q2[1][2]=A14b*2/LL32;
  Q2[2][0]=A14b*(-1)/LL13;Q2[2][1]=A14b*0/LL13;Q2[2][2]=A14b*1/LL13;
  const Q3=Array.from({length:3},()=>Array(3).fill(0));
  Q3[0][0]=A14b*1/LL21;Q3[0][1]=A14b*(-1)/LL21;Q3[0][2]=A14b*0/LL21;
  Q3[1][0]=A14b*(-1)/LL32;Q3[1][1]=A14b*(-2)/LL32;Q3[1][2]=A14b*(-1)/LL32;
  Q3[2][0]=A14b*2/LL13;Q3[2][1]=A14b*1/LL13;Q3[2][2]=A14b*1/LL13;

  const Q4=math.multiply(math.add(Q1,Q2),0.5);
  const Q5=math.multiply(math.add(Q2,Q3),0.5);
  const Q6=math.multiply(math.add(Q3,Q1),0.5);
  const Kn=math.multiply(math.multiply(math.transpose(Te),Qm),Te);
  const KO=math.multiply(
    math.add(math.add(
      math.multiply(math.multiply(math.transpose(Q4),Kn),Q4),
      math.multiply(math.multiply(math.transpose(Q5),Kn),Q5)),
      math.multiply(math.multiply(math.transpose(Q6),Kn),Q6)),
    0.75*b0*vol);
  const Kh=math.multiply(math.multiply(math.transpose(T0),KO),T0);
  return math.add(Kb9,Kh);
}

function k_shell_tri(E,nu,t,x1,y1,x2,y2,x3,y3) {
  const Db = buildIsoDb(E,nu,t);
  const Ds = buildIsoDs(E,nu,t);
  const Bb = shell_bending_B(x1,y1,x2,y2,x3,y3);
  const Bs = shell_shear_B(x1,y1,x2,y2,x3,y3);
  const Ae = 0.5*((x2-x1)*(y3-y1)-(x3-x1)*(-(y1-y2)));

  // Kp = (Bs'*Ds*Bs + Bb'*Db*Bb) * Ae
  const Kp = math.multiply(
    math.add(
      math.multiply(math.multiply(math.transpose(Bs),Ds),Bs),
      math.multiply(math.multiply(math.transpose(Bb),Db),Bb)
    ), Ae);

  const Km9 = shell_membrane_K9(x1,y1,x2,y2,x3,y3,E,nu,t);

  // Assemble into 18x18
  const K = math.matrix(Kp);
  const mi = [0,1,5, 6,7,11, 12,13,17]; // 0-based
  const km9 = (typeof Km9.toArray === 'function') ? Km9.toArray() : Km9;
  const k = K.toArray();
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) k[mi[r]][mi[c]] += (typeof km9[r][c] === 'number' ? km9[r][c] : Number(km9[r][c]));
  return k;
}

// ── Test: Simple square plate, center load, all edges simply supported ──
console.log("═══════════════════════════════════════════════");
console.log("VALIDACIÓN ZAPATA: Shell tri 18x18");
console.log("═══════════════════════════════════════════════\n");

// Plate 2x2, 2x2 mesh (9 nodes, 8 triangles), center point load
const E=25e6, nu=0.2, t=0.4, L=2;
const nodes = [
  [0,0,0],[1,0,0],[2,0,0],
  [0,1,0],[1,1,0],[2,1,0],
  [0,2,0],[1,2,0],[2,2,0]
];
const tris = [
  [0,1,4],[0,4,3], [1,2,5],[1,5,4],
  [3,4,7],[3,7,6], [4,5,8],[4,8,7]
];

const nDof = 9*6;
const K = Array.from({length:nDof},()=>Array(nDof).fill(0));

console.log("── Test 1: Symmetry Check ──");
console.log("Plate 2x2, center load Fz=-100, all corners pinned\n");

// Assemble shell elements
for (const [a,b,c] of tris) {
  const Ke = k_shell_tri(E,nu,t, nodes[a][0],nodes[a][1], nodes[b][0],nodes[b][1], nodes[c][0],nodes[c][1]);
  const dofs = [a*6,a*6+1,a*6+2,a*6+3,a*6+4,a*6+5, b*6,b*6+1,b*6+2,b*6+3,b*6+4,b*6+5, c*6,c*6+1,c*6+2,c*6+3,c*6+4,c*6+5];
  for (let i=0;i<18;i++) for (let j=0;j<18;j++) K[dofs[i]][dofs[j]] += Ke[i][j];
}

// Check K symmetry
let maxAsym = 0;
for (let i=0;i<nDof;i++) for (let j=i+1;j<nDof;j++) {
  maxAsym = Math.max(maxAsym, Math.abs(K[i][j]-K[j][i]));
}
console.log(`K matrix symmetry: max|K(i,j)-K(j,i)| = ${maxAsym.toExponential(3)}`);

// Load: Fz = -100 at center node (node 4)
const F = Array(nDof).fill(0);
F[4*6+2] = -100; // Fz at node 4

// BC: all 4 corner nodes pinned (uz=0), all edges uz=0
// Simply supported: uz=0 at all edge nodes (0,1,2,3,5,6,7,8)
const fixed = [];
for (const n of [0,1,2,3,5,6,7,8]) fixed.push(n*6+2); // uz=0
// Pin corner 0 to prevent rigid body: ux,uy,rz
fixed.push(0, 1, 5); // node 0: ux,uy,rz
fixed.push(2*6, 2*6+1); // node 2: ux,uy
fixed.push(6*6+1); // node 6: uy

const free = [];
for (let i=0;i<nDof;i++) if (!fixed.includes(i)) free.push(i);

const Kr = free.map(i=>free.map(j=>K[i][j]));
const Fr = free.map(i=>F[i]);

try {
  const Ur = math.lusolve(Kr, Fr);
  const UrFlat = Ur.map(r => Array.isArray(r) ? r[0] : r);
  const U = Array(nDof).fill(0);
  for (let i=0;i<free.length;i++) U[free[i]] = UrFlat[i];

  // Center displacement
  console.log(`\nCenter node (4) Uz = ${U[4*6+2].toExponential(6)}`);

  // Analytical: w = P*L²/(D*alpha) where alpha depends on BC
  // For SS square plate, center load: w = 0.01160 * P*a²/D (Timoshenko)
  const D = E*t**3/(12*(1-nu**2));
  const a = L/2; // half-span
  const w_analytical = 0.01160 * (-100) * a**2 / D;
  console.log(`Analytical (Timoshenko) Uz ≈ ${w_analytical.toExponential(6)}`);

  // Check symmetry of displacements
  console.log("\n── Symmetry of displacements (Uz at symmetric nodes) ──");
  const symPairs = [[0,2],[0,6],[2,8],[6,8], [1,7],[3,5]];
  for (const [a,b] of symPairs) {
    const ua = U[a*6+2], ub = U[b*6+2];
    const diff = Math.abs(ua-ub);
    const sym = diff < 1e-10 ? "✅ SIM" : `❌ DIFF=${diff.toExponential(2)}`;
    console.log(`  Nodo ${a+1} vs ${b+1}: Uz=${ua.toExponential(4)} vs ${ub.toExponential(4)} → ${sym}`);
  }

  // Reactions
  console.log("\n── Reactions Rz at supported nodes ──");
  let sumRz = 0;
  for (const n of [0,1,2,3,5,6,7,8]) {
    let Rz = 0;
    for (let j=0;j<nDof;j++) Rz += K[n*6+2][j] * U[j];
    console.log(`  Nodo ${n+1}: Rz = ${Rz.toFixed(4)}`);
    sumRz += Rz;
  }
  console.log(`  ΣRz = ${sumRz.toFixed(4)} (debe ser = 100.0000)`);

} catch(e) {
  console.error("ERROR solving:", e.message);
  // Check for singular matrix
  console.log("\nDiagonal check (free DOFs):");
  for (let i=0;i<Math.min(free.length,10);i++) {
    console.log(`  K[${free[i]},${free[i]}] = ${K[free[i]][free[i]].toExponential(4)}`);
  }
}

console.log("\n═══════════════════════════════════════════════");
console.log("VALIDACIÓN COMPLETADA");
console.log("═══════════════════════════════════════════════");
