// ── HékatanLab Plotter — Three.js + Canvas (awatif-ui style) ──
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface PlotData {
  type: 'line' | 'scatter' | 'bar' | 'stem' | 'hist' | 'line3d' | 'surf';
  x: number[];
  y: number[];
  z?: number[];           // for 3D
  zGrid?: number[][];     // for surf
  xGrid?: number[];       // for surf
  yGrid?: number[];       // for surf
  title?: string;
  xlabel?: string;
  ylabel?: string;
  zlabel?: string;
  color?: string;
  lineWidth?: number;
}

const COLORS = [0x4fc3f7, 0xff7043, 0x66bb6a, 0xab47bc, 0xffa726, 0xef5350, 0x26c6da, 0xec407a];
const BG_COLOR = 0x111118;

// ── Main render function ──
export function renderPlot(data: PlotData, width = 560, height = 400): HTMLDivElement {
  const is3D = data.type === 'line3d' || data.type === 'surf';

  if (!is3D) {
    // 2D plots use Canvas (cleaner for charts)
    const wrapper = document.createElement('div');
    wrapper.style.margin = '8px auto';
    const canvas = render2DCanvas(data, width, height);
    wrapper.appendChild(canvas);
    return wrapper;
  }

  // 3D plots use Three.js with orbit controls (awatif-ui style)
  return render3DScene(data, width, height);
}

// ══════════════════════════════════════════
// 3D Plots — Three.js with orbit controls
// ══════════════════════════════════════════

function render3DScene(data: PlotData, W: number, H: number): HTMLDivElement {
  const container = document.createElement('div');
  container.style.width = W + 'px';
  container.style.height = H + 'px';
  container.style.margin = '8px auto';
  container.style.borderRadius = '6px';
  container.style.overflow = 'hidden';
  container.style.position = 'relative';

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);

  // Camera
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1000);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  // Z-up (engineering convention, like awatif)
  THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);

  // Build geometry
  let bounds: { min: THREE.Vector3; max: THREE.Vector3 };

  if (data.type === 'surf') {
    bounds = addSurf(scene, data);
  } else {
    bounds = addLine3D(scene, data);
  }

  // Grid and axes
  const center = new THREE.Vector3().addVectors(bounds.min, bounds.max).multiplyScalar(0.5);
  const size = new THREE.Vector3().subVectors(bounds.max, bounds.min);
  const gridSize = Math.max(size.x, size.y, size.z) * 1.5 || 10;

  addGrid(scene, gridSize, center);
  addAxes(scene, gridSize * 0.4, center);

  // Camera position
  const dist = gridSize * 1.8;
  camera.position.set(center.x + dist * 0.7, center.y - dist * 0.7, center.z + dist * 0.5);
  camera.up.set(0, 0, 1);
  controls.target.copy(center);
  controls.update();

  // Title
  if (data.title) {
    const titleDiv = document.createElement('div');
    titleDiv.textContent = data.title;
    titleDiv.style.cssText = 'position:absolute;top:8px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.85);font:bold 13px sans-serif;pointer-events:none;';
    container.appendChild(titleDiv);
  }

  // Animation loop
  let animId = 0;
  const animate = () => {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  // Cleanup when removed from DOM
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

function addLine3D(scene: THREE.Scene, data: PlotData): { min: THREE.Vector3; max: THREE.Vector3 } {
  const { x, y, z } = data;
  if (!x.length || !y.length || !z?.length) return { min: new THREE.Vector3(), max: new THREE.Vector3() };

  const points: THREE.Vector3[] = [];
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (let i = 0; i < x.length; i++) {
    const p = new THREE.Vector3(x[i], y[i], z[i]);
    points.push(p);
    min.min(p);
    max.max(p);
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: data.color ? new THREE.Color(data.color) : COLORS[0] });
  scene.add(new THREE.Line(geometry, material));

  return { min, max };
}

