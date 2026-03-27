/**
 * ETABS .e2k File Parser → HékatanLab MATLAB code
 * Converts ETABS text model files into MATLAB code
 *
 * Supported sections:
 *   CONTROLS, STORIES, MATERIAL PROPERTIES, FRAME SECTIONS,
 *   POINT COORDINATES, LINE CONNECTIVITIES, AREA CONNECTIVITIES,
 *   POINT ASSIGNS (restraints), LINE ASSIGNS, FRAME OBJECT LOADS
 */

export interface E2kParsed {
  nodes: number[][];
  nodeNames: string[];
  elements: number[][];
  elementNames: string[];
  elementTypes: string[];  // 'COLUMN' | 'BEAM' | 'BRACE'
  elementStories: string[];
  materials: Map<string, { type: string; E: number; G: number; nu: number; density?: number }>;
  frameSections: Map<string, { material: string; shape: string; D: number; B: number; TF: number; TW: number }>;
  elementSections: Map<number, string>;
  supports: Map<number, boolean[]>;
  loads: Map<number, number[]>;
  stories: { name: string; height: number; elev: number }[];
  units: { force: string; length: string };
  title: string;
}

export function parseE2k(text: string): E2kParsed {
  const lines = text.split(/\r?\n/);
  const units = { force: "TONF", length: "M" };
  const stories: { name: string; height: number; elev: number }[] = [];
  const materials = new Map<string, { type: string; E: number; G: number; nu: number; density?: number }>();
  const frameSections = new Map<string, { material: string; shape: string; D: number; B: number; TF: number; TW: number }>();
  const pointCoords = new Map<string, [number, number]>();
  const lineConns: { name: string; type: string; pt1: string; pt2: string; nStories: number }[] = [];
  const areaConns: { name: string; pts: string[]; nStories: number }[] = [];
  const restraints = new Map<string, string[]>();
  const lineAssigns = new Map<string, { story: string; section: string }>();
  const frameLoads: { line: string; story: string; type: string; dir: string; lc: string; val: number }[] = [];
  let title = "ETABS Model";
  let currentSection = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("$")) {
      if (line.startsWith("$ ")) currentSection = line.substring(2).trim();
      continue;
    }

    if (currentSection === "CONTROLS") {
      const um = line.match(/UNITS\s+"([^"]+)"\s+"([^"]+)"/);
      if (um) { units.force = um[1]; units.length = um[2]; }
      const tm = line.match(/TITLE2\s+"([^"]+)"/);
      if (tm) title = tm[1];
    }

    if (currentSection === "STORIES - IN SEQUENCE FROM TOP") {
      const sm = line.match(/STORY\s+"([^"]+)"\s+(?:HEIGHT\s+([\d.]+)|ELEV\s+([-\d.]+))/);
      if (sm) stories.push({ name: sm[1], height: sm[2] ? parseFloat(sm[2]) : 0, elev: sm[3] ? parseFloat(sm[3]) : 0 });
    }

    if (currentSection === "MATERIAL PROPERTIES") {
      const mm = line.match(/MATERIAL\s+"([^"]+)"\s+(?:TYPE\s+"([^"]+)")?/);
      if (mm) {
        const name = mm[1];
        if (!materials.has(name)) materials.set(name, { type: mm[2] || "", E: 0, G: 0, nu: 0 });
        const mat = materials.get(name)!;
        if (mm[2]) mat.type = mm[2];
        const eM = line.match(/\bE\s+([\d.eE+-]+)/); if (eM) mat.E = parseFloat(eM[1]);
        const uM = line.match(/\bU\s+([\d.eE+-]+)/);
        if (uM) { mat.nu = parseFloat(uM[1]); mat.G = mat.E / (2 * (1 + mat.nu)); }
        const wM = line.match(/WEIGHTPERVOLUME\s+([\d.eE+-]+)/); if (wM) mat.density = parseFloat(wM[1]);
      }
    }

    if (currentSection === "FRAME SECTIONS") {
      const fsm = line.match(/FRAMESECTION\s+"([^"]+)"/);
      if (fsm) {
        const name = fsm[1];
        if (!frameSections.has(name)) frameSections.set(name, { material: "", shape: "", D: 0, B: 0, TF: 0, TW: 0 });
        const sec = frameSections.get(name)!;
        const matM = line.match(/MATERIAL\s+"([^"]+)"/); if (matM) sec.material = matM[1];
        const shM = line.match(/SHAPE\s+"([^"]+)"/); if (shM) sec.shape = shM[1];
        const dM = line.match(/\bD\s+([\d.eE+-]+)/); if (dM) sec.D = parseFloat(dM[1]);
        const bM = line.match(/\bB\s+([\d.eE+-]+)/); if (bM) sec.B = parseFloat(bM[1]);
        const tfM = line.match(/\bTF\s+([\d.eE+-]+)/); if (tfM) sec.TF = parseFloat(tfM[1]);
        const twM = line.match(/\bTW\s+([\d.eE+-]+)/); if (twM) sec.TW = parseFloat(twM[1]);
      }
    }

    if (currentSection === "POINT COORDINATES") {
      const pm = line.match(/POINT\s+"([^"]+)"\s+([-\d.eE+]+)\s+([-\d.eE+]+)/);
      if (pm) pointCoords.set(pm[1], [parseFloat(pm[2]), parseFloat(pm[3])]);
    }

    if (currentSection === "LINE CONNECTIVITIES") {
      const lm = line.match(/LINE\s+"([^"]+)"\s+(COLUMN|BEAM|BRACE)\s+"([^"]+)"\s+"([^"]+)"\s+(\d+)/);
      if (lm) lineConns.push({ name: lm[1], type: lm[2], pt1: lm[3], pt2: lm[4], nStories: parseInt(lm[5]) });
    }

    if (currentSection === "AREA CONNECTIVITIES") {
      const am = line.match(/AREA\s+"([^"]+)"\s+\d+\s+(.+)/);
      if (am) {
        const pts = am[2].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, "")) || [];
        areaConns.push({ name: am[1], pts, nStories: 0 });
      }
    }

    if (currentSection === "POINT ASSIGNS") {
      const rm = line.match(/POINTASSIGN\s+"([^"]+)"\s+"([^"]+)".*RESTRAINT\s+"([^"]+)"/);
      if (rm) restraints.set(`${rm[1]}@${rm[2]}`, rm[3].split(/\s+/));
    }

    if (currentSection === "LINE ASSIGNS") {
      const lam = line.match(/LINEASSIGN\s+"([^"]+)"\s+"([^"]+)".*SECTION\s+"([^"]+)"/);
      if (lam) lineAssigns.set(`${lam[1]}@${lam[2]}`, { story: lam[2], section: lam[3] });
    }

    if (currentSection === "FRAME OBJECT LOADS") {
      const flm = line.match(/LINELOAD\s+"([^"]+)"\s+"([^"]+)"\s+TYPE\s+"([^"]+)"\s+DIR\s+"([^"]+)"\s+LC\s+"([^"]+)"\s+FVAL\s+([-\d.eE+]+)/);
      if (flm) frameLoads.push({ line: flm[1], story: flm[2], type: flm[3], dir: flm[4], lc: flm[5], val: parseFloat(flm[6]) });
    }
  }

  // Compute story elevations (top-to-bottom in file)
  const storyElevs = new Map<string, number>();
  if (stories.length > 0) {
    const baseIdx = stories.length - 1;
    storyElevs.set(stories[baseIdx].name, stories[baseIdx].elev);
    for (let i = baseIdx - 1; i >= 0; i--) {
      const belowElev = storyElevs.get(stories[i + 1].name)!;
      stories[i].elev = belowElev + stories[i].height;
      storyElevs.set(stories[i].name, stories[i].elev);
    }
  }

  // Build 3D nodes
  const nodes: number[][] = [];
  const nodeNames: string[] = [];
  const nodeNameToIdx = new Map<string, number>();
  const nodeKey = (pt: string, story: string) => `${pt}@${story}`;
  const allNodeKeys = new Set<string>();

  for (const lc of lineConns) {
    for (const [key, la] of lineAssigns) {
      if (!key.startsWith(lc.name + "@")) continue;
      const story = la.story;
      const storyIdx = stories.findIndex(s => s.name === story);
      if (storyIdx < 0) continue;
      if (lc.type === "COLUMN" || lc.type === "BRACE") {
        allNodeKeys.add(nodeKey(lc.pt2, story));
        const nSt = Math.max(lc.nStories, 1);
        const bottomIdx = Math.min(storyIdx + nSt, stories.length - 1);
        allNodeKeys.add(nodeKey(lc.pt1, stories[bottomIdx].name));
      } else {
        allNodeKeys.add(nodeKey(lc.pt1, story));
        allNodeKeys.add(nodeKey(lc.pt2, story));
      }
    }
  }
  for (const [key] of restraints) allNodeKeys.add(key);

  for (const nk of allNodeKeys) {
    const [pt, story] = nk.split("@");
    const xy = pointCoords.get(pt);
    const elev = storyElevs.get(story);
    if (xy === undefined || elev === undefined) continue;
    nodes.push([xy[0], xy[1], elev]);
    nodeNames.push(nk);
    nodeNameToIdx.set(nk, nodes.length - 1);
  }

  // Build elements
  const elements: number[][] = [];
  const elementNames: string[] = [];
  const elementTypes: string[] = [];
  const elementStoriesArr: string[] = [];
  const elementSections = new Map<number, string>();

  for (const lc of lineConns) {
    for (const [key, la] of lineAssigns) {
      if (!key.startsWith(lc.name + "@")) continue;
      const story = la.story;
      const storyIdx = stories.findIndex(s => s.name === story);
      if (storyIdx < 0) continue;
      let n1key: string, n2key: string;
      if (lc.type === "COLUMN" || lc.type === "BRACE") {
        const nSt = Math.max(lc.nStories, 1);
        const bottomIdx = Math.min(storyIdx + nSt, stories.length - 1);
        n1key = nodeKey(lc.pt1, stories[bottomIdx].name);
        n2key = nodeKey(lc.pt2, story);
      } else {
        n1key = nodeKey(lc.pt1, story);
        n2key = nodeKey(lc.pt2, story);
      }
      const i1 = nodeNameToIdx.get(n1key), i2 = nodeNameToIdx.get(n2key);
      if (i1 === undefined || i2 === undefined || i1 === i2) continue;
      const elemIdx = elements.length;
      elements.push([i1, i2]);
      elementNames.push(lc.name);
      elementTypes.push(lc.type);
      elementStoriesArr.push(story);
      elementSections.set(elemIdx, la.section);
    }
  }

  // Supports
  const supportsMap = new Map<number, boolean[]>();
  for (const [key, dofs] of restraints) {
    const nodeIdx = nodeNameToIdx.get(key);
    if (nodeIdx === undefined) continue;
    const fix = [false, false, false, false, false, false];
    for (const d of dofs) {
      if (d === "UX") fix[0] = true; if (d === "UY") fix[1] = true;
      if (d === "UZ") fix[2] = true; if (d === "RX") fix[3] = true;
      if (d === "RY") fix[4] = true; if (d === "RZ") fix[5] = true;
    }
    supportsMap.set(nodeIdx, fix);
  }

  // Loads from LINELOAD → equivalent nodal
  const loadsMap = new Map<number, number[]>();
  const elemLookup = new Map<string, number>();
  for (let ei = 0; ei < elementNames.length; ei++) {
    elemLookup.set(`${elementNames[ei]}@${elementStoriesArr[ei]}`, ei);
  }
  for (const fl of frameLoads) {
    const elemIdx = elemLookup.get(`${fl.line}@${fl.story}`);
    if (elemIdx === undefined) continue;
    const [n1, n2] = elements[elemIdx];
    const p1 = nodes[n1], p2 = nodes[n2];
    const L = Math.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2 + (p2[2]-p1[2])**2);
    if (L < 1e-10) continue;
    const F = fl.val * L / 2;
    let fx = 0, fy = 0, fz = 0;
    if (fl.dir === "GRAV" || fl.dir === "GRAVITY") fz = -F;
    else if (fl.dir === "X") fx = F;
    else if (fl.dir === "Y") fy = F;
    else if (fl.dir === "Z") fz = -F;
    for (const ni of [n1, n2]) {
      const prev = loadsMap.get(ni) || [0, 0, 0, 0, 0, 0];
      prev[0] += fx; prev[1] += fy; prev[2] += fz;
      loadsMap.set(ni, prev);
    }
  }

  return {
    nodes, nodeNames, elements, elementNames, elementTypes,
    elementStories: elementStoriesArr, materials, frameSections,
    elementSections, supports: supportsMap, loads: loadsMap,
    stories: stories.reverse(), units, title,
  };
}

