// ── HékatanLab 3D Viewer — Structure visualization (awatif-ui style) ──
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface DiagramData {
  elemForces: number[][];   // [[fi, fj], ...] per element — values at each end
  type: 'constant' | 'linear';  // constant=N/V (rect), linear=M (trapezoid)
  label?: string;           // "N", "V", "M"
}

export interface StructureViewData {
  type: 'mesh' | 'deformed' | 'contour' | 'diagram';
  nodes: number[][];        // [[x,y,z], ...]
  elements: number[][];     // [[i,j], [i,j,k], [i,j,k,l], ...]  (1-based)
  U?: number[];             // displacement vector (all DOFs)
  dofPerNode?: number;      // 2, 3, or 6 (default 3)
  scale?: number;           // deformation scale
  values?: number[];        // contour values per node
  title?: string;
  supports?: number[];      // node indices with supports (1-based)
  loads?: number[][];       // [[nodeIdx, fx, fy, fz], ...] (1-based)
  diagram?: DiagramData;    // force diagram data
}

function isLight(): boolean { return document.body.classList.contains('light'); }
function getBg(): number { return isLight() ? 0xf0f0f0 : 0x111118; }

export class ViewCommand {
  constructor(public data: StructureViewData) {}
}

export function renderStructure(data: StructureViewData, W = 600, H = 450): HTMLDivElement {
  const container = document.createElement('div');
  container.style.width = W + 'px';
  container.style.height = H + 'px';
  container.style.margin = '8px auto';
  container.style.borderRadius = '6px';
  container.style.overflow = 'hidden';
  container.style.position = 'relative';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(getBg());

  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 10000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);

  const nodes = data.nodes;
  const elements = data.elements;
  const dofPerNode = data.dofPerNode || 3;

  // Compute bounds
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const [x, y, z] of nodes) {
    min.min(new THREE.Vector3(x, y || 0, z || 0));
    max.max(new THREE.Vector3(x, y || 0, z || 0));
  }
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const size = new THREE.Vector3().subVectors(max, min);
  const maxDim = Math.max(size.x, size.y, size.z) || 10;

  // ── Draw elements ──
  if (data.type === 'contour' && data.values) {
    addContour(scene, nodes, elements, data.values);
  } else if (data.type === 'diagram' && data.diagram) {
    // Draw structure in gray + force diagram overlay
    addWireframe(scene, nodes, elements, 0x555566);
    addDiagram(scene, nodes, elements, data.diagram, maxDim);
  } else if (data.type === 'deformed' && data.U) {
    const scale = data.scale || 1;
    const defNodes = getDeformedNodes(nodes, data.U, dofPerNode, scale);
    addWireframe(scene, defNodes, elements, 0xff7043);
    addWireframe(scene, nodes, elements, 0x4488cc, true);
  } else {
    addWireframeColored(scene, nodes, elements);
  }

  // ── Nodes (spheres — awatif-ui style) ──
  addNodes(scene, nodes, isLight() ? 0x2e7d32 : 0x66bb6a, maxDim);

  // ── Supports ──
  if (data.supports) addSupports(scene, nodes, data.supports, maxDim);

  // ── Loads ──
  if (data.loads) addLoads(scene, nodes, data.loads, maxDim);

  // Grid & axes
  addGrid(scene, maxDim * 1.5, center);
  addAxes(scene, maxDim * 0.3, min);

  // Lighting
  scene.add(new THREE.AmbientLight(0x606060, 2));
  const dl = new THREE.DirectionalLight(0xffffff, 1);
  dl.position.set(maxDim, -maxDim, maxDim * 2);
  scene.add(dl);

  // Camera
  const dist = maxDim * 2.5;
  camera.position.set(center.x + dist * 0.6, center.y - dist * 0.8, center.z + dist * 0.5);
  camera.up.set(0, 0, 1);
  controls.target.copy(center);
  controls.update();

  // Title
  if (data.title) {
    const td = document.createElement('div');
    td.textContent = data.title;
    const tc = isLight() ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
    td.style.cssText = `position:absolute;top:8px;left:0;right:0;text-align:center;color:${tc};font:bold 13px sans-serif;pointer-events:none;`;
    container.appendChild(td);
  }

  // Legend for contour
  if (data.type === 'contour' && data.values) addLegend(container, data.values);

  // Animate
  let animId = 0;
  const animate = () => {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const observer = new MutationObserver(() => {
    if (!document.contains(container)) {
      cancelAnimationFrame(animId);
      renderer.dispose();
      controls.dispose();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return container;
}

// ═══════════════════════════════════════════════════
//  ELEMENT RENDERING
// ═══════════════════════════════════════════════════

function addWireframe(scene: THREE.Scene, nodes: number[][], elements: number[][], color: number, dashed = false) {
  for (const el of elements) {
    const pts: THREE.Vector3[] = [];
    for (const idx of el) {
      const n = nodes[idx - 1];
      if (n) pts.push(new THREE.Vector3(n[0], n[1] || 0, n[2] || 0));
    }
    if (pts.length < 2) continue;
    if (pts.length >= 3) pts.push(pts[0].clone());

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.15, opacity: 0.4, transparent: true })
      : new THREE.LineBasicMaterial({ color, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    scene.add(line);

    if (el.length >= 3 && !dashed) {
      const faceGeo = new THREE.BufferGeometry();
      const verts: number[] = [];
      if (el.length === 3) {
        for (const p of pts.slice(0, 3)) verts.push(p.x, p.y, p.z);
      } else if (el.length === 4) {
        for (const idx of [0,1,2, 0,2,3]) verts.push(pts[idx].x, pts[idx].y, pts[idx].z);
      }
      faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      faceGeo.computeVertexNormals();
      scene.add(new THREE.Mesh(faceGeo, new THREE.MeshPhongMaterial({
        color, side: THREE.DoubleSide, transparent: true, opacity: 0.25
      })));
    }
  }
}

// Color-coded wireframe: columns (green), beams (blue), diagonals (orange)
function addWireframeColored(scene: THREE.Scene, nodes: number[][], elements: number[][]) {
  const light = isLight();
  const COL_BEAM = light ? 0x1565c0 : 0x4488cc;
  const COL_COLUMN = light ? 0x2e7d32 : 0x88cc44;
  const COL_DIAG = light ? 0xbf360c : 0xcc8844;
  const COL_SHELL = light ? 0x1565c0 : 0x4488cc;

  for (const el of elements) {
    const pts: THREE.Vector3[] = [];
    for (const idx of el) {
      const n = nodes[idx - 1];
      if (n) pts.push(new THREE.Vector3(n[0], n[1] || 0, n[2] || 0));
    }
    if (pts.length < 2) continue;

    let color = COL_SHELL;
    if (el.length === 2) {
      const dz = Math.abs(pts[1].z - pts[0].z);
      const len = pts[0].distanceTo(pts[1]);
      if (len > 1e-6) {
        const vertRatio = dz / len;
        if (vertRatio > 0.85) color = COL_COLUMN;
        else if (vertRatio < 0.15) color = COL_BEAM;
        else color = COL_DIAG;
      }
    }
    if (pts.length >= 3) pts.push(pts[0].clone());

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 2 })));

    if (el.length >= 3) {
      const faceGeo = new THREE.BufferGeometry();
      const verts: number[] = [];
      if (el.length === 3) {
        for (const p of pts.slice(0, 3)) verts.push(p.x, p.y, p.z);
      } else if (el.length === 4) {
        for (const i of [0,1,2, 0,2,3]) verts.push(pts[i].x, pts[i].y, pts[i].z);
      }
      faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      faceGeo.computeVertexNormals();
      scene.add(new THREE.Mesh(faceGeo, new THREE.MeshPhongMaterial({
        color, side: THREE.DoubleSide, transparent: true, opacity: 0.25
      })));
    }
  }
}

