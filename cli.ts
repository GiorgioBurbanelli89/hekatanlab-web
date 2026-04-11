/**
 * HékatanLab CLI — Validación numérica rápida
 *
 * Ejecutar: npx tsx cli.ts
 *
 * Modelos de prueba:
 * 1. Truss 2D (3 barras) — verificación básica
 * 2. Frame 3D (portal) — frame 12 DOF
 * 3. Shell tri (placa simple) — shell 18 DOF
 * 4. Placa 4 nodos (2 triángulos) — placa rectangular
 */
import { deformHybrid } from "./src/fem/deformHybrid";
import { Node, Element, NodeInputs, ElementInputs, DeformOutputs } from "./src/fem/data-model";

function printHeader(title: string) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function printDisplacements(result: DeformOutputs, label: string) {
  if (!result?.deformations) {
    console.log(`  ❌ ${label}: No results`);
    return;
  }
  console.log(`\n  📊 ${label} — Desplazamientos:`);
  result.deformations.forEach((d, i) => {
    const ux = d[0].toExponential(6);
    const uy = d[1].toExponential(6);
    const uz = d[2].toExponential(6);
    const rx = d[3].toExponential(4);
    const ry = d[4].toExponential(4);
    const rz = d[5].toExponential(4);
    console.log(`  Node ${i}: ux=${ux}  uy=${uy}  uz=${uz}  rx=${rx}  ry=${ry}  rz=${rz}`);
  });
  if (result.reactions) {
    console.log(`\n  🔒 Reacciones:`);
    result.reactions.forEach((r, i) => {
      const fx = r[0].toFixed(4);
      const fy = r[1].toFixed(4);
      const fz = r[2].toFixed(4);
      console.log(`  Node ${i}: Fx=${fx}  Fy=${fy}  Fz=${fz}`);
    });
  }
}

// ═══════════════════════════════════════
// TEST 1: Truss 3D simple (3 nodos, 3 barras)
// ═══════════════════════════════════════
function testTruss3D() {
  printHeader("TEST 1: Truss 3D (3 nodos, 3 barras)");

  const nodes: Node[] = [[0,0,0], [4,0,0], [2,0,3]];
  const elements: Element[] = [[0,2], [1,2], [0,1]];

  const E = 200e3, A = 100;

  const nodeInputs: NodeInputs = {
    supports: new Map([
      [0, [true, true, true, true, true, true]],
      [1, [true, true, true, true, true, true]],
    ]),
    loads: new Map([
      [2, [0, 0, -100, 0, 0, 0]],
    ]),
  };

  const elementInputs: ElementInputs = {
    elasticities: new Map(elements.map((_, i) => [i, E])),
    areas: new Map(elements.map((_, i) => [i, A])),
    momentsOfInertiaZ: new Map(elements.map((_, i) => [i, 0])),
    momentsOfInertiaY: new Map(elements.map((_, i) => [i, 0])),
    shearModuli: new Map(elements.map((_, i) => [i, 0])),
    torsionalConstants: new Map(elements.map((_, i) => [i, 0])),
  };

  console.log("  Nodos:", nodes);
  console.log("  Elementos:", elements);
  console.log(`  E=${E}, A=${A}`);
  console.log("  Carga: Fz=-100 en nodo 2");
  console.log("  Apoyos: nodos 0,1 empotrados");

  const result = deformHybrid(nodes, elements, nodeInputs, elementInputs);
  printDisplacements(result, "Truss 3D");
  return result;
}

// ═══════════════════════════════════════
// TEST 2: Frame 3D (portal simple, 4 nodos)
// ═══════════════════════════════════════
function testFrame3D() {
  printHeader("TEST 2: Frame 3D Portal (4 nodos, 3 barras)");

  const nodes: Node[] = [[0,0,0], [0,0,3], [5,0,3], [5,0,0]];
  const elements: Element[] = [[0,1], [1,2], [2,3]];

  const E = 2.1e5, G = 8.1e4, A = 0.04, Iy = 1.33e-4, Iz = 1.33e-4, J = 2.66e-4;

  const nodeInputs: NodeInputs = {
    supports: new Map([
      [0, [true, true, true, true, true, true]],
      [3, [true, true, true, true, true, true]],
    ]),
    loads: new Map([
      [1, [10, 0, 0, 0, 0, 0]],
    ]),
  };

  const elementInputs: ElementInputs = {
    elasticities: new Map(elements.map((_, i) => [i, E])),
    areas: new Map(elements.map((_, i) => [i, A])),
    momentsOfInertiaZ: new Map(elements.map((_, i) => [i, Iz])),
    momentsOfInertiaY: new Map(elements.map((_, i) => [i, Iy])),
    shearModuli: new Map(elements.map((_, i) => [i, G])),
    torsionalConstants: new Map(elements.map((_, i) => [i, J])),
  };

  console.log("  Nodos:", nodes);
  console.log("  Elementos:", elements);
  console.log(`  E=${E}, G=${G}, A=${A}, Iy=${Iy}, Iz=${Iz}, J=${J}`);
  console.log("  Carga: Fx=10 en nodo 1");

  const result = deformHybrid(nodes, elements, nodeInputs, elementInputs);
  printDisplacements(result, "Frame 3D");
  return result;
}