// ═══════════════════════════════════════════
// GENERATE MATLAB CODE FROM PARSED E2K
// ═══════════════════════════════════════════
export function e2kToMatlab(parsed: E2kParsed): string {
  const L: string[] = [];
  const { nodes, elements, elementTypes, materials, frameSections, elementSections, supports, loads, stories, units } = parsed;

  L.push(`% ═══════════════════════════════════════════════════`);
  L.push(`% Modelo importado de ETABS (.e2k)`);
  L.push(`% Unidades: ${units.force}, ${units.length}`);
  L.push(`% Nodos: ${nodes.length}, Elementos: ${elements.length}`);
  L.push(`% Pisos: ${stories.map(s => s.name).join(', ')}`);
  L.push(`% ═══════════════════════════════════════════════════`);
  L.push(``);

  // Nodes
  L.push(`% ── Nodos [x, y, z] ──`);
  const nRows = nodes.map(n => `  ${n[0]}, ${n[1]}, ${n[2]}`);
  L.push(`nodes = [${nRows.join(';\n')}]`);
  L.push(`nNodes = size(nodes, 1)`);
  L.push(``);

  // Elements
  L.push(`% ── Elementos [nodo_i, nodo_j] (1-based) ──`);
  const eRows = elements.map(el => `  ${el[0] + 1}, ${el[1] + 1}`);
  L.push(`elem = [${eRows.join(';\n')}]`);
  L.push(`nElem = size(elem, 1)`);
  L.push(``);

  // Element types
  L.push(`% ── Tipos de elemento ──`);
  L.push(`% ${elementTypes.map((t, i) => `E${i + 1}=${t}`).join(', ')}`);
  L.push(``);

  // Properties per element
  L.push(`% ── Propiedades [E, A, Iz, Iy, J, G] por elemento ──`);
  const defaultMat = materials.values().next().value || { E: 25e6, nu: 0.2, G: 10e6 };
  const propRows: string[] = [];
  for (let i = 0; i < elements.length; i++) {
    const secName = elementSections.get(i);
    const sec = secName ? frameSections.get(secName) : null;
    const mat = sec ? (materials.get(sec.material) || defaultMat) : defaultMat;
    const E = mat.E || defaultMat.E;
    const nu = mat.nu || 0.2;
    const G = mat.G || E / (2 * (1 + nu));
    const D = sec?.D || 0.3, B = sec?.B || 0.3;
    const A = D * B;
    const Iz = B * D ** 3 / 12;
    const Iy = D * B ** 3 / 12;
    const J = Math.min(D, B) * Math.max(D, B) ** 3 / 3 * 0.3;
    propRows.push(`  ${E}, ${A}, ${Iz}, ${Iy}, ${J}, ${G}`);
  }
  L.push(`props = [${propRows.join(';\n')}]`);
  L.push(``);

  // Supports
  if (supports.size > 0) {
    L.push(`% ── Apoyos [nodo, ux, uy, uz, rx, ry, rz] ──`);
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
        lRows.push(`  ${idx + 1}, ${f.map(v => Math.round(v * 10000) / 10000).join(', ')}`);
      }
    }
    if (lRows.length > 0) L.push(`loads = [${lRows.join(';\n')}]`);
    L.push(``);
  }

  L.push(`% ── Grados de libertad ──`);
  L.push(`dofPerNode = 6`);
  L.push(`nDof = nNodes * dofPerNode`);
  L.push(``);

  L.push(`% ── Visualización 3D ──`);
  L.push(`view3d(nodes, elem, supports)`);
  L.push(``);

  L.push(`% ═══════════════════════════════════════════════════`);
  L.push(`% Para resolver: usar assemble_k, solve_fem, etc.`);
  L.push(`% Ver 📚 Funciones FEM para las funciones disponibles`);
  L.push(`% ═══════════════════════════════════════════════════`);

  return L.join('\n');
}