// ═══════════════════════════════════════════════════
//  FORCE DIAGRAM (awatif-ui frameResults style)
// ═══════════════════════════════════════════════════

function addDiagram(scene: THREE.Scene, nodes: number[][], elements: number[][],
  diag: DiagramData, maxDim: number) {

  const forces = diag.elemForces;
  // Find max absolute force for normalization
  let fMax = 0;
  for (const [fi, fj] of forces) {
    fMax = Math.max(fMax, Math.abs(fi), Math.abs(fj));
  }
  if (fMax < 1e-20) return;

  const diagScale = maxDim * 0.25; // max diagram height = 25% of model size
  const COL_POS = 0x005f73;  // teal for positive (awatif)
  const COL_NEG = 0xae2012;  // red for negative (awatif)

  for (let e = 0; e < elements.length; e++) {
    const el = elements[e];
    if (el.length !== 2) continue;
    if (e >= forces.length) continue;

    const n1 = nodes[el[0] - 1];
    const n2 = nodes[el[1] - 1];
    if (!n1 || !n2) continue;

    const p1 = new THREE.Vector3(n1[0], n1[1] || 0, n1[2] || 0);
    const p2 = new THREE.Vector3(n2[0], n2[1] || 0, n2[2] || 0);

    const [fi, fj] = forces[e];
    const hi = (fi / fMax) * diagScale;
    const hj = (fj / fMax) * diagScale;

    // Element local axes
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();

    // Perpendicular direction (in the element plane, toward Z-up)
    let perp: THREE.Vector3;
    const up = new THREE.Vector3(0, 0, 1);
    if (Math.abs(dir.dot(up)) > 0.95) {
      // Vertical element: use Y as perpendicular
      perp = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
      if (perp.length() < 0.5) perp = new THREE.Vector3(1, 0, 0);
    } else {
      perp = new THREE.Vector3().crossVectors(dir, up).normalize();
      // Rotate perp to be perpendicular to element in the vertical plane
      perp = new THREE.Vector3().crossVectors(perp, dir).normalize();
    }

    // Offset points for diagram
    const d1 = p1.clone().addScaledVector(perp, hi);
    const d2 = p2.clone().addScaledVector(perp, hj);

    if (diag.type === 'constant') {
      // Rectangle: same height at both ends (use average if slightly different)
      drawDiagramFace(scene, p1, p2, d1, d2, fi >= 0 ? COL_POS : COL_NEG);
    } else {
      // Linear (moment): trapezoid — different heights at each end
      // Could cross zero — split into two parts
      if (fi * fj >= 0) {
        // Same sign
        const col = fi >= 0 ? COL_POS : COL_NEG;
        drawDiagramFace(scene, p1, p2, d1, d2, col);
      } else {
        // Crosses zero: find zero crossing point
        const t0 = Math.abs(fi) / (Math.abs(fi) + Math.abs(fj));
        const pMid = p1.clone().lerp(p2.clone(), t0);
        const d1c = p1.clone().addScaledVector(perp, hi);
        const d2c = p2.clone().addScaledVector(perp, hj);
        drawDiagramFace(scene, p1, pMid, d1c, pMid.clone(), fi >= 0 ? COL_POS : COL_NEG);
        drawDiagramFace(scene, pMid, p2, pMid.clone(), d2c, fj >= 0 ? COL_POS : COL_NEG);
      }
    }

    // Outline
    const outlineGeo = new THREE.BufferGeometry().setFromPoints([p1, d1, d2, p2]);
    scene.add(new THREE.Line(outlineGeo, new THREE.LineBasicMaterial({
      color: isLight() ? 0x333333 : 0xcccccc, linewidth: 1
    })));

    // Value labels at both ends
    addTextSprite(scene, fi.toFixed(1), d1, maxDim);
    addTextSprite(scene, fj.toFixed(1), d2, maxDim);
  }
}

