/**
 * SAP2000 .s2k File Parser → HékatanLab MATLAB code
 * Supports BOTH formats:
 *   - Legacy (v6-v14): SYSTEM/JOINT/SHELL keyword blocks
 *   - Modern (v15+): TABLE: "..." format with key=value pairs
 *
 * Output: MATLAB code string that defines the model
 */

export interface S2kParsed {
  nodes: number[][];       // [[x,y,z], ...]
  nodeNames: string[];
  elements: number[][];    // [[n1,n2], [n1,n2,n3], [n1,n2,n3,n4], ...]
  elementNames: string[];
  elementTypes: string[];  // 'frame' | 'shell3' | 'shell4'
  materials: Map<string, { E: number; nu: number; G: number; density?: number }>;
  frameSections: Map<string, { material: string; shape: string; D: number; B: number; TF: number; TW: number; A: number; Iz: number; Iy: number; J: number }>;
  shellSections: Map<string, { material: string; type: string; thickness: number }>;
  elementSections: Map<number, string>;
  supports: Map<number, boolean[]>;
  loads: Map<number, number[]>;
  units: { force: string; length: string };
  title: string;
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s) || 0;
}

function parseKV(line: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /(\w+)\s*=\s*(?:"([^"]*?)"|(\S+))/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    map.set(m[1], m[2] !== undefined ? m[2] : m[3]);
  }
  return map;
}

export function parseS2k(text: string): S2kParsed {
  const rawLines = text.split(/\r?\n/);
  const isTableFormat = rawLines.some(l => l.trim().startsWith('TABLE:'));
  if (isTableFormat) return parseTableFormat(rawLines);
  return parseLegacyFormat(rawLines);
}