// ═══════════════════════════════════════
// TEST 3: Shell tri (1 triángulo, 3 nodos, 18 DOF)
// ═══════════════════════════════════════
function testShellTri() {
  printHeader("TEST 3: Shell Tri (1 triángulo, 18 DOF)");

  const nodes: Node[] = [[0,0,0], [1,0,0], [0,1,0]];
  const elements: Element[] = [[0,1,2]];

  const E = 100, nu = 0.3, t = 1;
  const G = E / (2*(1+nu));

  const nodeInputs: NodeInputs = {
    supports: new Map([
      [0, [true, true, true, true, true, true]],
      [1, [true, true, true, true, true, true]],
    ]),
    loads: new Map([
      [2, [0, 0, -10, 0, 0, 0]],
    ]),
  };

  const elementInputs: ElementInputs = {
    elasticities: new Map([[0, E]]),
    elasticitiesOrthogonal: new Map([[0, 0]]),
    poissonsRatios: new Map([[0, nu]]),
    thicknesses: new Map([[0, t]]),
    shearModuli: new Map([[0, G]]),
  };

  console.log("  Nodos:", nodes);
  console.log("  Elementos:", elements);
  console.log(`  E=${E}, nu=${nu}, t=${t}, G=${G.toFixed(4)}`);
  console.log("  Carga: Fz=-10 en nodo 2");

  const result = deformHybrid(nodes, elements, nodeInputs, elementInputs);
  printDisplacements(result, "Shell Tri");
  return result;
}

// ═══════════════════════════════════════
// TEST 4: Placa rectangular (4 nodos, 2 triángulos)
// ═══════════════════════════════════════
function testPlate2Tri() {
  printHeader("TEST 4: Placa rectangular (4 nodos, 2 triángulos)");

  const nodes: Node[] = [[0,0,0], [2,0,0], [2,1,0], [0,1,0]];
  const elements: Element[] = [[0,1,2], [0,2,3]];

  const E = 100, nu = 0.3, t = 1;
  const G = E / (2*(1+nu));

  const nodeInputs: NodeInputs = {
    supports: new Map([
      [0, [true, true, true, true, true, true]],
      [1, [true, true, true, true, true, true]],
      [3, [true, true, true, true, true, true]],
    ]),
    loads: new Map([
      [2, [0, 0, -10, 0, 0, 0]],
    ]),
  };

  const elementInputs: ElementInputs = {
    elasticities: new Map(elements.map((_, i) => [i, E])),
    elasticitiesOrthogonal: new Map(elements.map((_, i) => [i, 0])),
    poissonsRatios: new Map(elements.map((_, i) => [i, nu])),
    thicknesses: new Map(elements.map((_, i) => [i, t])),
    shearModuli: new Map(elements.map((_, i) => [i, G])),
  };

  console.log("  Nodos:", nodes);
  console.log("  Elementos:", elements);
  console.log(`  E=${E}, nu=${nu}, t=${t}, G=${G.toFixed(4)}`);
  console.log("  Carga: Fz=-10 en nodo 2");
  console.log("  Apoyos: nodos 0,1,3 empotrados");

  const result = deformHybrid(nodes, elements, nodeInputs, elementInputs);
  printDisplacements(result, "Placa 2Tri");
  return result;
}