function drawDiagramFace(scene: THREE.Scene, p1: THREE.Vector3, p2: THREE.Vector3,
  d1: THREE.Vector3, d2: THREE.Vector3, color: number) {
  const verts = [
    p1.x, p1.y, p1.z,
    d1.x, d1.y, d1.z,
    d2.x, d2.y, d2.z,
    p1.x, p1.y, p1.z,
    d2.x, d2.y, d2.z,
    p2.x, p2.y, p2.z,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    color, side: THREE.DoubleSide, transparent: true, opacity: 0.55
  });
  scene.add(new THREE.Mesh(geo, mat));
}

function addTextSprite(scene: THREE.Scene, text: string, position: THREE.Vector3, maxDim: number) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 128; canvas.height = 32;
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = isLight() ? '#111' : '#eee';
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 22);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(position);
  const s = maxDim * 0.06;
  sprite.scale.set(s * 4, s, 1);
  scene.add(sprite);
}

// ═══════════════════════════════════════════════════
//  NODES, SUPPORTS, LOADS
// ═══════════════════════════════════════════════════

function addNodes(scene: THREE.Scene, nodes: number[][], color: number, maxDim: number) {
  const radius = maxDim * 0.015;
  const sphereGeo = new THREE.SphereGeometry(radius, 8, 8);
  const mat = new THREE.MeshPhongMaterial({ color });
  for (const [x, y, z] of nodes) {
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.set(x, y || 0, z || 0);
    scene.add(sphere);
  }
}

function addSupports(scene: THREE.Scene, nodes: number[][], supports: number[], maxDim: number) {
  const sz = maxDim * 0.04;
  const mat = new THREE.MeshPhongMaterial({ color: 0x9b2226 });
  for (const idx of supports) {
    const n = nodes[idx - 1];
    if (!n) continue;
    const box = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
    box.position.set(n[0], n[1] || 0, (n[2] || 0) - sz / 2);
    scene.add(box);
  }
}