// ═══════════════════════════════════════════
// TABLE FORMAT (v15+)
// ═══════════════════════════════════════════
function parseTableFormat(rawLines: string[]): S2kParsed {
  const lines: string[] = [];
  let buffer = "";
  for (const raw of rawLines) {
    const trimmed = raw.trimEnd();
    if (trimmed.endsWith("_")) {
      buffer += trimmed.slice(0, -1) + " ";
    } else {
      buffer += trimmed;
      lines.push(buffer);
      buffer = "";
    }
  }
  if (buffer) lines.push(buffer);

  const units = { force: "KN", length: "m" };
  let title = "SAP2000 Model";
  const materials = new Map<string, { E: number; nu: number; G: number; density?: number }>();
  const frameSections = new Map<string, { material: string; shape: string; D: number; B: number; TF: number; TW: number; A: number; Iz: number; Iy: number; J: number }>();
  const shellSections = new Map<string, { material: string; type: string; thickness: number }>();
  const joints = new Map<string, [number, number, number]>();
  const frameConns: { name: string; j1: string; j2: string }[] = [];
  const shellConns: { name: string; joints: string[] }[] = [];
  const restraints = new Map<string, boolean[]>();
  const frameSectionAssign = new Map<string, string>();
  const areaSectionAssign = new Map<string, string>();
  const loads: { joint: string; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }[] = [];

  let currentTable = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("File ")) continue;

    if (trimmed.startsWith('TABLE:')) {
      const match = trimmed.match(/TABLE:\s+"(.+?)"/);
      currentTable = match ? match[1].toUpperCase() : "";
      continue;
    }
    if (trimmed === "END TABLE DATA") { currentTable = ""; continue; }

    const kv = parseKV(trimmed);

    switch (currentTable) {
      case "PROGRAM CONTROL": {
        const cu = kv.get("CurrUnits");
        if (cu) {
          const parts = cu.split(",").map(s => s.trim());
          if (parts[0]) units.force = parts[0];
          if (parts[1]) units.length = parts[1];
        }
        const pn = kv.get("ProgramName");
        if (pn) title = `${pn} Model`;
        break;
      }
      case "MATERIAL PROPERTIES 01 - GENERAL": {
        const name = kv.get("Material");
        if (name && !materials.has(name)) materials.set(name, { E: 0, nu: 0, G: 0 });
        break;
      }
      case "MATERIAL PROPERTIES 02 - BASIC MECHANICAL PROPERTIES": {
        const name = kv.get("Material");
        if (name) {
          const mat = materials.get(name) || { E: 0, nu: 0, G: 0 };
          mat.E = parseNum(kv.get("E1"));
          mat.G = parseNum(kv.get("G12"));
          mat.nu = parseNum(kv.get("U12"));
          mat.density = parseNum(kv.get("UnitMass"));
          materials.set(name, mat);
        }
        break;
      }
      case "FRAME SECTION PROPERTIES 01 - GENERAL": {
        const secName = kv.get("SectionName");
        if (secName) {
          frameSections.set(secName, {
            material: kv.get("Material") || "",
            shape: kv.get("Shape") || "Rectangular",
            D: parseNum(kv.get("t3")), B: parseNum(kv.get("t2")),
            TF: parseNum(kv.get("tf")), TW: parseNum(kv.get("tw")),
            A: parseNum(kv.get("Area")), Iz: parseNum(kv.get("I33")),
            Iy: parseNum(kv.get("I22")), J: parseNum(kv.get("TorsConst")),
          });
        }
        break;
      }
      case "AREA SECTION PROPERTIES": {
        const secName = kv.get("Section");
        if (secName) {
          shellSections.set(secName, {
            material: kv.get("Material") || "",
            type: kv.get("Type") || "Shell",
            thickness: parseNum(kv.get("Thickness")),
          });
        }
        break;
      }
      case "JOINT COORDINATES": {
        const name = kv.get("Joint");
        if (name) joints.set(name, [parseNum(kv.get("XorR")), parseNum(kv.get("Y")), parseNum(kv.get("Z"))]);
        break;
      }
      case "CONNECTIVITY - FRAME": {
        const name = kv.get("Frame");
        const j1 = kv.get("JointI"), j2 = kv.get("JointJ");
        if (name && j1 && j2) frameConns.push({ name, j1, j2 });
        break;
      }
      case "CONNECTIVITY - AREA": {
        const name = kv.get("Area");
        if (name) {
          const numJ = parseInt(kv.get("NumJoints") || "4");
          const jts: string[] = [];
          for (let j = 1; j <= numJ; j++) { const jv = kv.get(`Joint${j}`); if (jv) jts.push(jv); }
          if (jts.length >= 3) shellConns.push({ name, joints: jts });
        }
        break;
      }
      case "JOINT RESTRAINT ASSIGNMENTS": {
        const name = kv.get("Joint");
        if (name) {
          restraints.set(name, [
            kv.get("U1")?.toLowerCase() === "yes", kv.get("U2")?.toLowerCase() === "yes",
            kv.get("U3")?.toLowerCase() === "yes", kv.get("R1")?.toLowerCase() === "yes",
            kv.get("R2")?.toLowerCase() === "yes", kv.get("R3")?.toLowerCase() === "yes",
          ]);
        }
        break;
      }
      case "FRAME SECTION ASSIGNMENTS": {
        const frame = kv.get("Frame"), sec = kv.get("AnalSect");
        if (frame && sec) frameSectionAssign.set(frame, sec);
        break;
      }
      case "AREA SECTION ASSIGNMENTS": {
        const area = kv.get("Area"), sec = kv.get("Section");
        if (area && sec) areaSectionAssign.set(area, sec);
        break;
      }
      case "JOINT LOADS - FORCE": {
        const joint = kv.get("Joint");
        if (joint) loads.push({
          joint, fx: parseNum(kv.get("F1")), fy: parseNum(kv.get("F2")),
          fz: parseNum(kv.get("F3")), mx: parseNum(kv.get("M1")),
          my: parseNum(kv.get("M2")), mz: parseNum(kv.get("M3")),
        });
        break;
      }
    }
  }

  return buildParsed(units, title, materials, frameSections, shellSections, joints,
    frameConns, shellConns, restraints, frameSectionAssign, areaSectionAssign, loads);
}