// ═══════════════════════════════════════
// TEST 5: Placa 9 nodos (8 triángulos) — malla 2x2
// ═══════════════════════════════════════
function testPlate9Nodes() {
  printHeader("TEST 5: Placa 9 nodos (8 triángulos, malla 2x2)");

  const Lx = 4, Ly = 3;
  const nodes: Node[] = [
    [0,0,0], [Lx/2,0,0], [Lx,0,0],
    [0,Ly/2,0], [Lx/2,Ly/2,0], [Lx,Ly/2,0],
    [0,Ly,0], [Lx/2,Ly,0], [Lx,Ly,0],
  ];

  // 2 tri per quad, 4 quads = 8 triangles
  const elements: Element[] = [
    [0,1,4], [0,4,3],
    [1,2,5], [1,5,4],
    [3,4,7], [3,7,6],
    [4,5,8], [4,8,7],
  ];

  const E = 100, nu = 0.3, t = 1;
  const G = E / (2*(1+nu));

  // Boundary nodes: 0,1,2,3,5,6,7,8 (all except center node 4)
  const boundaryNodes = [0,1,2,3,5,6,7,8];

  const nodeInputs: NodeInputs = {
    supports: new Map(
      boundaryNodes.map(i => [i, [true, true, true, true, true, true] as [boolean,boolean,boolean,boolean,boolean,boolean]])
    ),
    loads: new Map([
      [4, [0, 0, -10, 0, 0, 0]],
    ]),
  };

  const elementInputs: ElementInputs = {
    elasticities: new Map(elements.map((_, i) => [i, E])),
    elasticitiesOrthogonal: new Map(elements.map((_, i) => [i, 0])),
    poissonsRatios: new Map(elements.map((_, i) => [i, nu])),
    thicknesses: new Map(elements.map((_, i) => [i, t])),
    shearModuli: new Map(elements.map((_, i) => [i, G])),
  };

  console.log(`  Placa ${Lx}x${Ly}, malla 2x2 (9 nodos, 8 tri)`);
  console.log(`  E=${E}, nu=${nu}, t=${t}`);
  console.log("  Carga: Fz=-10 en nodo 4 (centro)");
  console.log("  Apoyos: todos los bordes empotrados");

  const result = deformHybrid(nodes, elements, nodeInputs, elementInputs);
  printDisplacements(result, "Placa 9N");
  return result;
}

