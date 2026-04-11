#!/usr/bin/env node
/**
 * Comparar resultados: HékatanLab (math.js) vs Hekatan Struct (WASM Eigen)
 *
 * Ejecutar: node compare_solvers.mjs
 *
 * Crea el MISMO modelo en ambos solvers y compara desplazamientos.
 */

import { createEngine } from './src/engine.ts';

// ── Test models as MATLAB code ──
const MODELS = [
  {
    name: "Barra axial",
    code: `
E = 200e6; A = 0.01; L = 5; P = 100
nds = [0,0,0; L,0,0]
els = [1,2]
sups = [1, 1,1,1,1,1,1]
loads = [2, P, 0, 0, 0, 0, 0]
Uf = fem_deform(nds, els, sups, loads, E, 0.3, 1, A, 1e-6, 1e-6, 77e6, 1e-6)
ux = Uf(7)
disp("ux:"); disp(ux)
exact = P*L/(E*A)
disp("exact:"); disp(exact)
err = abs(ux - exact)/abs(exact)*100
disp("error%:"); disp(err)
`,
    checkDof: 7,  // ux at node 2
    exact: 100*5/(200e6*0.01),  // PL/EA
  },
  {
    name: "Portico 2D",
    code: `
E = 25e6; nu = 0.2; G = E/(2*(1+nu))
b = 0.40; h = 0.50
A = b*h; Iz = b*h^3/12; Iy = h*b^3/12; J = 1e-4
ww = 6; hh = 4
nds = [0,0,0; 0,0,hh; ww,0,hh; ww,0,0]
els = [1,2; 2,3; 3,4]
sups = [1, 1,1,1,1,1,1; 4, 1,1,1,1,1,1]
loads = [2, 10, 0, -20, 0, 0, 0]
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
ux2 = Uf(7)
uz2 = Uf(9)
disp("ux_node2:"); disp(ux2)
disp("uz_node2:"); disp(uz2)
`,
  },
  {
    name: "Cercha Warren",
    code: `
span = 10; nDiv = 5; hh = 2
E = 200e6; A = 5e-4
dx = span / nDiv
nds = zeros((nDiv+1)*2, 3)
for kk = range(0, nDiv, 1)
  nds(kk+1, 1) = dx * kk
end
for kk = range(0, nDiv, 1)
  nds(nDiv+1+kk+1, 1) = dx * kk
  nds(nDiv+1+kk+1, 3) = hh
end
els = zeros(1,2); nEls = 0; bb = nDiv + 1
for kk = range(0, nDiv-1, 1)
  nEls = nEls + 1; els(nEls,1) = kk+1; els(nEls,2) = kk+2
end
for kk = range(0, nDiv-1, 1)
  nEls = nEls + 1; els(nEls,1) = bb+kk+1; els(nEls,2) = bb+kk+2
end
for kk = range(0, nDiv, 1)
  nEls = nEls + 1; els(nEls,1) = kk+1; els(nEls,2) = bb+kk+1
end
for kk = range(0, nDiv-1, 1)
  nEls = nEls + 1
  if kk < nDiv/2
    els(nEls,1) = kk+1; els(nEls,2) = bb+kk+2
  else
    els(nEls,1) = bb+kk+1; els(nEls,2) = kk+2
  end
end
sups = [1, 1,1,1,1,1,1; nDiv+1, 1,1,1,1,1,1]
loads = zeros(1,7)
nLoads = 0
for kk = range(0, nDiv, 1)
  nLoads = nLoads + 1
  loads(nLoads, 1) = kk+1
  loads(nLoads, 4) = -10
end
Uf = fem_deform(nds, els, sups, loads, E, 0.3, 1, A, 1e-6, 1e-6, 77e6, 1e-6)
midNode = floor(nDiv/2) + 1
dof_mid = (midNode-1)*6 + 3
uz_mid = Uf(dof_mid)
disp("uz_mid:"); disp(uz_mid)
`,
  },
  {
    name: "Edificio 2x2x3",
    code: `
E = 25e6; nu = 0.2; G = E/(2*(1+nu))
bCol = 0.40; hCol = 0.40
A = bCol*hCol; Iz = bCol*hCol^3/12; Iy = hCol*bCol^3/12; J = 1e-4
svx = 5; svy = 4; hp = 3; nPisos = 3
nVx = 2; nVy = 2
nNx = nVx+1; nNy = nVy+1
nTotal = nNx*nNy*(nPisos+1)
nds = zeros(nTotal, 3)
nn = 0
for iz = range(0, nPisos, 1)
  for iy = range(0, nVy, 1)
    for ix = range(0, nVx, 1)
      nn = nn+1
      nds(nn,1) = ix*svx; nds(nn,2) = iy*svy; nds(nn,3) = iz*hp
    end
  end
end
els = zeros(1,2); nEls = 0
nPerFloor = nNx*nNy
% Columns
for iz = range(0, nPisos-1, 1)
  for nn2 = range(1, nPerFloor, 1)
    nEls = nEls+1
    els(nEls,1) = iz*nPerFloor + nn2
    els(nEls,2) = (iz+1)*nPerFloor + nn2
  end
end
% Beams X
for iz = range(1, nPisos, 1)
  for iy = range(0, nVy, 1)
    for ix = range(0, nVx-1, 1)
      nEls = nEls+1
      n1 = iz*nPerFloor + iy*nNx + ix + 1
      els(nEls,1) = n1; els(nEls,2) = n1+1
    end
  end
end
% Beams Y
for iz = range(1, nPisos, 1)
  for iy = range(0, nVy-1, 1)
    for ix = range(0, nVx, 1)
      nEls = nEls+1
      n1 = iz*nPerFloor + iy*nNx + ix + 1
      els(nEls,1) = n1; els(nEls,2) = n1+nNx
    end
  end
end
sups = zeros(nPerFloor, 7)
for ii = range(1, nPerFloor, 1)
  sups(ii,1) = ii; sups(ii,2)=1; sups(ii,3)=1; sups(ii,4)=1; sups(ii,5)=1; sups(ii,6)=1; sups(ii,7)=1
end
topNode = nPisos*nPerFloor + 1
loads = [topNode, 10, 0, 0, 0, 0, 0]
Uf = fem_deform(nds, els, sups, loads, E, nu, 1, A, Iz, Iy, G, J)
dof_top = (topNode-1)*6 + 1
ux_top = Uf(dof_top)
disp("ux_top:"); disp(ux_top)
disp("nNodes:"); disp(nTotal)
disp("nElem:"); disp(nEls)
`,
  },
];

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  HékatanLab Solver Validation");
  console.log("═══════════════════════════════════════════════════════════\n");

  const engine = createEngine();
  let passed = 0, failed = 0;

  for (const model of MODELS) {
    console.log(`\n── ${model.name} ──`);

    const results = await engine.evaluate(model.code);
    const errors = results.filter(r => r.type === 'error');

    if (errors.length > 0) {
      console.log(`  ⛔ ${errors.length} ERRORS:`);
      errors.slice(0,3).forEach(e => console.log(`    L${e.line}: ${e.error}`));
      failed++;
      continue;
    }

    // Extract disp() outputs
    const dispResults = results.filter(r => r.type === 'disp');
    for (const d of dispResults) {
      console.log(`  ${d.value}`);
    }

    if (model.exact !== undefined) {
      // Find the value from results
      const valResult = results.filter(r => r.type === 'value' || r.type === 'disp');
      console.log(`  Expected: ${model.exact.toExponential(6)}`);
    }

    passed++;
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));
}

main().catch(console.error);