// ═══════════════════════════════════════════
// LEGACY FORMAT (v6-v14)
// ═══════════════════════════════════════════
function parseLegacyFormat(rawLines: string[]): S2kParsed {
  const units = { force: "KN", length: "m" };
  let title = "SAP2000 Model (legacy)";
  const materials = new Map<string, { E: number; nu: number; G: number; density?: number }>();
  const frameSections = new Map<string, { material: string; shape: string; D: number; B: number; TF: number; TW: number; A: number; Iz: number; Iy: number; J: number }>();
  const shellSections = new Map<string, { material: string; type: string; thickness: number }>();
  const joints = new Map<string, [number, number, number]>();
  const frameConns: { name: string; j1: string; j2: string }[] = [];
  const shellConns: { name: string; joints: string[] }[] = [];
  const restraints = new Map<string, boolean[]>();
  const loads: { joint: string; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }[] = [];
  let currentSection = "";
  let currentMaterial = "";

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith(";")) continue;

    if (!raw.startsWith(" ") && !raw.startsWith("\t")) {
      const upper = trimmed.toUpperCase();
      if (upper === "END") break;
      if (upper.startsWith("SHELL SECTION")) currentSection = "SHELL SECTION";
      else if (upper.startsWith("FRAME SECTION")) currentSection = "FRAME SECTION";
      else currentSection = upper.split(/\s+/)[0];
      continue;
    }

    const kv = parseKV(trimmed);
    const tokens = trimmed.split(/\s+/);

    switch (currentSection) {
      case "SYSTEM": {
        const l = kv.get("LENGTH"); if (l) units.length = l;
        const f = kv.get("FORCE"); if (f) units.force = f;
        break;
      }
      case "JOINT": {
        const name = tokens[0];
        joints.set(name, [parseNum(kv.get("X")), parseNum(kv.get("Y")), parseNum(kv.get("Z"))]);
        break;
      }
      case "RESTRAINT": {
        const add = kv.get("ADD"), dofStr = kv.get("DOF");
        if (add && dofStr) {
          const dofs = dofStr.split(",");
          const r = [false, false, false, false, false, false];
          for (const d of dofs) {
            const du = d.toUpperCase();
            if (du === "UX" || du === "U1") r[0] = true;
            if (du === "UY" || du === "U2") r[1] = true;
            if (du === "UZ" || du === "U3") r[2] = true;
            if (du === "RX" || du === "R1") r[3] = true;
            if (du === "RY" || du === "R2") r[4] = true;
            if (du === "RZ" || du === "R3") r[5] = true;
          }
          restraints.set(add, r);
        }
        break;
      }
      case "MATERIAL": {
        const name = kv.get("NAME");
        if (name) { currentMaterial = name; materials.set(name, { E: 0, nu: 0, G: 0 }); }
        else if (currentMaterial) {
          const mat = materials.get(currentMaterial)!;
          const e = kv.get("E"); if (e) mat.E = parseNum(e);
          const u = kv.get("U"); if (u) mat.nu = parseNum(u);
          mat.G = mat.E / (2 * (1 + mat.nu));
        }
        break;
      }
      case "SHELL": {
        const name = tokens[0];
        const j = kv.get("J");
        if (j) shellConns.push({ name, joints: j.split(",") });
        break;
      }
      case "SHELL SECTION": {
        const name = kv.get("NAME");
        if (name) shellSections.set(name, { material: kv.get("MAT") || "", type: kv.get("TYPE") || "Shell", thickness: parseNum(kv.get("TH")) });
        break;
      }
      case "FRAME": {
        const name = tokens[0];
        const j = kv.get("J");
        if (j) { const jj = j.split(","); if (jj.length >= 2) frameConns.push({ name, j1: jj[0], j2: jj[1] }); }
        break;
      }
      case "LOAD": {
        const add = kv.get("ADD");
        if (add) loads.push({
          joint: add, fx: parseNum(kv.get("UX")), fy: parseNum(kv.get("UY")),
          fz: parseNum(kv.get("UZ")), mx: parseNum(kv.get("MX")),
          my: parseNum(kv.get("MY")), mz: parseNum(kv.get("MZ")),
        });
        break;
      }
    }
  }

  return buildParsed(units, title, materials, frameSections, shellSections, joints,
    frameConns, shellConns, restraints, new Map(), new Map(), loads);
}

