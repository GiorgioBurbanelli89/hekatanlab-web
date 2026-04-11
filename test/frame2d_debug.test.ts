/**
 * Frame 2D template debug test
 * Run: npx vitest run test/frame2d_debug.test.ts
 *
 * Checks whether the Frame 2D template assembles Kg correctly and can solve.
 */
import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine';

function getResult(results: any[], varName: string) {
  const r = results.filter(r => r.varName === varName);
  return r.length > 0 ? r[r.length - 1].value : undefined;
}

function getErrors(results: any[]) {
  return results.filter(r => r.type === 'error');
}

function toArray(val: any): any {
  if (val && typeof val.toArray === 'function') return val.toArray();
  return val;
}

function flatDiag(mat: any): number[] {
  const arr = toArray(mat);
  const n = arr.length;
  const diag: number[] = [];
  for (let i = 0; i < n; i++) {
    diag.push(Number(Array.isArray(arr[i]) ? arr[i][i] : arr[i]));
  }
  return diag;
}

// ──────────────────────────────────────────────────────────
// Step 1: k_frame2d returns a valid 6×6 matrix
// ──────────────────────────────────────────────────────────
describe('Step 1 — k_frame2d returns 6×6 stiffness matrix', () => {
  it('k_frame2d(200e6, 0.01, 8.33e-5, 4) → 6×6, non-zero diagonal', async () => {
    const engine = createEngine();
    const results = await engine.evaluate(`
E = 200e6;
A = 0.01;
I_sec = 8.33e-5;
L = 4;
Ke = k_frame2d(E, A, I_sec, L)
`);
    const errors = getErrors(results);
    if (errors.length) console.error('ERRORS:', errors.map(e => e.error));
    expect(errors.length).toBe(0);

    // Log all results to understand what the engine captures
    console.log('[Step1] all results:', results.map(r => `type=${r.type} varName=${r.varName} value=${JSON.stringify(r.value)?.slice(0,60)}`));

    const Ke = toArray(getResult(results, 'Ke'));
    console.log('[Step1] Ke type:', typeof Ke, Array.isArray(Ke) ? `${Ke.length}x${Ke[0]?.length}` : '?');
    expect(Ke).toBeDefined();
    expect(Array.isArray(Ke)).toBe(true);
    expect(Ke.length).toBe(6);
    expect(Ke[0].length).toBe(6);

    const diag = [0,1,2,3,4,5].map(i => Number(Ke[i][i]));
    console.log('[Step1] Ke diagonal:', diag);
    for (const d of diag) {
      expect(Math.abs(d)).toBeGreaterThan(0);
    }
  });

  it('k_frame2d with disp — check returned value directly', async () => {
    const engine = createEngine();
    const results = await engine.evaluate(`
E = 200e6;
A = 0.01;
I_sec = 8.33e-5;
L = 4;
Ke = k_frame2d(E, A, I_sec, L);
disp(Ke)
`);
    const errors = getErrors(results);
    if (errors.length) console.error('ERRORS:', errors.map(e => e.error));
    expect(errors.length).toBe(0);
    const disps = results.filter(r => r.type === 'disp');
    expect(disps.length).toBeGreaterThan(0);
    const Ke = toArray(disps[0].value);
    console.log('[Step1b] Ke[0][0]:', Ke[0]?.[0], 'Ke[1][1]:', Ke[1]?.[1]);
    expect(Ke.length).toBe(6);
    expect(Math.abs(Ke[0][0])).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────
// Step 1c: assemble works outside a loop (baseline)
// ──────────────────────────────────────────────────────────
describe('Step 1c — assemble outside loop (baseline)', () => {
  it('assemble single 6x6 element into 12x12 Kg at dofs [1..6]', async () => {
    const engine = createEngine();
    const results = await engine.evaluate(`
E = 200e6;
A = 0.01;
I_sec = 8.33e-5;
L = 4;
Kg = zeros(12, 12);
Ke = k_frame2d(E, A, I_sec, L);
dv = [1, 2, 3, 4, 5, 6];
Kg = assemble(Kg, Ke, dv)
disp(Kg)
`);
    const errors = getErrors(results);
    if (errors.length) console.error('ERRORS 1c:', errors.map(e => e.error));
    expect(errors.length).toBe(0);
    const disps = results.filter(r => r.type === 'disp');
    const Kg = toArray(disps[0].value);
    const diag = [0,1,2,3,4,5].map(i => Number(Kg[i][i]));
    console.log('[Step1c] Kg diagonal after 1 element (dofs 1-6):', diag);
    for (const d of diag) {
      expect(Math.abs(d)).toBeGreaterThan(0);
    }
  });

  it('assemble inside loop — does loop body assignment persist?', async () => {
    const engine = createEngine();
    const results = await engine.evaluate(`
E = 200e6;
A = 0.01;
I_sec = 8.33e-5;
L = 4;
Kg = zeros(12, 12);
Ke = k_frame2d(E, A, I_sec, L);
for ei = range(1, 1, 1)
  dv = [1, 2, 3, 4, 5, 6];
  Kg = assemble(Kg, Ke, dv);
end
disp(Kg)
`);
    const errors = getErrors(results);
    if (errors.length) console.error('ERRORS 1c-loop:', errors.map(e => e.error));
    expect(errors.length).toBe(0);
    const disps = results.filter(r => r.type === 'disp');
    const Kg = toArray(disps[0].value);
    const diag = [0,1,2,3,4,5].map(i => Number(Kg[i][i]));
    console.log('[Step1c-loop] Kg diagonal after loop (1 iter, dofs 1-6):', diag);
    for (const d of diag) {
      expect(Math.abs(d)).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────
// Step 2: dofMap indexing inside a for loop
// ──────────────────────────────────────────────────────────
describe('Step 2 — dofMap(ei,j) indexing in for loop', () => {
  it('dofMap(1,1)...(1,6) → [1,2,3,4,5,6] and dofMap(2,1)...(2,6) → [4,5,6,7,8,9]', async () => {
    const engine = createEngine();
    const results = await engine.evaluate(`
dofMap = [1,2,3,4,5,6; 4,5,6,7,8,9; 7,8,9,10,11,12]
row1 = zeros(1, 6);
row2 = zeros(1, 6);
for ei = range(1, 2, 1)
  dv = [dofMap(ei,1), dofMap(ei,2), dofMap(ei,3), dofMap(ei,4), dofMap(ei,5), dofMap(ei,6)];
  if ei == 1
    row1 = dv;
  end
  if ei == 2
    row2 = dv;
  end
end
disp(row1)
disp(row2)
`);
    const errors = getErrors(results);
    if (errors.length) console.error('ERRORS:', errors.map(e => e.error));
    expect(errors.length).toBe(0);

    const disps = results.filter(r => r.type === 'disp');
    console.log('[Step2] disp count:', disps.length);
    expect(disps.length).toBeGreaterThanOrEqual(2);

    const r1 = toArray(disps[disps.length - 2].value).flat().map(Number);
    const r2 = toArray(disps[disps.length - 1].value).flat().map(Number);
    console.log('[Step2] row1 (ei=1):', r1);
    console.log('[Step2] row2 (ei=2):', r2);

    expect(r1).toEqual([1,2,3,4,5,6]);
    expect(r2).toEqual([4,5,6,7,8,9]);
  });
});

// ──────────────────────────────────────────────────────────
// Step 3: Kg assembly — diagonal non-zero after assembly
// ──────────────────────────────────────────────────────────
describe('Step 3 — Kg assembly diagonal after 3 elements', () => {
  it('Kg diagonal [0..11] should be non-zero at DOFs 0-11 after assembly', async () => {
    const engine = createEngine();
    const results = await engine.evaluate(`
E = 200e6;
A = 0.01;
I_sec = 8.33e-5;

nds = [0,0,0; 0,0,4; 6,0,4; 6,0,0]
els = [1,2; 2,3; 3,4]

nDof = 12;
Kg = zeros(nDof, nDof);

nElem = 3;
dofMap = [1,2,3,4,5,6; 4,5,6,7,8,9; 7,8,9,10,11,12]

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

  Keg = transpose(Tr) * Ke * Tr;
  dv = [dofMap(ei,1), dofMap(ei,2), dofMap(ei,3), dofMap(ei,4), dofMap(ei,5), dofMap(ei,6)];
  Kg = assemble(Kg, Keg, dv);
end

disp(Kg)
`);
    const errors = getErrors(results);
    if (errors.length) console.error('ERRORS step3:', errors.map(e => e.error));
    expect(errors.length).toBe(0);

    const disps = results.filter(r => r.type === 'disp');
    expect(disps.length).toBeGreaterThan(0);

    const Kg = toArray(disps[disps.length - 1].value);
    const diag = flatDiag(Kg);
    console.log('[Step3] Kg diagonal (1-indexed: 1..12):', diag);

    // Fixed DOFs: 1,2,3,10,11,12 → indices 0,1,2,9,10,11
    // Free DOFs: 4,5,6,7,8,9 → indices 3,4,5,6,7,8
    const freeDiag = diag.slice(3, 9);
    const fixedDiag = diag.slice(0, 3).concat(diag.slice(9, 12));
    console.log('[Step3] Free DOFs diagonal (4-9):', freeDiag);
    console.log('[Step3] Fixed DOFs diagonal (1-3, 10-12):', fixedDiag);

    // All free DOF diagonal entries must be non-zero
    for (let i = 0; i < freeDiag.length; i++) {
      expect(Math.abs(freeDiag[i])).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────
// Step 4: solve_fem with regularization
// ──────────────────────────────────────────────────────────
describe('Step 4 — solve_fem with fixed BCs (nodes 1 and 4 pinned)', () => {
  it('solve_fem returns displacement vector with free DOFs non-zero', async () => {
    const engine = createEngine();
    const results = await engine.evaluate(`
E = 200e6;
A = 0.01;
I_sec = 8.33e-5;

nds = [0,0,0; 0,0,4; 6,0,4; 6,0,0]
els = [1,2; 2,3; 3,4]

nDof = 12;
Kg = zeros(nDof, nDof);

nElem = 3;
dofMap = [1,2,3,4,5,6; 4,5,6,7,8,9; 7,8,9,10,11,12]

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

  Keg = transpose(Tr) * Ke * Tr;
  dv = [dofMap(ei,1), dofMap(ei,2), dofMap(ei,3), dofMap(ei,4), dofMap(ei,5), dofMap(ei,6)];
  Kg = assemble(Kg, Keg, dv);
end

Fv = zeros(nDof, 1);
Fv(4) = 10

fixed = [1, 2, 3, 10, 11, 12]
Uf = solve_fem(Kg, Fv, fixed)
disp(Uf)
`);
    const errors = getErrors(results);
    if (errors.length) console.error('ERRORS step4:', errors.map(e => e.error));
    expect(errors.length).toBe(0);

    const disps = results.filter(r => r.type === 'disp');
    expect(disps.length).toBeGreaterThan(0);

    const Uf = toArray(disps[disps.length - 1].value).flat().map(Number);
    console.log('[Step4] Uf (12 DOFs):', Uf);

    // Free DOFs 4-9 (index 3-8) must be non-zero (Fx=10 at node 2)
    const freeDofs = Uf.slice(3, 9);
    console.log('[Step4] Free DOF displacements (DOFs 4-9):', freeDofs);
    const anyNonZero = freeDofs.some(v => Math.abs(v) > 1e-15);
    expect(anyNonZero).toBe(true);

    // Fixed DOFs 1-3, 10-12 should be zero
    const fixedDofs = Uf.slice(0, 3).concat(Uf.slice(9, 12));
    console.log('[Step4] Fixed DOF displacements (should be 0):', fixedDofs);
    for (const v of fixedDofs) {
      expect(Math.abs(v)).toBeLessThan(1e-10);
    }
  });
});

// ──────────────────────────────────────────────────────────
// Step 5: Full template end-to-end (no show3d/show_deformed)
// ──────────────────────────────────────────────────────────
describe('Step 5 — Full Frame 2D template (skipping visualization)', () => {
  it('runs without error and Uf has correct shape', async () => {
    const engine = createEngine();
    // Template code from templates.ts line 913, removing show3d/show_deformed/show_diagram calls
    const results = await engine.evaluate(`
E = 200e6;
A = 0.01;
I_sec = 8.33e-5;
Lv = 4;

ea = E * A / Lv
Ka = ea * [1, -1; -1, 1]

EIL = E * I_sec;
a = 12 * EIL / Lv^3;
b = 6 * EIL / Lv^2;
c4 = 4 * EIL / Lv;
c2 = 2 * EIL / Lv;
Kb = [a, b, -a, b; b, c4, -b, c2; -a, -b, a, -b; b, c2, -b, c4]

Ke_local = zeros(6, 6);
Ke_local(1,1) = Ka(1,1); Ke_local(1,4) = Ka(1,2);
Ke_local(4,1) = Ka(2,1); Ke_local(4,4) = Ka(2,2);
Ke_local(2,2) = Kb(1,1); Ke_local(2,3) = Kb(1,2); Ke_local(2,5) = Kb(1,3); Ke_local(2,6) = Kb(1,4);
Ke_local(3,2) = Kb(2,1); Ke_local(3,3) = Kb(2,2); Ke_local(3,5) = Kb(2,3); Ke_local(3,6) = Kb(2,4);
Ke_local(5,2) = Kb(3,1); Ke_local(5,3) = Kb(3,2); Ke_local(5,5) = Kb(3,3); Ke_local(5,6) = Kb(3,4);
Ke_local(6,2) = Kb(4,1); Ke_local(6,3) = Kb(4,2); Ke_local(6,5) = Kb(4,3); Ke_local(6,6) = Kb(4,4);
Ke_local

nds = [0,0,0; 0,0,4; 6,0,4; 6,0,0]
els = [1,2; 2,3; 3,4]

nDof = 12;
Kg = zeros(nDof, nDof);

nElem = 3;
dofMap = [1,2,3,4,5,6; 4,5,6,7,8,9; 7,8,9,10,11,12]

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

  Keg = transpose(Tr) * Ke * Tr;
  dv = [dofMap(ei,1), dofMap(ei,2), dofMap(ei,3), dofMap(ei,4), dofMap(ei,5), dofMap(ei,6)];
  Kg = assemble(Kg, Keg, dv);
end

Fv = zeros(nDof, 1);
Fv(4) = 10

fixed = [1, 2, 3, 10, 11, 12]
Uf = solve_fem(Kg, Fv, fixed)

nElem2 = 3;
fAll = zeros(nElem2, 6);
for ei = range(1, nElem2, 1)
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

disp(Uf)
disp(fAll)
`);

    const errors = getErrors(results);
    if (errors.length) {
      console.error('[Step5] ERRORS:');
      for (const e of errors) console.error('  line', e.line, ':', e.error, '|', e.input);
    }
    expect(errors.length).toBe(0);

    const disps = results.filter(r => r.type === 'disp');
    expect(disps.length).toBeGreaterThanOrEqual(2);

    const Uf = toArray(disps[disps.length - 2].value).flat().map(Number);
    const fAll = toArray(disps[disps.length - 1].value);
    console.log('[Step5] Uf:', Uf);
    console.log('[Step5] fAll:', fAll);

    // Uf should be length 12
    expect(Uf.length).toBe(12);

    // Free DOFs 4-9 must be non-zero
    const freeDofs = Uf.slice(3, 9);
    expect(freeDofs.some(v => Math.abs(v) > 1e-15)).toBe(true);
  });
});
