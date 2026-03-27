/**
 * HékatanLab Viewer — based on awatif v2 getViewer.ts
 * Same code, no Tweakpane. Settings come from MATLAB script.
 */
import * as THREE from "three";
import van from "vanjs-core";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Node, Element, Mesh, Structure, Settings } from "./types";
import { nodes as nodesObj } from "./objects/nodes";
import { elements as elementsObj } from "./objects/elements";
import { grid } from "./objects/grid";
import { supports as supportsObj } from "./objects/supports";
import { loads as loadsObj } from "./objects/loads";
import { axes } from "./objects/axes";

export interface ViewerInput {
  nodes: number[][];         // [[x,y,z], ...] (0-based)
  elements: number[][];      // [[i,j], ...] (0-based)
  supportNodes?: number[];   // node indices (0-based)
  loadData?: number[][];     // [[nodeIdx, fx, fy, fz], ...] (0-based)
  title?: string;
  gridSize?: number;
}

function isLight(): boolean { return document.body.classList.contains('light'); }

export function createViewer(input: ViewerInput, W = 600, H = 450): HTMLDivElement {
  const { nodes: rawNodes, elements: rawElements, supportNodes, loadData, title } = input;

  // Convert to awatif types
  const nodeArr: Node[] = rawNodes.map(n => [n[0], n[1], n[2] || 0] as Node);
  const elemArr: Element[] = rawElements;

  // Calculate grid size from model extent
  let maxDim = 1;
  if (nodeArr.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of nodeArr) {
      if (n[0] < minX) minX = n[0]; if (n[0] > maxX) maxX = n[0];
      if (n[1] < minY) minY = n[1]; if (n[1] > maxY) maxY = n[1];
      if (n[2] < minZ) minZ = n[2]; if (n[2] > maxZ) maxZ = n[2];
    }
    maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  }
  const gridSize = input.gridSize || Math.ceil(maxDim * 1.5);

  // Create VanJS states (same as awatif)
  const settings: Settings = {
    gridSize: van.state(gridSize),
    displayScale: van.state(1),
    nodes: van.state(true),
    elements: van.state(true),
    supports: van.state(!!supportNodes),
    loads: van.state(!!loadData),
    deformedShape: van.state(false),
    flipAxes: van.state(false),
  };

  const derivedDisplayScale = van.derive(() =>
    settings.displayScale.val === 0 ? 1 :
    settings.displayScale.val > 0 ? settings.displayScale.val :
    -1 / settings.displayScale.val
  );

  const derivedNodes = van.state(nodeArr);

  // Build structure for loads/supports
  const supMap = new Map<number, [boolean,boolean,boolean,boolean,boolean,boolean]>();
  if (supportNodes) {
    for (const idx of supportNodes) {
      supMap.set(idx, [true, true, true, true, true, true]);
    }
  }
  const loadMap = new Map<number, [number,number,number,number,number,number]>();
  if (loadData) {
    for (const ld of loadData) {
      const idx = Math.round(ld[0]);
      loadMap.set(idx, [ld[1]||0, ld[2]||0, ld[3]||0, 0, 0, 0]);
    }
  }
  const structure: Structure = {
    nodeInputs: van.state({ supports: supMap, loads: loadMap }),
  };

  // Build mesh for elements
  const mesh: Mesh = {
    nodes: van.state(nodeArr),
    elements: van.state(elemArr),
    nodeInputs: structure.nodeInputs,
  };

  // ── Three.js setup (same as awatif getViewer.ts) ──
  THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);

  const container = document.createElement('div');
  container.style.width = W + 'px';
  container.style.height = H + 'px';
  container.style.margin = '8px auto';
  container.style.borderRadius = '6px';
  container.style.overflow = 'hidden';
  container.style.position = 'relative';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(isLight() ? 0xf0f0f0 : 0x000000);

  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2e6);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);

  // Camera position (same formula as awatif)
  const z2fit = gridSize * 0.5 + (gridSize * 0.5) / Math.tan(45 * 0.5 * Math.PI / 180);
  camera.position.set(0.5 * gridSize, -0.8 * z2fit, 0.5 * gridSize);
  controls.target.set(0.5 * gridSize, 0.5 * gridSize, 0);
  controls.minDistance = 1;
  controls.maxDistance = z2fit * 2.5;
  controls.zoomSpeed = 10;
  controls.update();

  // Add objects (same as awatif)
  scene.add(
    grid(gridSize),
    axes(gridSize, false),
    nodesObj(settings, derivedNodes, derivedDisplayScale),
    elementsObj(mesh, settings, derivedNodes),
    supportsObj(structure, settings, derivedNodes, derivedDisplayScale),
    loadsObj(structure, settings, derivedNodes, derivedDisplayScale),
  );

  // Title
  if (title) {
    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);color:' + (isLight() ? '#222' : '#eee') + ';font-weight:bold;font-size:14px;font-family:inherit;pointer-events:none;';
    titleDiv.textContent = title;
    container.appendChild(titleDiv);
  }

  // Render loop
  function render() { renderer.render(scene, camera); }
  controls.addEventListener('change', render);
  render();

  return container;
}
