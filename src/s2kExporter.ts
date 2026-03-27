/**
 * SAP2000 .s2k Exporter — genera archivo S2K desde datos del editor MATLAB
 * Formato TABLE (v24.1.0) compatible con SAP2000
 */

export interface S2kExportData {
  nodes: number[][];       // [[x,y,z], ...]
  frames?: number[][];     // [[n1,n2], ...] (1-based in MATLAB, 0-based here)
  shells?: number[][];     // [[n1,n2,n3], [n1,n2,n3,n4], ...]
  frameProps?: number[][];  // [[E, A, Iz, Iy, J, G], ...]
  shellProps?: number[][];  // [[E, nu, t], ...]
  supports?: number[][];   // [[node, ux, uy, uz, rx, ry, rz], ...]
  loads?: number[][];      // [[node, Fx, Fy, Fz, Mx, My, Mz], ...]
  title?: string;
  units?: { force: string; length: string };
}

function fmt(v: number): string {
  if (v === 0 || Math.abs(v) < 1e-15) return "0";
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && Math.abs(v) > 0)) return v.toExponential(8);
  return parseFloat(v.toPrecision(10)).toString();
}

export function exportS2k(data: S2kExportData): string {
  const { nodes, frames, shells, frameProps, shellProps, supports, loads } = data;
  const units = data.units || { force: "KN", length: "m" };
  const title = data.title || "HékatanLab Model";
  const L: string[] = [];

  L.push(`File ${title}.$2k was saved from HékatanLab Web`);
  L.push(` `);

  // Active DOFs
  L.push(`TABLE:  "ACTIVE DEGREES OF FREEDOM"`);
  L.push(`   UX=Yes   UY=Yes   UZ=Yes   RX=Yes   RY=Yes   RZ=Yes`);
  L.push(` `);

  // Connectivity — Frame
  if (frames && frames.length > 0) {
    L.push(`TABLE:  "CONNECTIVITY - FRAME"`);
    for (let i = 0; i < frames.length; i++) {
      L.push(`   Frame=${i + 1}   JointI=${frames[i][0]}   JointJ=${frames[i][1]}   IsCurved=No`);
    }
    L.push(` `);
  }

  // Connectivity — Area
  if (shells && shells.length > 0) {
    L.push(`TABLE:  "CONNECTIVITY - AREA"`);
    for (let i = 0; i < shells.length; i++) {
      const el = shells[i];
      const jParts = el.map((n, j) => `Joint${j + 1}=${n}`).join("   ");
      L.push(`   Area=${i + 1}   NumJoints=${el.length}   ${jParts}`);
    }
    L.push(` `);
  }

  // Coordinate system
  L.push(`TABLE:  "COORDINATE SYSTEMS"`);
  L.push(`   Name=GLOBAL   Type=Cartesian   X=0   Y=0   Z=0   AboutZ=0   AboutY=0   AboutX=0`);
  L.push(` `);

  // Collect unique materials
  const matSet = new Map<string, { E: number; nu: number; G: number }>();
  if (frameProps) {
    for (const p of frameProps) {
      const E = p[0], G = p[5] || E / (2 * 1.2);
      const nu = E > 0 && G > 0 ? Math.max(0, Math.min(0.5, E / (2 * G) - 1)) : 0.2;
      const key = `MAT_${Math.round(E)}`;
      if (!matSet.has(key)) matSet.set(key, { E, nu, G });
    }
  }
  if (shellProps) {
    for (const p of shellProps) {
      const E = p[0], nu = p[1];
      const G = E / (2 * (1 + nu));
      const key = `MAT_${Math.round(E)}`;
      if (!matSet.has(key)) matSet.set(key, { E, nu, G });
    }
  }

  // Frame section props + assignments
  if (frames && frames.length > 0 && frameProps) {
    const secMap = new Map<string, { A: number; Iz: number; Iy: number; J: number; matKey: string }>();
    const elemSec = new Map<number, string>();

    for (let i = 0; i < frames.length; i++) {
      const p = frameProps[Math.min(i, frameProps.length - 1)];
      const E = p[0], A = p[1], Iz = p[2], Iy = p[3], J = p[4];
      const matKey = `MAT_${Math.round(E)}`;
      const key = `A${A.toPrecision(6)}_Iz${Iz.toPrecision(6)}`;
      if (!secMap.has(key)) {
        let h = 0.3, b = 0.3;
        if (A > 0 && Iz > 0) { h = Math.sqrt(12 * Iz / A); b = A / h; }
        secMap.set(key, { A, Iz, Iy, J, matKey });
      }
      const secIdx = [...secMap.keys()].indexOf(key) + 1;
      elemSec.set(i, `SEC${secIdx}`);
    }

    L.push(`TABLE:  "FRAME SECTION ASSIGNMENTS"`);
    for (let i = 0; i < frames.length; i++) {
      L.push(`   Frame=${i + 1}   AutoSelect=N.A.   AnalSect=${elemSec.get(i)}   MatProp=Default`);
    }
    L.push(` `);

    L.push(`TABLE:  "FRAME SECTION PROPERTIES 01 - GENERAL"`);
    let idx = 0;
    for (const [, sec] of secMap) {
      idx++;
      const As = sec.A * 5 / 6;
      let h = 0.3, b = 0.3;
      if (sec.A > 0 && sec.Iz > 0) { h = Math.sqrt(12 * sec.Iz / sec.A); b = sec.A / h; }
      L.push(`   SectionName=SEC${idx}   Material=${sec.matKey}   Shape=Rectangular   t3=${fmt(h)}   t2=${fmt(b)}   Area=${fmt(sec.A)}   TorsConst=${fmt(sec.J)}   I33=${fmt(sec.Iz)}   I22=${fmt(sec.Iy)}   AS2=${fmt(As)}   AS3=${fmt(As)} _`);
      L.push(`        Color=Blue   FromFile=No   AMod=1   A2Mod=1   A3Mod=1   JMod=1   I2Mod=1   I3Mod=1   MMod=1   WMod=1`);
    }
    L.push(` `);
  }

  // Shell section props + assignments
  if (shells && shells.length > 0 && shellProps) {
    const secMap = new Map<string, { t: number; matKey: string }>();
    const elemSec = new Map<number, string>();

    for (let i = 0; i < shells.length; i++) {
      const p = shellProps[Math.min(i, shellProps.length - 1)];
      const E = p[0], t = p[2];
      const matKey = `MAT_${Math.round(E)}`;
      const key = `t${t.toPrecision(6)}`;
      if (!secMap.has(key)) secMap.set(key, { t, matKey });
      const secIdx = [...secMap.keys()].indexOf(key) + 1;
      elemSec.set(i, `SSEC${secIdx}`);
    }

    L.push(`TABLE:  "AREA SECTION ASSIGNMENTS"`);
    for (let i = 0; i < shells.length; i++) {
      L.push(`   Area=${i + 1}   Section=${elemSec.get(i)}   MatProp=Default`);
    }
    L.push(` `);

    L.push(`TABLE:  "AREA SECTION PROPERTIES"`);
    let idx = 0;
    for (const [, sec] of secMap) {
      idx++;
      L.push(`   Section=SSEC${idx}   Material=${sec.matKey}   MatAngle=0   AreaType=Shell   Type=ShellThin   DrillDOF=Yes   Thickness=${fmt(sec.t)}   BendThick=${fmt(sec.t)}   Color=Cyan`);
    }
    L.push(` `);
  }

  // Joint coordinates
  L.push(`TABLE:  "JOINT COORDINATES"`);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    L.push(`   Joint=${i + 1}   CoordSys=GLOBAL   CoordType=Cartesian   XorR=${fmt(n[0])}   Y=${fmt(n[1])}   Z=${fmt(n[2])}   SpecialJt=No`);
  }
  L.push(` `);

  // Restraints
  if (supports && supports.length > 0) {
    L.push(`TABLE:  "JOINT RESTRAINT ASSIGNMENTS"`);
    for (const s of supports) {
      const nodeIdx = Math.round(s[0]);
      const yn = (v: number) => v > 0.5 ? "Yes" : "No";
      L.push(`   Joint=${nodeIdx}   U1=${yn(s[1])}   U2=${yn(s[2])}   U3=${yn(s[3])}   R1=${yn(s[4])}   R2=${yn(s[5])}   R3=${yn(s[6])}`);
    }
    L.push(` `);
  }

  // Load patterns
  L.push(`TABLE:  "LOAD PATTERN DEFINITIONS"`);
  L.push(`   LoadPat=DEAD   DesignType=Dead   SelfWtMult=0`);
  L.push(` `);

  L.push(`TABLE:  "LOAD CASE DEFINITIONS"`);
  L.push(`   Case=DEAD   Type=LinStatic   InitialCond=Zero   DesTypeOpt="Prog Det"   DesignType=Dead   DesActOpt="Prog Det"   DesignAct=Non-Composite   AutoType=None   RunCase=Yes`);
  L.push(` `);

  L.push(`TABLE:  "CASE - STATIC 1 - LOAD ASSIGNMENTS"`);
  L.push(`   Case=DEAD   LoadType="Load pattern"   LoadName=DEAD   LoadSF=1`);
  L.push(` `);

  // Joint loads
  if (loads && loads.length > 0) {
    L.push(`TABLE:  "JOINT LOADS - FORCE"`);
    for (const ld of loads) {
      const nodeIdx = Math.round(ld[0]);
      L.push(`   Joint=${nodeIdx}   LoadPat=DEAD   CoordSys=GLOBAL   F1=${fmt(ld[1])}   F2=${fmt(ld[2])}   F3=${fmt(ld[3])}   M1=${fmt(ld[4])}   M2=${fmt(ld[5])}   M3=${fmt(ld[6])}`);
    }
    L.push(` `);
  }

  // Material properties
  L.push(`TABLE:  "MATERIAL PROPERTIES 01 - GENERAL"`);
  for (const [name] of matSet) {
    L.push(`   Material=${name}   Type=Concrete   SymType=Isotropic   TempDepend=No   Color=Green`);
  }
  L.push(` `);

  L.push(`TABLE:  "MATERIAL PROPERTIES 02 - BASIC MECHANICAL PROPERTIES"`);
  for (const [name, mat] of matSet) {
    L.push(`   Material=${name}   UnitWeight=0   UnitMass=0   E1=${fmt(mat.E)}   G12=${fmt(mat.G)}   U12=${fmt(mat.nu)}   A1=9.9E-06`);
  }
  L.push(` `);

  // Program control
  L.push(`TABLE:  "PROGRAM CONTROL"`);
  L.push(`   ProgramName=SAP2000   Version=24.1.0   CurrUnits="${units.force}, ${units.length}, C"   SteelCode="AISC 360-16"   ConcCode="ACI 318-19"   RegenHinge=Yes`);
  L.push(` `);

  L.push(`END TABLE DATA`);
  L.push(``);

  return L.join("\r\n");
}
