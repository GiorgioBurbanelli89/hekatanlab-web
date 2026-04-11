import { describe, it, expect } from 'vitest';
import { getGlobalStiffnessMatrix } from '../src/fem/utils/getGlobalStiffnessMatrix';
import { getLocalStiffnessMatrix } from '../src/fem/utils/getLocalStiffnessMatrix';
import { subset, index, lusolve, flatten, sparse, lup, multiply, matrix } from 'mathjs';

describe('Bar debug step by step', () => {
  it('step 1: K local for bar element', () => {
    const nodes = [[12,-3,-4], [0,0,0]] as [number,number,number][];
    const ei = {
      elasticities: new Map([[0, 210e6]]),
      areas: new Map([[0, 10e-4]]),
    };
    const K = getLocalStiffnessMatrix(nodes, ei, 0);
    console.log('K local [0][0]:', K[0][0]);
    console.log('K local size:', K.length, 'x', K[0].length);
    expect(K[0][0]).toBeGreaterThan(0);
  });

  it('step 2: K global assembly', () => {
    const nodes = [[12,-3,-4], [0,0,0], [12,-3,-7], [14,6,0]] as [number,number,number][];
    const elements = [[1,0], [2,0], [3,0]]; // 0-based
    const ei = {
      elasticities: new Map([[0, 210e6], [1, 210e6], [2, 210e6]]),
      areas: new Map([[0, 10e-4], [1, 10e-4], [2, 10e-4]]),
    };
    const dof = 24;
    const K = getGlobalStiffnessMatrix(nodes, elements, ei, dof);
    const kArr = (K as any).toArray ? (K as any).toArray() : K;
    console.log('K global [0][0]:', kArr[0][0]);
    const kMax = Math.max(...kArr.flat().map(Math.abs));
    console.log('K global max:', kMax);
    expect(kMax).toBeGreaterThan(0);
  });

  it('step 3: solve free DOFs', () => {
    const nodes = [[12,-3,-4], [0,0,0], [12,-3,-7], [14,6,0]] as [number,number,number][];
    const elements = [[1,0], [2,0], [3,0]];
    const ei = {
      elasticities: new Map([[0, 210e6], [1, 210e6], [2, 210e6]]),
      areas: new Map([[0, 10e-4], [1, 10e-4], [2, 10e-4]]),
    };
    const dof = 24;
    const K = getGlobalStiffnessMatrix(nodes, elements, ei, dof);
    const kArr = ((K as any).toArray ? (K as any).toArray() : K) as number[][];

    // Supports: nodes 1,2,3 fixed xyz (0-based: indices 1,2,3)
    const fixedDofs = [6,7,8, 12,13,14, 18,19,20]; // xyz of nodes 1,2,3
    const allDofs = Array.from({length: dof}, (_, i) => i);
    const freeDofs = allDofs.filter(d => !fixedDofs.includes(d));
    console.log('Free DOFs:', freeDofs.length, freeDofs.slice(0, 10));

    // Regularize zero diagonals
    let kMax = 0;
    for (let i = 0; i < dof; i++) kMax = Math.max(kMax, Math.abs(kArr[i][i]));
    const eps = kMax * 1e-10;
    let reg = 0;
    for (let i = 0; i < dof; i++) {
      if (Math.abs(kArr[i][i]) < eps) { kArr[i][i] = eps; reg++; }
    }
    console.log('Regularized:', reg, 'eps:', eps);

    // Extract free submatrix
    const Kfree: number[][] = [];
    for (const i of freeDofs) {
      const row: number[] = [];
      for (const j of freeDofs) row.push(kArr[i][j]);
      Kfree.push(row);
    }
    console.log('Kfree size:', Kfree.length, 'diag[0]:', Kfree[0][0]);

    // Force vector: Fx=20 at node 0
    const F = new Array(dof).fill(0);
    F[0] = 20; // Fx node 0
    const Ffree = freeDofs.map(i => F[i]);
    console.log('Ffree:', Ffree.slice(0, 6));

    // Solve
    try {
      const result = lusolve(Kfree, Ffree);
      const u = flatten(result) as unknown as number[];
      console.log('u[0..5]:', u.slice(0, 6));
      const uMax = Math.max(...u.map(Math.abs));
      console.log('max|u|:', uMax);
      expect(uMax).toBeGreaterThan(0);
      expect(isNaN(uMax)).toBe(false);
    } catch(e: any) {
      console.log('Solve error:', e.message);
      throw e;
    }
  });
});