function addLoads(scene: THREE.Scene, nodes: number[][], loads: number[][], maxDim: number) {
  for (const [idx, fx, fy, fz] of loads) {
    const n = nodes[idx - 1];
    if (!n) continue;
    const origin = new THREE.Vector3(n[0], n[1] || 0, n[2] || 0);
    const dir = new THREE.Vector3(fx || 0, fy || 0, fz || 0);
    const mag = dir.length();
    if (mag < 1e-10) continue;
    dir.normalize();
    const arrowLen = maxDim * 0.2;
    scene.add(new THREE.ArrowHelper(dir, origin, arrowLen, 0xee9b00, arrowLen * 0.2, arrowLen * 0.1));
  }
}

// ═══════════════════════════════════════════════════
//  CONTOUR, LEGEND, GRID, AXES, DEFORM
// ═══════════════════════════════════════════════════

function addContour(scene: THREE.Scene, nodes: number[][], elements: number[][], values: number[]) {
  let vMin = Infinity, vMax = -Infinity;
  for (const v of values) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; }
  if (vMin === vMax) { vMin -= 1; vMax += 1; }

  for (const el of elements) {
    if (el.length < 2) continue;
    if (el.length === 2) {
      const pts: THREE.Vector3[] = [], cols: number[] = [];
      for (const idx of el) {
        const n = nodes[idx - 1];
        if (!n) continue;
        pts.push(new THREE.Vector3(n[0], n[1] || 0, n[2] || 0));
        const t = (values[idx - 1] - vMin) / (vMax - vMin);
        const c = new THREE.Color().setHSL((1 - t) * 0.67, 0.9, 0.5);
        cols.push(c.r, c.g, c.b);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 3 })));
    } else {
      const verts: number[] = [], cols: number[] = [];
      const idxs = el.length === 3 ? [0,1,2] : [0,1,2, 0,2,3];
      for (const li of idxs) {
        const ni = el[li] - 1;
        const n = nodes[ni];
        if (!n) continue;
        verts.push(n[0], n[1] || 0, n[2] || 0);
        const t = (values[ni] - vMin) / (vMax - vMin);
        const c = new THREE.Color().setHSL((1 - t) * 0.67, 0.9, 0.5);
        cols.push(c.r, c.g, c.b);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
  }
}

function addLegend(container: HTMLDivElement, values: number[]) {
  let vMin = Infinity, vMax = -Infinity;
  for (const v of values) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; }

  const legend = document.createElement('div');
  legend.style.cssText = 'position:absolute;top:30px;right:10px;width:20px;height:60%;background:linear-gradient(to bottom,hsl(0,90%,50%),hsl(60,90%,50%),hsl(120,90%,50%),hsl(180,90%,50%),hsl(240,90%,50%));border-radius:3px;';

  const labelMax = document.createElement('div');
  labelMax.textContent = vMax.toPrecision(3);
  const lc = isLight() ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
  labelMax.style.cssText = `position:absolute;top:28px;right:36px;color:${lc};font:10px monospace;pointer-events:none;`;

  const labelMin = document.createElement('div');
  labelMin.textContent = vMin.toPrecision(3);
  labelMin.style.cssText = `position:absolute;bottom:calc(40% - 2px);right:36px;color:${lc};font:10px monospace;pointer-events:none;`;

  container.appendChild(legend);
  container.appendChild(labelMax);
  container.appendChild(labelMin);
}

function getDeformedNodes(nodes: number[][], U: number[], dofPerNode: number, scale: number): number[][] {
  return nodes.map((n, i) => {
    const base = i * dofPerNode;
    const dx = (U[base] || 0) * scale;
    const dy = (U[base + 1] || 0) * scale;
    const dz = dofPerNode >= 3 ? (U[base + 2] || 0) * scale : 0;
    return [n[0] + dx, (n[1] || 0) + dy, (n[2] || 0) + dz];
  });
}

function addGrid(scene: THREE.Scene, size: number, center: THREE.Vector3) {
  const gc1 = isLight() ? 0xbbbbcc : 0x333344;
  const gc2 = isLight() ? 0xccccdd : 0x222233;
  const grid = new THREE.GridHelper(size, 10, gc1, gc2);
  grid.rotation.x = Math.PI / 2;
  grid.position.copy(center);
  grid.position.z = Math.min(center.z, 0);
  scene.add(grid);
}

function addAxes(scene: THREE.Scene, len: number, origin: THREE.Vector3) {
  const o = origin.clone();
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0), o, len, 0xff4444, len*0.08, len*0.04));
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0,1,0), o, len, 0x44ff44, len*0.08, len*0.04));
  scene.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,1), o, len, 0x4488ff, len*0.08, len*0.04));
}