// ═══════════════════════════════════════
// TEST 6: Plate — Réplica del example awatif plate
// Malla rectangular 15x10, carga distribuida, bordes empotrados
// ═══════════════════════════════════════
function testPlateAwatif() {
  printHeader("TEST 6: Plate (réplica awatif example) — malla 5x4");

  // Rectangular mesh 15x10 con subdivisiones 5x4 = 20 quads = 40 tri
  const Lx = 15, Ly = 10;
  const nx = 5, ny = 4;
  const dx = Lx / nx, dy = Ly / ny;

  // Generar nodos
  const nodes: Node[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      nodes.push([i * dx, j * dy, 0]);
    }
  }

  // Generar elementos (2 tri por quad)
  const elements: Element[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n0 = j * (nx + 1) + i;
      const n1 = n0 + 1;
      const n2 = n0 + (nx + 1);
      const n3 = n2 + 1;
      elements.push([n0, n1, n3]);
      elements.push([n0, n3, n2]);
    }
  }

  // Propiedades (igual que plate example)
  const E = 100, nu = 0.3, t = 1;
  const G = E / (2 * (1 + nu));

  // Boundary: nodos en los bordes
  const boundaryIndices: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      if (i === 0 || i === nx || j === 0 || j === ny) {
        boundaryIndices.push(j * (nx + 1) + i);
      }
    }
  }

  // Carga distribuida Fz = -3 en TODOS los nodos (igual que plate example)
  const nodeInputs: NodeInputs = {
    supports: new Map(
      boundaryIndices.map(i => [i, [true, true, true, true, true, true] as [boolean,boolean,boolean,boolean,boolean,boolean]])
    ),
    loads: new Map(
      nodes.map((_, i) => [i, [0, 0, -3, 0, 0, 0] as [number,number,number,number,number,number]])
    ),
  };

  const elementInputs: ElementInputs = {
    elasticities: new Map(elements.map((_, i) => [i, E])),
    elasticitiesOrthogonal: new Map(elements.map((_, i) => [i, 0])),
    poissonsRatios: new Map(elements.map((_, i) => [i, nu])),
    thicknesses: new Map(elements.map((_, i) => [i, t])),
    shearModuli: new Map(elements.map((_, i) => [i, G])),
  };

  console.log(`  Placa ${Lx}x${Ly}, malla ${nx}x${ny} (${nodes.length} nodos, ${elements.length} tri)`);
  console.log(`  E=${E}, nu=${nu}, t=${t}, G=${G.toFixed(4)}`);
  console.log("  Carga: Fz=-3 distribuida en TODOS los nodos");
  console.log(`  Apoyos: ${boundaryIndices.length} nodos de borde empotrados`);
  console.log(`  DOFs totales: ${nodes.length * 6}, DOFs libres: ${(nodes.length - boundaryIndices.length) * 6}`);

  const result = deformHybrid(nodes, elements, nodeInputs, elementInputs);

  if (result?.deformations) {
    // Encontrar max Uz (nodo con mayor desplazamiento vertical)
    let maxUz = 0, maxUzNode = -1;
    let minUz = 0, minUzNode = -1;
    result.deformations.forEach((d, i) => {
      if (d[2] < minUz) { minUz = d[2]; minUzNode = i; }
      if (Math.abs(d[2]) > Math.abs(maxUz)) { maxUz = d[2]; maxUzNode = i; }
    });

    console.log(`\n  📊 Resultados:`);
    console.log(`  Max |Uz| = ${maxUz.toExponential(6)} en nodo ${maxUzNode} (${nodes[maxUzNode]})`);

    // Mostrar nodos interiores (no boundary)
    const interior = [];
    for (let i = 0; i < nodes.length; i++) {
      if (!boundaryIndices.includes(i)) interior.push(i);
    }
    console.log(`\n  Nodos interiores (${interior.length}):`);
    for (const i of interior) {
      const d = result.deformations.get(i)!;
      console.log(`  Node ${i} (${nodes[i][0].toFixed(1)},${nodes[i][1].toFixed(1)}): uz=${d[2].toExponential(6)}  rx=${d[3].toExponential(4)}  ry=${d[4].toExponential(4)}`);
    }

    // Verificar equilibrio (Rz_total - F_total = 0)
    let sumRz = 0;
    result.reactions?.forEach((r) => { sumRz += r[2]; });
    const totalLoad = nodes.length * (-3);
    const freeLoad = (nodes.length - boundaryIndices.length) * (-3);
    console.log(`\n  🔒 Equilibrio:`);
    console.log(`    Carga total = ${totalLoad} (${nodes.length} nodos × -3)`);
    console.log(`    Carga nodos libres = ${freeLoad} (${nodes.length - boundaryIndices.length} nodos × -3)`);
    console.log(`    ΣRz (reacciones) = ${sumRz.toFixed(4)}`);
    console.log(`    ΣRz + Carga total = ${(sumRz + totalLoad).toFixed(6)} (debe ser ~0)`);
  }

  return result;
}

