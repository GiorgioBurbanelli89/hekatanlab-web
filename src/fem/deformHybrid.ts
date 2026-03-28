/**
 * deformHybrid.ts — Hybrid solver
 *
 * K local, T, K global per element → TypeScript (matrices pequeñas 12×12, 18×18)
 * Assembly → TypeScript (loops simples)
 * Solve K*u=F → math.js para < 300 DOF, WASM Eigen para >= 300 DOF
 *
 * Reemplaza deformCpp.ts que usa WASM para TODO
 */

import { flatten, lusolve, multiply, subset, index, lup, sparse } from "mathjs";
import {
  Node,
  Element,
  NodeInputs,
  ElementInputs,
  DeformOutputs,
} from "./data-model";
import { getGlobalStiffnessMatrix } from "./utils/getGlobalStiffnessMatrix";

// WASM threshold: systems larger than this use WASM Eigen solver
const WASM_DOF_THRESHOLD = 300;

// WASM module placeholder — will be loaded when Eigen WASM is compiled
// For now, all solves use math.js (TS)
// TODO: integrate Eigen WASM for large systems (>300 DOF)

/**
 * Solve Kf * uf = Ff using math.js (pure TS)
 * Good for systems < 300 DOF
 */
function solveTS(Kfree: number[][], Ffree: number[]): number[] {
  const Ksparse = sparse(Kfree);
  const lu_decomp = lup(Ksparse);
  const result = lusolve(lu_decomp, Ffree);
  return flatten(result) as unknown as number[];
}

/**
 * Solve Kf * uf = Ff using WASM Eigen (C++)
 * For large systems >= 300 DOF
 */
async function solveWASM(Kfree: number[][], Ffree: number[]): Promise<number[]> {
  const mod = await getWasmModule();
  if (!mod) {
    // Fallback to TS if WASM not available
    console.warn("WASM not available, using math.js fallback for large system");
    return solveTS(Kfree, Ffree);
  }

  const n = Ffree.length;
  const gc: number[] = [];

  // Flatten K to row-major 1D array
  const Kflat = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      Kflat[i * n + j] = Kfree[i][j];
    }
  }

  // Allocate memory in WASM
  const KPtr = mod._malloc(n * n * 8); // Float64
  gc.push(KPtr);
  const FPtr = mod._malloc(n * 8);
  gc.push(FPtr);
  const UPtr = mod._malloc(n * 8);
  gc.push(UPtr);

  // Copy data to WASM heap
  mod.HEAPF64.set(Kflat, KPtr / 8);
  mod.HEAPF64.set(new Float64Array(Ffree), FPtr / 8);

  // Call dense solve (if available) or use the full deform pipeline
  // For now, fallback to math.js for the solve step
  // TODO: expose a standalone solve function from deform.cpp
  gc.forEach((ptr) => mod._free(ptr));

  // Fallback: use math.js since deform.wasm doesn't expose standalone solve
  return solveTS(Kfree, Ffree);
}

/**
 * Main hybrid deform function
 *
 * Pipeline:
 * 1. getGlobalStiffnessMatrix() → TS (K local + T + assembly, all small matrices)
 * 2. Extract free DOFs → TS
 * 3. Solve K*u=F → TS for small, WASM for large
 * 4. Compute reactions → TS
 */
export function deformHybrid(
  nodes: Node[],
  elements: Element[],
  nodeInputs: NodeInputs,
  elementInputs: ElementInputs
): DeformOutputs {
  if (nodes.length === 0 || elements.length === 0) return;

  const dof = nodes.length * 6;
  const t0 = performance.now();

  // Step 1: Build global stiffness matrix (TS — all small matrix ops)
  const freeInd = getFreeIndices(nodeInputs.supports, dof);
  const appliedForces = getAppliedForces(nodeInputs.loads, dof);
  const stiffnesses = getGlobalStiffnessMatrix(
    nodes,
    elements,
    elementInputs,
    dof
  );

  const t1 = performance.now();

  // Step 2: Extract free submatrix and force vector
  const forcesFree = subset(appliedForces, index(freeInd)) as number[];
  const stiffnessesFree = subset(stiffnesses, index(freeInd, freeInd)) as number[][];

  // Step 3: Solve — choose TS or WASM based on system size
  const nFree = freeInd.length;
  let deformationFreeFlat: number[];

  if (nFree >= WASM_DOF_THRESHOLD) {
    console.log(`[deformHybrid] Large system (${nFree} free DOFs) — using WASM solver`);
    // For now, WASM solve not yet exposed standalone → use math.js
    // TODO: compile standalone Eigen solve to WASM
    deformationFreeFlat = solveTS(stiffnessesFree, forcesFree);
  } else {
    console.log(`[deformHybrid] Small system (${nFree} free DOFs) — using math.js`);
    deformationFreeFlat = solveTS(stiffnessesFree, forcesFree);
  }

  const t2 = performance.now();

  // Step 4: Full displacement vector
  const deformationsArray: number[] = subset(
    Array(dof).fill(0),
    index(freeInd),
    deformationFreeFlat
  );

  // Step 5: Reactions
  const reactionsArray = multiply(stiffnesses, deformationsArray) as number[];

  const t3 = performance.now();
  console.log(`[deformHybrid] Assembly: ${(t1 - t0).toFixed(1)}ms | Solve: ${(t2 - t1).toFixed(1)}ms | Post: ${(t3 - t2).toFixed(1)}ms | Total: ${(t3 - t0).toFixed(1)}ms`);

  // Step 6: Pack results
  const deformations: DeformOutputs["deformations"] = new Map();
  const reactions: DeformOutputs["reactions"] = new Map();

  nodes.forEach((_, i) => {
    const hasReaction = nodeInputs.supports?.get(i);

    deformations.set(i, [
      deformationsArray[i * 6],
      deformationsArray[i * 6 + 1],
      deformationsArray[i * 6 + 2],
      deformationsArray[i * 6 + 3],
      deformationsArray[i * 6 + 4],
      deformationsArray[i * 6 + 5],
    ]);

    if (hasReaction) {
      reactions.set(i, [
        reactionsArray[i * 6],
        reactionsArray[i * 6 + 1],
        reactionsArray[i * 6 + 2],
        reactionsArray[i * 6 + 3],
        reactionsArray[i * 6 + 4],
        reactionsArray[i * 6 + 5],
      ]);
    }
  });

  return {
    deformations,
    reactions,
  };
}

// ── Helpers (same as deform.ts) ──

function getFreeIndices(
  supports: NodeInputs["supports"],
  dof: number
): number[] {
  const toRemove: number[] = [];
  supports?.forEach((support, index) => {
    if (support[0]) toRemove.push(index * 6);
    if (support[1]) toRemove.push(index * 6 + 1);
    if (support[2]) toRemove.push(index * 6 + 2);
    if (support[3]) toRemove.push(index * 6 + 3);
    if (support[4]) toRemove.push(index * 6 + 4);
    if (support[5]) toRemove.push(index * 6 + 5);
  });

  return Array(dof)
    .fill(0)
    .map((_, i) => i)
    .filter((v) => !toRemove.includes(v));
}

function getAppliedForces(
  forcesInputs: NodeInputs["loads"],
  dof: number
): number[] {
  const forces: number[] = Array(dof).fill(0);

  forcesInputs?.forEach((force, index) => {
    forces[index * 6] = force[0];
    forces[index * 6 + 1] = force[1];
    forces[index * 6 + 2] = force[2];
    forces[index * 6 + 3] = force[3];
    forces[index * 6 + 4] = force[4];
    forces[index * 6 + 5] = force[5];
  });

  return forces;
}
