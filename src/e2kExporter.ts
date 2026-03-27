/**
 * ETABS .e2k Exporter — genera archivo E2K desde datos del editor MATLAB
 * Formato compatible con ETABS
 */

export interface E2kExportData {
  nodes: number[][];       // [[x,y,z], ...]
  elements: number[][];    // [[n1,n2], ...] (1-based in MATLAB)
  props?: number[][];      // [[E, A, Iz, Iy, J, G], ...]
  supports?: number[][];   // [[node, ux, uy, uz, rx, ry, rz], ...]
  loads?: number[][];      // [[node, Fx, Fy, Fz, Mx, My, Mz], ...]
  title?: string;
  units?: { force: string; length: string };
}

export function exportE2k(data: E2kExportData): string {
  const { nodes, elements, props, supports, loads } = data;
  const force = data.units?.force || "TONF";
  const length = data.units?.length || "M";
  const title = data.title || "HékatanLab Model";
  const L: string[] = [];
  const rd = (v: number) => Math.round(v * 10000) / 10000;

  L.push(`$ File exported from HékatanLab Web`);
  L.push(``);
  L.push(`$ PROGRAM INFORMATION`);
  L.push(`  PROGRAM  "HEKATANLAB"  VERSION "1.0.0"  `);
  L.push(``);
  L.push(`$ CONTROLS`);
  L.push(`  UNITS  "${force}"  "${length}"  "C"  `);
  if (title) L.push(`  TITLE2  "${title}"  `);
  L.push(``);

  // Extract unique Z elevations for stories
  const zSet = new Set<number>();
  nodes.forEach(n => zSet.add(rd(n[2])));
  const sortedZ = [...zSet].sort((a, b) => a - b);
  const storyNames: string[] = [];
  const zToStory = new Map<number, string>();

  storyNames.push("Base");
  zToStory.set(sortedZ[0], "Base");
  for (let i = 1; i < sortedZ.length; i++) {
    const name = `Level_${i}`;
    storyNames.push(name);
    zToStory.set(sortedZ[i], name);
  }

  L.push(`$ STORIES - IN SEQUENCE FROM TOP`);
  for (let i = sortedZ.length - 1; i >= 1; i--) {
    L.push(`  STORY "${storyNames[i]}"  HEIGHT ${rd(sortedZ[i] - sortedZ[i - 1])} MASTERSTORY "Yes"  `);
  }
  if (sortedZ.length > 0) L.push(`  STORY "Base"  ELEV ${sortedZ[0]} `);
  L.push(``);

  // Materials
  L.push(`$ MATERIAL PROPERTIES`);
  const uniqueE = new Set<number>();
  if (props) props.forEach(p => uniqueE.add(p[0]));
  else uniqueE.add(25e6);
  const matNames = new Map<number, string>();
  let mi = 0;
  for (const E of uniqueE) {
    const name = `Mat_${++mi}`;
    matNames.set(E, name);
    L.push(`  MATERIAL  "${name}"    TYPE "Concrete"    WEIGHTPERVOLUME 2.4`);
    L.push(`  MATERIAL  "${name}"    SYMTYPE "Isotropic"  E ${E}  U 0.2  A 1E-05`);
  }
  L.push(``);

  // Frame sections
  L.push(`$ FRAME SECTIONS`);
  const writtenSections = new Set<string>();
  const elemToSecName = new Map<number, string>();

  for (let i = 0; i < elements.length; i++) {
    const p = props ? props[Math.min(i, props.length - 1)] : [25e6, 0.09, 6.75e-4, 6.75e-4, 1e-4, 10e6];
    const E = p[0], A = p[1], Iz = p[2];
    const matName = matNames.get(E) || "Mat_1";
    let h = 0.3, b = 0.3;
    if (A > 0 && Iz > 0) { h = Math.sqrt(12 * Iz / A); b = A / h; }
    const secName = `R${Math.round(b * 1000)}x${Math.round(h * 1000)}`;
    elemToSecName.set(i, secName);
    if (!writtenSections.has(secName)) {
      writtenSections.add(secName);
      L.push(`  FRAMESECTION  "${secName}"  MATERIAL "${matName}"  SHAPE "Concrete Rectangular"  D ${rd(h)}  B ${rd(b)}`);
    }
  }
  L.push(``);

  // Plan Points
  const xyToPoint = new Map<string, string>();
  let ptIdx = 0;
  nodes.forEach(n => {
    const key = `${rd(n[0])},${rd(n[1])}`;
    if (!xyToPoint.has(key)) xyToPoint.set(key, `${++ptIdx}`);
  });
  L.push(`$ POINT COORDINATES`);
  for (const [key, ptName] of xyToPoint) {
    const [x, y] = key.split(",").map(Number);
    L.push(`  POINT "${ptName}"  ${x} ${y} `);
  }
  L.push(``);

  const nodeToPS = (ni: number): { pt: string; story: string } => {
    const n = nodes[ni];
    const key = `${rd(n[0])},${rd(n[1])}`;
    return { pt: xyToPoint.get(key) || "1", story: zToStory.get(rd(n[2])) || "Base" };
  };

  // Guess element type from geometry
  const guessType = (el: number[]): string => {
    const n0 = nodes[el[0]], n1 = nodes[el[1]];
    const dz = Math.abs(n1[2] - n0[2]);
    const dxy = Math.sqrt((n1[0] - n0[0]) ** 2 + (n1[1] - n0[1]) ** 2);
    const isCol = dz > dxy * 0.5;
    return isCol && dxy > 0.01 ? "BRACE" : isCol ? "COLUMN" : "BEAM";
  };

  // Lines
  L.push(`$ LINE CONNECTIVITIES`);
  const laEntries: string[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i].map(n => n - 1); // 1-based to 0-based
    const type = guessType(el);
    const secName = elemToSecName.get(i) || "Sec_1";

    if (type === "BEAM") {
      const ps0 = nodeToPS(el[0]), ps1 = nodeToPS(el[1]);
      L.push(`  LINE  "E${i + 1}"  BEAM  "${ps0.pt}"  "${ps1.pt}"  0`);
      laEntries.push(`  LINEASSIGN  "E${i + 1}"  "${ps0.story}"  SECTION "${secName}"  MINNUMSTA 3 AUTOMESH "YES"  `);
    } else {
      const bot = nodes[el[0]][2] <= nodes[el[1]][2] ? el[0] : el[1];
      const top = nodes[el[0]][2] <= nodes[el[1]][2] ? el[1] : el[0];
      const psTop = nodeToPS(top);
      const zBot = rd(nodes[bot][2]), zTop = rd(nodes[top][2]);
      const botIdx = sortedZ.indexOf(zBot), topIdx = sortedZ.indexOf(zTop);
      const nStories = Math.max(1, topIdx >= 0 && botIdx >= 0 ? topIdx - botIdx : 1);
      L.push(`  LINE  "E${i + 1}"  ${type}  "${psTop.pt}"  "${psTop.pt}"  ${nStories}`);
      for (let s = 0; s < nStories; s++) {
        const storyIdx = topIdx - s;
        if (storyIdx >= 0 && storyIdx < storyNames.length) {
          laEntries.push(`  LINEASSIGN  "E${i + 1}"  "${storyNames[storyIdx]}"  SECTION "${secName}"  MINNUMSTA 3 AUTOMESH "YES"  `);
        }
      }
    }
  }
  L.push(``);

  // Supports
  L.push(`$ POINT ASSIGNS`);
  if (supports) {
    for (const s of supports) {
      const ni = Math.round(s[0]) - 1; // 1-based to 0-based
      if (ni < 0 || ni >= nodes.length) continue;
      const dofs: string[] = [];
      if (s[1] > 0.5) dofs.push("UX"); if (s[2] > 0.5) dofs.push("UY");
      if (s[3] > 0.5) dofs.push("UZ"); if (s[4] > 0.5) dofs.push("RX");
      if (s[5] > 0.5) dofs.push("RY"); if (s[6] > 0.5) dofs.push("RZ");
      if (dofs.length > 0) {
        const ps = nodeToPS(ni);
        L.push(`  POINTASSIGN  "${ps.pt}"  "${ps.story}"  RESTRAINT "${dofs.join(" ")}"  `);
      }
    }
  }
  L.push(``);

  // Line assigns
  L.push(`$ LINE ASSIGNS`);
  laEntries.forEach(la => L.push(la));
  L.push(``);

  // Load patterns
  L.push(`$ LOAD PATTERNS`);
  L.push(`  LOADPATTERN "Dead"  TYPE  "Dead"  SELFWEIGHT  1`);
  L.push(`  LOADPATTERN "Live"  TYPE  "Live"  SELFWEIGHT  0`);
  L.push(``);

  // Loads
  if (loads && loads.length > 0) {
    L.push(`$ POINT OBJECT LOADS`);
    for (const ld of loads) {
      const ni = Math.round(ld[0]) - 1;
      if (ni < 0 || ni >= nodes.length) continue;
      const ps = nodeToPS(ni);
      if (Math.abs(ld[1]) > 1e-10) L.push(`  POINTLOAD  "${ps.pt}"  "${ps.story}"  "Dead"  TYPE "FORCE"  FX ${rd(ld[1])}`);
      if (Math.abs(ld[2]) > 1e-10) L.push(`  POINTLOAD  "${ps.pt}"  "${ps.story}"  "Dead"  TYPE "FORCE"  FY ${rd(ld[2])}`);
      if (Math.abs(ld[3]) > 1e-10) L.push(`  POINTLOAD  "${ps.pt}"  "${ps.story}"  "Dead"  TYPE "FORCE"  FZ ${rd(ld[3])}`);
    }
    L.push(``);
  }

  L.push(`  END`);
  L.push(`$ END OF MODEL FILE`);
  return L.join("\r\n");
}