// ═══════════════════════════════════════════
// BUILD PARSED MODEL
// ═══════════════════════════════════════════
function buildParsed(
  units: { force: string; length: string }, title: string,
  materials: Map<string, any>, frameSections: Map<string, any>,
  shellSections: Map<string, any>, joints: Map<string, [number, number, number]>,
  frameConns: { name: string; j1: string; j2: string }[],
  shellConns: { name: string; joints: string[] }[],
  restraints: Map<string, boolean[]>,
  frameSectionAssign: Map<string, string>, areaSectionAssign: Map<string, string>,
  rawLoads: { joint: string; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }[],
): S2kParsed {
  const nodeNames: string[] = [];
  const nodeNameToIdx = new Map<string, number>();
  const nodesArr: number[][] = [];
  for (const [name, coords] of joints) {
    nodeNameToIdx.set(name, nodesArr.length);
    nodeNames.push(name);
    nodesArr.push([...coords]);
  }

  const elements: number[][] = [];
  const elementNames: string[] = [];
  const elementTypes: string[] = [];
  const elementSections = new Map<number, string>();

  for (const fc of frameConns) {
    const i1 = nodeNameToIdx.get(fc.j1), i2 = nodeNameToIdx.get(fc.j2);
    if (i1 !== undefined && i2 !== undefined) {
      const idx = elements.length;
      elements.push([i1, i2]);
      elementNames.push(fc.name);
      elementTypes.push('frame');
      const sec = frameSectionAssign.get(fc.name);
      if (sec) elementSections.set(idx, sec);
    }
  }

  for (const sc of shellConns) {
    const indices = sc.joints.map(j => nodeNameToIdx.get(j)).filter(x => x !== undefined) as number[];
    if (indices.length >= 3) {
      const idx = elements.length;
      elements.push(indices);
      elementNames.push(sc.name);
      elementTypes.push(indices.length === 3 ? 'shell3' : 'shell4');
      const sec = areaSectionAssign.get(sc.name);
      if (sec) elementSections.set(idx, sec);
    }
  }

  const supports = new Map<number, boolean[]>();
  for (const [name, r] of restraints) {
    const idx = nodeNameToIdx.get(name);
    if (idx !== undefined) supports.set(idx, r);
  }

  const loads = new Map<number, number[]>();
  for (const ld of rawLoads) {
    const idx = nodeNameToIdx.get(ld.joint);
    if (idx !== undefined) {
      const f = loads.get(idx) || [0, 0, 0, 0, 0, 0];
      f[0] += ld.fx; f[1] += ld.fy; f[2] += ld.fz;
      f[3] += ld.mx; f[4] += ld.my; f[5] += ld.mz;
      loads.set(idx, f);
    }
  }

  return {
    nodes: nodesArr, nodeNames, elements, elementNames, elementTypes,
    materials, frameSections, shellSections, elementSections,
    supports, loads, units, title,
  };
}

