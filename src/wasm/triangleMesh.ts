/**
 * Triangle WASM wrapper — Delaunay/Chew mesh generation
 * Uses Shewchuk's Triangle v1.6 compiled to WASM
 */

// @ts-ignore
import triangleJsText from './triangle.js?raw';
// @ts-ignore
import triangleWasmUrl from './triangle.wasm?url';

// Evaluate the emscripten IIFE to extract the factory function
let TriangleModuleFactory: any = null;
try {
  // The JS exports: var TriangleModule = (()=>{ ... return async function(...){...} })();
  // We wrap it to capture the result
  const fn = new Function(`var module = { exports: {} }; var exports = module.exports; var define = undefined;\n${triangleJsText}\nreturn module.exports.default || module.exports || TriangleModule;`);
  TriangleModuleFactory = fn();
} catch (e) {
  console.warn('Triangle JS eval failed:', e);
}

let Module: any = null;
let _triangulate_mesh: any = null;
let _get_npoints: any = null;
let _get_ntriangles: any = null;
let _get_points: any = null;
let _get_triangles: any = null;
let _get_pointmarkers: any = null;
let _free_output: any = null;

async function ensureLoaded() {
  if (Module) return;
  Module = await TriangleModuleFactory({
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) return triangleWasmUrl;
      return path;
    }
  });
  _triangulate_mesh = Module.cwrap('triangulate_mesh', 'number',
    ['number', 'number', 'number', 'number', 'number', 'number']);
  _get_npoints = Module.cwrap('get_npoints', 'number', []);
  _get_ntriangles = Module.cwrap('get_ntriangles', 'number', []);
  _get_points = Module.cwrap('get_points', 'number', []);
  _get_triangles = Module.cwrap('get_triangles', 'number', []);
  _get_pointmarkers = Module.cwrap('get_pointmarkers', 'number', []);
  _free_output = Module.cwrap('free_output', null, []);
}

export interface MeshResult {
  nodes: number[][];    // [[x,y,z], ...]
  elements: number[][]; // [[n1,n2,n3], ...] (0-based)
  boundaryIndices: number[];
}

/**
 * Generate a 2D Delaunay triangulation using Shewchuk's Triangle
 * @param points Array of [x,y] or [x,y,z] points defining the boundary polygon
 * @param polygon Indices into points array defining the polygon boundary (0-based)
 * @param maxArea Maximum triangle area (controls mesh density)
 * @param minAngle Minimum angle in degrees (default 30)
 */
/** Pre-load WASM module at app startup */
export async function initTriangle(): Promise<void> {
  await ensureLoaded();
}

/** Check if Triangle WASM is loaded */
export function isTriangleReady(): boolean {
  return Module !== null;
}

export async function getMesh(
  points: number[][],
  polygon: number[],
  maxArea: number = 3,
  minAngle: number = 30
): Promise<MeshResult> {
  await ensureLoaded();

  const npoints = points.length;
  const nsegments = polygon.length;

  // Allocate input points (2D: x,y pairs)
  const pointsPtr = Module._malloc(npoints * 2 * 8); // double
  for (let i = 0; i < npoints; i++) {
    Module.HEAPF64[pointsPtr / 8 + i * 2] = points[i][0];
    Module.HEAPF64[pointsPtr / 8 + i * 2 + 1] = points[i][1];
  }

  // Allocate segments (pairs of point indices)
  const segPtr = Module._malloc(nsegments * 2 * 4); // int
  for (let i = 0; i < nsegments; i++) {
    Module.HEAP32[segPtr / 4 + i * 2] = polygon[i];
    Module.HEAP32[segPtr / 4 + i * 2 + 1] = polygon[(i + 1) % nsegments];
  }

  // Triangulate
  const ntri = _triangulate_mesh(pointsPtr, npoints, segPtr, nsegments, maxArea, minAngle);

  Module._free(pointsPtr);
  Module._free(segPtr);

  // Read output
  const np = _get_npoints();
  const outPtsPtr = _get_points();
  const outTriPtr = _get_triangles();
  const outMarkPtr = _get_pointmarkers();

  const nodes: number[][] = [];
  for (let i = 0; i < np; i++) {
    const x = Module.HEAPF64[outPtsPtr / 8 + i * 2];
    const y = Module.HEAPF64[outPtsPtr / 8 + i * 2 + 1];
    nodes.push([x, y, 0]);
  }

  const elements: number[][] = [];
  for (let i = 0; i < ntri; i++) {
    const n1 = Module.HEAP32[outTriPtr / 4 + i * 3];
    const n2 = Module.HEAP32[outTriPtr / 4 + i * 3 + 1];
    const n3 = Module.HEAP32[outTriPtr / 4 + i * 3 + 2];
    elements.push([n1, n2, n3]);
  }

  const boundaryIndices: number[] = [];
  for (let i = 0; i < np; i++) {
    if (Module.HEAP32[outMarkPtr / 4 + i]) {
      boundaryIndices.push(i);
    }
  }

  _free_output();

  return { nodes, elements, boundaryIndices };
}
