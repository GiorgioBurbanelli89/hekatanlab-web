// Minimal types matching awatif-fem interfaces
// So we can use awatif v2 viewer objects without importing awatif-fem

export type Node = [number, number, number];
export type Element = number[];

export interface Mesh {
  nodes?: { val: Node[] };
  elements?: { val: Element[] };
  nodeInputs?: { val: NodeInputs };
  elementInputs?: { val: any };
  deformOutputs?: { val: any };
  analyzeOutputs?: { val: any };
}

export interface NodeInputs {
  supports?: Map<number, [boolean, boolean, boolean, boolean, boolean, boolean]>;
  loads?: Map<number, [number, number, number, number, number, number]>;
  forces?: Map<number, [number, number, number, number, number, number]>;
}

export interface Structure {
  nodeInputs?: { val: NodeInputs };
}

export interface Settings {
  gridSize: { val: number; rawVal: number };
  displayScale: { val: number; rawVal: number };
  nodes: { val: boolean; rawVal: boolean };
  elements: { val: boolean; rawVal: boolean };
  supports: { val: boolean; rawVal: boolean };
  loads: { val: boolean; rawVal: boolean };
  deformedShape: { val: boolean; rawVal: boolean };
  flipAxes: { val: boolean; rawVal: boolean };
}