// ═══════════════════════════════════════
// TEST 7: Plate Delaunay (Triangle Shewchuk WASM)
// Geometría exacta del example awatif plate
// ═══════════════════════════════════════
async function testPlateDelaunay() {
  printHeader("TEST 7: Plate Delaunay (Triangle Shewchuk WASM)");

  // Load Triangle WASM
  const { createRequire } = await import('module');
  const require2 = createRequire(import.meta.url);
  const createTriangle = require2('./triangle_node.cjs');
  const mod = await createTriangle();
  console.log("  Triangle WASM cargado");

  // Plate geometry: same as awatif example
  const pts = [0,0, 15,0, 15,10, 0,5];
  const segs = [0,1, 1,2, 2,3, 3,0];

  // Allocate WASM memory
  const ptsPtr = mod._malloc(pts.length * 8);
  mod.HEAPF64.set(new Float64Array(pts), ptsPtr / 8);
  const segsPtr = mod._malloc(segs.length * 4);
  mod.HEAP32.set(new Int32Array(segs), segsPtr / 4);

  // Triangulate with maxArea=3, minAngle=30 (same as awatif)
  const ntri = mod._triangulate_mesh(ptsPtr, 4, segsPtr, 4, 3.0, 30.0);
  const nout = mod._get_npoints();

  // Read output
  const outPts = new Float64Array(mod.HEAPF64.buffer, mod._get_points(), nout * 2);
  const outTri = new Int32Array(mod.HEAP32.buffer, mod._get_triangles(), ntri * 3);
  const outM = new Int32Array(mod.HEAP32.buffer, mod._get_pointmarkers(), nout);

  // Build nodes (2D -> 3D, z=0)
  const nodes: Node[] = [];
  for (let i = 0; i < nout; i++) {
    nodes.push([outPts[i*2], outPts[i*2+1], 0]);
  }

  // Build elements
  const elements: Element[] = [];
  for (let i = 0; i < ntri; i++) {
    elements.push([outTri[i*3], outTri[i*3+1], outTri[i*3+2]]);
  }

  // Boundary indices
  const boundaryIndices: number[] = [];
  for (let i = 0; i < nout; i++) {
    if (outM[i]) boundaryIndices.push(i);
  }

  mod._free(ptsPtr);
  mod._free(segsPtr);
  mod._free_output();

  // Properties (same as plate example)
  const E = 100, nu = 0.3, t = 1;
  const G = E / (2*(1+nu));

  console.log(`  Placa [0,0]-[15,0]-[15,10]-[0,5]`);
  console.log(`  Delaunay: ${nodes.length} nodos, ${elements.length} tri`);
  console.log(`  Borde: ${boundaryIndices.length} nodos, Interior: ${nodes.length - boundaryIndices.length}`);
  console.log(`  E=${E}, nu=${nu}, t=${t}, G=${G.toFixed(4)}`);
  console.log("  Carga: Fz=-3 distribuida en TODOS los nodos");

  const nodeInputs: NodeInputs = {
    supports: new Map(
      boundaryIndices.map(i => [i, [true, true, true, true, true, true] as [boolean,boolean,boolean,boolean,boolean,boolean]])
    ),
    loads: new Map(
      nodes.map((_, i) => [i, [0, 0, -3, 0, 0, 0] as [number,number,number,number,number,number]])
    ),
  };

  const elementInputs: ElementInputs = {
    elasticities: new Map(elements.map((_, i) => [i, E])),
    elasticitiesOrthogonal: new Map(elements.map((_, i) => [i, 0])),
    poissonsRatios: new Map(elements.map((_, i) => [i, nu])),
    thicknesses: new Map(elements.map((_, i) => [i, t])),
    shearModuli: new Map(elements.map((_, i) => [i, G])),
  };

  console.log(`  DOFs: ${nodes.length * 6} total, ${(nodes.length - boundaryIndices.length) * 6} libres`);

  const result = deformHybrid(nodes, elements, nodeInputs, elementInputs);

  if (result?.deformations) {
    let maxUz = 0, maxNode = -1;
    result.deformations.forEach((d, i) => {
      if (Math.abs(d[2]) > Math.abs(maxUz)) { maxUz = d[2]; maxNode = i; }
    });

    console.log(`\n  📊 Resultados:`);
    console.log(`  Max |Uz| = ${maxUz.toExponential(6)} en nodo ${maxNode} (${nodes[maxNode].map(v => v.toFixed(2))})`);

    // Show interior nodes
    const interior: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (!boundaryIndices.includes(i)) interior.push(i);
    }

    // Sort by Uz for clarity
    interior.sort((a, b) => {
      const ua = result.deformations!.get(a)![2];
      const ub = result.deformations!.get(b)![2];
      return ua - ub;
    });

    console.log(`\n  Nodos interiores (${interior.length}) — ordenados por Uz:`);
    for (const i of interior) {
      const d = result.deformations.get(i)!;
      console.log(`  N${i} (${nodes[i][0].toFixed(2)},${nodes[i][1].toFixed(2)}): Uz=${d[2].toExponential(6)}`);
    }

    // Equilibrium
    let sumRz = 0;
    result.reactions?.forEach((r) => { sumRz += r[2]; });
    const totalLoad = nodes.length * (-3);
    console.log(`\n  🔒 Equilibrio: ΣRz + Carga = ${(sumRz + totalLoad).toFixed(6)} (debe ser ~0)`);
  }

  return result;
}

// ═══════════════════════════════════════
// EJECUTAR TODOS
// ═══════════════════════════════════════
async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║   HékatanLab CLI — Validación numérica                ║");
  console.log("║   deformHybrid (TS + math.js) + Triangle WASM        ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  testTruss3D();
  testFrame3D();
  testShellTri();
  testPlate2Tri();
  testPlate9Nodes();
  testPlateAwatif();
  await testPlateDelaunay();

  console.log("\n" + "═".repeat(60));
  console.log("  ✅ Todos los tests completados");
  console.log("═".repeat(60));
}

main();
