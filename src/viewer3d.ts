// ── HékatanLab 3D Viewer — Structure visualization (awatif-ui style) ──
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface StructureViewData {
  type: 'mesh' | 'deformed' | 'contour';
  nodes: number[][];        // [[x,y,z], ...]
  elements: number[][];     // [[i,j], [i,j,k], [i,j,k,l], ...]  (1-based)
  U?: number[];             // displacement vector (all DOFs)
  dofPerNode?: number;      // 2, 3, or 6 (default 3)
  scale?: number;           // deformation scale
  values?: number[];        // contour values per node
  title?: string;
  supports?: number[];      // node indices with supports (1-based)
  loads?: number[][];       // [[nodeIdx, fx, fy, fz], ...] (1-based)
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
  } else {
    // Wireframe structure
    addWireframe(scene, nodes, elements, 0x4488cc);
  }

  // ── Deformed shape ──
  if (data.type === 'deformed' && data.U) {
    const scale = data.scale || 1;
    const defNodes = getDeformedNodes(nodes, data.U, dofPerNode, scale);
    addWireframe(scene, defNodes, elements, 0xff7043);
    // Also draw original as dashed
    addWireframe(scene, nodes, elements, 0x4488cc, true);
  }

  // ── Nodes ──
  addNodes(scene, nodes, 0x66bb6a, maxDim);

  // ── Supports ──
  if (data.supports) {
    addSupports(scene, nodes, data.supports, maxDim);
  }

  // ── Loads ──
  if (data.loads) {
    addLoads(scene, nodes, data.loads, maxDim);
  }

  // Grid & axes
  addGrid(scene, maxDim * 1.5, center);
  addAxes(scene, maxDim * 0.3, min);

  // Lighting
  scene.add(new THREE.AmbientLight(0x404040, 2));
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
  if (data.type === 'contour' && data.values) {
    addLegend(container, data.values);
  }

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

// ── Wireframe elements ──
function addWireframe(scene: THREE.Scene, nodes: number[][], elements: number[][], color: number, dashed = false) {
  for (const el of elements) {
    const pts: THREE.Vector3[] = [];
    for (const idx of el) {
      const n = nodes[idx - 1]; // 1-based
      if (n) pts.push(new THREE.Vector3(n[0], n[1] || 0, n[2] || 0));
    }
    if (pts.length < 2) continue;

    // Close polygon for shells (3 or 4 nodes)
    if (pts.length >= 3) pts.push(pts[0].clone());

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.3, gapSize: 0.15, opacity: 0.4, transparent: true })
      : new THREE.LineBasicMaterial({ color, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    scene.add(line);

    // Fill for shells (3 or 4 nodes) with transparent face
    if (el.length >= 3 && !dashed) {
      const faceGeo = new THREE.BufferGeometry();
      const verts: number[] = [];
      if (el.length === 3) {
        for (const p of pts.slice(0, 3)) verts.push(p.x, p.y, p.z);
      } else if (el.length === 4) {
        // Two triangles
        for (const idx of [0,1,2, 0,2,3]) verts.push(pts[idx].x, pts[idx].y, pts[idx].z);
      }
      faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      faceGeo.computeVertexNormals();
      const faceMat = new THREE.MeshPhongMaterial({
        color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.25
      });
      scene.add(new THREE.Mesh(faceGeo, faceMat));
    }
  }
}

// ── Nodes as points ──
function addNodes(scene: THREE.Scene, nodes: number[][], color: number, maxDim: number) {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  for (const [x, y, z] of nodes) {
    positions.push(x, y || 0, z || 0);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color, size: maxDim * 0.03, sizeAttenuation: true });
  scene.add(new THREE.Points(geo, mat));
}

// ── Supports (red boxes) ──
function addSupports(scene: THREE.Scene, nodes: number[][], supports: number[], maxDim: number) {
  const sz = maxDim * 0.04;
  const mat = new THREE.MeshPhongMaterial({ color: 0xee3333 });
  for (const idx of supports) {
    const n = nodes[idx - 1];
    if (!n) continue;
    const box = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mat);
    box.position.set(n[0], n[1] || 0, (n[2] || 0) - sz/2);
    scene.add(box);
  }
}

// ── Loads (orange arrows) ──
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
    scene.add(new THREE.ArrowHelper(dir, origin, arrowLen, 0xffa726, arrowLen * 0.2, arrowLen * 0.1));
  }
}

// ── Contour colors ──
function addContour(scene: THREE.Scene, nodes: number[][], elements: number[][], values: number[]) {
  let vMin = Infinity, vMax = -Infinity;
  for (const v of values) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; }
  if (vMin === vMax) { vMin -= 1; vMax += 1; }

  for (const el of elements) {
    if (el.length < 2) continue;

    if (el.length === 2) {
      // Line element — color by average
      const pts: THREE.Vector3[] = [];
      const cols: number[] = [];
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
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 3 });
      scene.add(new THREE.Line(geo, mat));
    } else {
      // Shell element — colored face
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
      const mat = new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide });
      scene.add(new THREE.Mesh(geo, mat));
    }
  }
}

// ── Legend ──
function addLegend(container: HTMLDivElement, values: number[]) {
  let vMin = Infinity, vMax = -Infinity;
  for (const v of values) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; }

  const legend = document.createElement('div');
  legend.style.cssText = 'position:absolute;top:30px;right:10px;width:20px;height:60%;background:linear-gradient(to bottom,hsl(0,90%,50%),hsl(60,90%,50%),hsl(120,90%,50%),hsl(180,90%,50%),hsl(240,90%,50%));border-radius:3px;';

  const labelMax = document.createElement('div');
  labelMax.textContent = vMax.toPrecision(3);
  labelMax.style.cssText = 'position:absolute;top:28px;right:36px;color:rgba(255,255,255,0.7);font:10px monospace;pointer-events:none;';

  const labelMin = document.createElement('div');
  labelMin.textContent = vMin.toPrecision(3);
  labelMin.style.cssText = 'position:absolute;bottom:calc(40% - 2px);right:36px;color:rgba(255,255,255,0.7);font:10px monospace;pointer-events:none;';

  container.appendChild(legend);
  container.appendChild(labelMax);
  container.appendChild(labelMin);
}

// ── Deformed nodes ──
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