// ═══════════════════════════════════════════
// GENERATE MATLAB CODE FROM PARSED S2K
// ═══════════════════════════════════════════
export function s2kToMatlab(parsed: S2kParsed): string {
  const L: string[] = [];
  const { nodes, elements, elementTypes, materials, frameSections, shellSections, elementSections, supports, loads, units } = parsed;

  L.push(`% ═══════════════════════════════════════════════════`);
  L.push(`% Modelo importado de SAP2000 (.s2k)`);
  L.push(`% Unidades: ${units.force}, ${units.length}`);
  L.push(`% Nodos: ${nodes.length}, Elementos: ${elements.length}`);
  L.push(`% ═══════════════════════════════════════════════════`);
  L.push(``);

  // Nodes
  L.push(`% ── Nodos [x, y, z] ──`);
  const nRows = nodes.map(n => `  ${n[0]}, ${n[1]}, ${n[2]}`);
  L.push(`nodes = [${nRows.join(';\n')}]`);
  L.push(`nNodes = size(nodes, 1)`);
  L.push(``);

  // Separate frames and shells
  const frameIdx: number[] = [];
  const shellIdx: number[] = [];
  elements.forEach((el, i) => {
    if (elementTypes[i] === 'frame') frameIdx.push(i);
    else shellIdx.push(i);
  });

  // Frame elements
  if (frameIdx.length > 0) {
    L.push(`% ── Elementos Frame [nodo_i, nodo_j] (1-based) ──`);
    const fRows = frameIdx.map(i => `  ${elements[i][0] + 1}, ${elements[i][1] + 1}`);
    L.push(`frames = [${fRows.join(';\n')}]`);
    L.push(`nFrames = size(frames, 1)`);
    L.push(``);

    // Frame properties (E, A, Iz, Iy, J per element)
    L.push(`% ── Propiedades Frame [E, A, Iz, Iy, J, G] ──`);
    const defaultMat = materials.values().next().value || { E: 25e6, nu: 0.2, G: 10e6 };
    const propRows: string[] = [];
    for (const i of frameIdx) {
      const secName = elementSections.get(i);
      const sec = secName ? frameSections.get(secName) : null;
      const mat = sec ? (materials.get(sec.material) || defaultMat) : defaultMat;
      const E = mat.E || defaultMat.E;
      const nu = mat.nu || 0.2;
      const G = mat.G || E / (2 * (1 + nu));
      const A = sec?.A || 0.01;
      const Iz = sec?.Iz || 1e-4;
      const Iy = sec?.Iy || 1e-4;
      const J = sec?.J || 1e-4;
      propRows.push(`  ${E}, ${A}, ${Iz}, ${Iy}, ${J}, ${G}`);
    }
    L.push(`frame_props = [${propRows.join(';\n')}]`);
    L.push(``);
  }

  // Shell elements
  if (shellIdx.length > 0) {
    L.push(`% ── Elementos Shell [nodo_1, nodo_2, ...] (1-based) ──`);
    for (const i of shellIdx) {
      const el = elements[i];
      L.push(`shells(${shellIdx.indexOf(i) + 1}, :) = [${el.map(n => n + 1).join(', ')}]`);
    }
    L.push(`nShells = ${shellIdx.length}`);
    L.push(``);

    // Shell properties (E, nu, t)
    L.push(`% ── Propiedades Shell [E, nu, t] ──`);
    const defaultMat = materials.values().next().value || { E: 25e6, nu: 0.2 };
    const sRows: string[] = [];
    for (const i of shellIdx) {
      const secName = elementSections.get(i);
      const sec = secName ? shellSections.get(secName) : null;
      const mat = sec ? (materials.get(sec.material) || defaultMat) : defaultMat;
      const E = mat.E || defaultMat.E;
      const nu = mat.nu || 0.2;
      const t = sec?.thickness || 0.1;
      sRows.push(`  ${E}, ${nu}, ${t}`);
    }
    L.push(`shell_props = [${sRows.join(';\n')}]`);
    L.push(``);
  }

  // Supports
  if (supports.size > 0) {
    L.push(`% ── Apoyos [nodo, ux, uy, uz, rx, ry, rz] (1=fijo, 0=libre) ──`);
    const sRows: string[] = [];
    for (const [idx, r] of supports) {
      sRows.push(`  ${idx + 1}, ${r.map(b => b ? 1 : 0).join(', ')}`);
    }
    L.push(`supports = [${sRows.join(';\n')}]`);
    L.push(``);
  }

  // Loads
  if (loads.size > 0) {
    L.push(`% ── Cargas nodales [nodo, Fx, Fy, Fz, Mx, My, Mz] ──`);
    const lRows: string[] = [];
    for (const [idx, f] of loads) {
      if (f.some(v => Math.abs(v) > 1e-12)) {
        lRows.push(`  ${idx + 1}, ${f.join(', ')}`);
      }
    }
    L.push(`loads = [${lRows.join(';\n')}]`);
    L.push(``);
  }

  // DOFs and assembly
  const nDof = nodes.length * 6;
  L.push(`% ── Grados de libertad ──`);
  L.push(`dofPerNode = 6`);
  L.push(`nDof = nNodes * dofPerNode`);
  L.push(``);

  // Generate view3d command
  L.push(`% ── Visualización 3D ──`);
  if (frameIdx.length > 0 && shellIdx.length === 0) {
    L.push(`view3d(nodes, frames, supports)`);
  } else if (shellIdx.length > 0 && frameIdx.length === 0) {
    L.push(`% view3d requiere adaptación para shells`);
  } else {
    L.push(`view3d(nodes, frames, supports)`);
  }
  L.push(``);

  L.push(`% ═══════════════════════════════════════════════════`);
  L.push(`% Para resolver: usar assemble_k, solve_fem, etc.`);
  L.push(`% Ver 📚 Funciones FEM para las funciones disponibles`);
  L.push(`% ═══════════════════════════════════════════════════`);

  return L.join('\n');
}