function addSurf(scene: THREE.Scene, data: PlotData): { min: THREE.Vector3; max: THREE.Vector3 } {
  const { xGrid, yGrid, zGrid } = data;
  if (!xGrid || !yGrid || !zGrid) return { min: new THREE.Vector3(), max: new THREE.Vector3() };

  const nx = xGrid.length, ny = yGrid.length;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  // Find Z range for coloring
  let zMin = Infinity, zMax = -Infinity;
  for (const row of zGrid) for (const v of row) {
    if (v < zMin) zMin = v;
    if (v > zMax) zMax = v;
  }
  if (zMin === zMax) { zMin -= 1; zMax += 1; }

  // Build mesh geometry (quads → triangles)
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const z = zGrid[i]?.[j] ?? 0;
      vertices.push(xGrid[i], yGrid[j], z);
      min.min(new THREE.Vector3(xGrid[i], yGrid[j], z));
      max.max(new THREE.Vector3(xGrid[i], yGrid[j], z));

      // Color by Z height (rainbow)
      const t = (z - zMin) / (zMax - zMin);
      const c = new THREE.Color().setHSL((1 - t) * 0.67, 0.9, 0.5);
      colors.push(c.r, c.g, c.b);
    }
  }

  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < ny - 1; j++) {
      const a = i * ny + j;
      const b = a + 1;
      const c = (i + 1) * ny + j;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Solid mesh with vertex colors
  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shininess: 30,
    transparent: true,
    opacity: 0.85,
  });
  scene.add(new THREE.Mesh(geo, mat));

  // Wireframe overlay
  const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.15, transparent: true });
  scene.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), wireMat));

  // Lighting for Phong
  scene.add(new THREE.AmbientLight(0x404040, 2));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, -5, 10);
  scene.add(dirLight);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight2.position.set(-5, 5, -5);
  scene.add(dirLight2);

  return { min, max };
}

function addGrid(scene: THREE.Scene, size: number, center: THREE.Vector3) {
  const divisions = 10;
  const grid = new THREE.GridHelper(size, divisions, 0x333344, 0x222233);
  grid.rotation.x = Math.PI / 2; // Z-up
  grid.position.set(center.x, center.y, center.z - (center.z > 0 ? center.z : 0));
  scene.add(grid);
}

function addAxes(scene: THREE.Scene, length: number, center: THREE.Vector3) {
  const origin = new THREE.Vector3(
    center.x - length * 0.5,
    center.y - length * 0.5,
    center.z - length * 0.5
  );

  // X axis (red)
  const xDir = new THREE.Vector3(1, 0, 0);
  scene.add(new THREE.ArrowHelper(xDir, origin, length, 0xff4444, length * 0.08, length * 0.04));

  // Y axis (green)
  const yDir = new THREE.Vector3(0, 1, 0);
  scene.add(new THREE.ArrowHelper(yDir, origin, length, 0x44ff44, length * 0.08, length * 0.04));

  // Z axis (blue)
  const zDir = new THREE.Vector3(0, 0, 1);
  scene.add(new THREE.ArrowHelper(zDir, origin, length, 0x4488ff, length * 0.08, length * 0.04));
}

// ══════════════════════════════════════════
// 2D Plots — Canvas (clean charts)
// ══════════════════════════════════════════

function render2DCanvas(data: PlotData, W: number, H: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.borderRadius = '6px';
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';

  const ctx = canvas.getContext('2d')!;
  const pad = { top: 40, right: 30, bottom: 55, left: 70 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  const { x, y } = data;
  if (!x.length || !y.length) return canvas;

  let xMin = Math.min(...x), xMax = Math.max(...x);
  let yMin = Math.min(...y), yMax = Math.max(...y);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }

  const yPad = (yMax - yMin) * 0.05;
  yMin -= yPad; yMax += yPad;

  const toX = (v: number) => pad.left + ((v - xMin) / (xMax - xMin)) * pw;
  const toY = (v: number) => pad.top + ph - ((v - yMin) / (yMax - yMin)) * ph;

  // Background
  ctx.fillStyle = '#111118';
  ctx.fillRect(0, 0, W, H);

  // Grid
  const xTicks = niceTicks(xMin, xMax, 6);
  const yTicks = niceTicks(yMin, yMax, 5);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (const v of yTicks) {
    const yy = toY(v);
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left + pw, yy); ctx.stroke();
  }
  for (const v of xTicks) {
    const xx = toX(v);
    ctx.beginPath(); ctx.moveTo(xx, pad.top); ctx.lineTo(xx, pad.top + ph); ctx.stroke();
  }

  // Axes border
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.strokeRect(pad.left, pad.top, pw, ph);

  // Tick labels
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  for (const v of xTicks) {
    const xx = toX(v);
    if (xx >= pad.left && xx <= pad.left + pw) ctx.fillText(fmtTick(v), xx, pad.top + ph + 18);
  }
  ctx.textAlign = 'right';
  for (const v of yTicks) {
    const yy = toY(v);
    if (yy >= pad.top && yy <= pad.top + ph) ctx.fillText(fmtTick(v), pad.left - 8, yy + 4);
  }

  const hexColor = data.color || '#4fc3f7';

  if (data.type === 'bar') {
    const barW = Math.max(2, pw / x.length * 0.7);
    ctx.fillStyle = hexColor;
    const y0 = toY(Math.max(0, yMin));
    for (let i = 0; i < x.length; i++) {
      const bx = toX(x[i]) - barW / 2, by = toY(y[i]);
      ctx.fillRect(bx, by, barW, y0 - by);
    }
  } else if (data.type === 'stem') {
    ctx.strokeStyle = hexColor;
    ctx.lineWidth = 1.5;
    const y0 = toY(Math.max(0, yMin));
    for (let i = 0; i < x.length; i++) {
      const px = toX(x[i]), py = toY(y[i]);
      ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, py); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = hexColor; ctx.fill();
    }
  } else if (data.type === 'hist') {
    ctx.fillStyle = hexColor;
    const y0 = toY(0);
    for (let i = 0; i < x.length - 1; i++) {
      const bx1 = toX(x[i]), bx2 = toX(x[i + 1]), by = toY(y[i]);
      ctx.fillRect(bx1, by, bx2 - bx1 - 1, y0 - by);
    }
  } else if (data.type === 'scatter') {
    ctx.fillStyle = hexColor;
    for (let i = 0; i < x.length; i++) {
      ctx.beginPath(); ctx.arc(toX(x[i]), toY(y[i]), 4, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Line plot
    ctx.strokeStyle = hexColor;
    ctx.lineWidth = data.lineWidth || 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < x.length; i++) {
      const px = toX(x[i]), py = toY(y[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Title
  if (data.title) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.title, W / 2, 22);
  }
  // Axis labels
  if (data.xlabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.xlabel, pad.left + pw / 2, H - 8);
  }
  if (data.ylabel) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.translate(14, pad.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(data.ylabel, 0, 0);
    ctx.restore();
  }

  return canvas;
}

// ── Utilities ──

function niceTicks(min: number, max: number, targetCount: number): number[] {
  const range = max - min;
  if (range === 0) return [min];
  const rawStep = range / targetCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step: number;
  if (norm <= 1.5) step = mag;
  else if (norm <= 3.5) step = 2 * mag;
  else if (norm <= 7.5) step = 5 * mag;
  else step = 10 * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.01; v += step) {
    ticks.push(parseFloat(v.toPrecision(10)));
  }
  return ticks;
}

function fmtTick(v: number): string {
  if (Math.abs(v) < 1e-10) return '0';
  if (Number.isInteger(v) && Math.abs(v) < 1e6) return v.toString();
  if (Math.abs(v) >= 1e4 || Math.abs(v) < 0.01) return v.toExponential(1);
  const s = v.toFixed(2).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

// ── Sentinel class to identify plot commands in engine results ──
export class PlotCommand {
  constructor(public data: PlotData) {}
}
