# HékatanLab Web

**Calculadora de ingenieria estructural tipo MATLAB que corre en el navegador.**

**MATLAB-like structural engineering calculator in the browser.**

Live: [giorgioburbanelli89.github.io/hekatanlab-web](https://giorgioburbanelli89.github.io/hekatanlab-web/)

Parte del ecosistema **Hekatan** para analisis estructural:
- **HékatanLab Web** (este repo) — Calculadora MATLAB con 90+ templates FEM
- **[Hekatan Struct](https://giorgioburbanelli89.github.io/awatif-workspace/workspace/)** — Plataforma 3D de analisis estructural con C++/WASM

## Autor

**Jorge Burbano** — Ingeniero estructural, Ecuador

- LinkedIn: [jorge-burbano-037444113](https://www.linkedin.com/in/jorge-burbano-037444113/)
- YouTube: [@jorgeburbano9182](https://www.youtube.com/@jorgeburbano9182) — Pronto: tutoriales y ejemplos usando estas herramientas
- GitHub: [GiorgioBurbanelli89](https://github.com/GiorgioBurbanelli89)

## Que es esto?

HékatanLab Web es una calculadora en el navegador que usa sintaxis MATLAB/Octave para resolver problemas de ingenieria estructural. Combina:

- **math.js** parser para algebra matricial, sistemas lineales y matematica simbolica
- **nerdamer** para derivacion, integracion y simplificacion simbolica
- **KaTeX** para renderizado de ecuaciones
- **Three.js** para visualizacion 3D (geometria, deformadas, flechas de carga, contornos)
- **C++/WASM** (Eigen 3.4.0) para solvers sparse grandes (matrices > 50x50)
- **Awatif FEM** engine para analisis de porticos y shells

## Caracteristicas

### Sintaxis MATLAB
```matlab
K = [4, -2; -2, 4]
F = [10; 0]
u = inv(K) * F
```

### Analisis FEM (porticos, cerchas, shells, placas)
```matlab
Uf = fem_deform(nds, els, sups, loads, E, nu, t, A, Iz, Iy, G, J)
show_deformed(nds, els, Uf, 0, 6, "Portal — deformada", supVec, loads)
```

### Matematica Simbolica
```matlab
f = sdiff('x^3 + 2*x', 'x')        % → 3*x^2 + 2
F = sint('3*x^2', 'x')              % → x^3
area = sdefint('x^2', 'x', 0, 1)    % → 1/3
```

### 90+ Templates

| Categoria | Templates | Descripcion |
|-----------|-----------|-------------|
| Herrera Cap 1-4 | 11 | Algebra lineal (vectores, matrices, sistemas) |
| FEM | 10 | Barras, cerchas, porticos, shells |
| Ferreira Cap 2-12 | 6 | MATLAB Codes for FEA (Timoshenko, Q4, Mindlin) |
| Curso FEM | 4 | Curso completo simbolico + numerico |
| Hekatan Struct | 22 | Edificios, puentes, torres, Eiffel, Burj, Opera |
| Awatif | 10 | Zapata asentamiento/flexion, trusses, frames |
| Dinamica | 1 | Beam Impact (Duhamel + superposicion modal) |
| Basico/Plotting | 8 | Operaciones, graficas 2D/3D, control de flujo |
| Buckling | 2 | Pandeo con restriccion discreta/continua |
| Tests | 3 | Validacion vs Logan, CST, Plate 10x10 |

### Elementos FEM disponibles

| Funcion | Elemento | DOF/nodo | Tamano |
|---------|----------|----------|--------|
| `k_truss2d(E, A, L)` | Cercha 2D | 2 | 4x4 |
| `k_frame2d(E, A, I, L)` | Portico 2D | 3 | 6x6 |
| `k_frame3d(E, G, A, Iy, Iz, J, L)` | Portico 3D | 6 | 12x12 |
| `k_cst(E, nu, t, coords)` | Triangulo CST | 2 | 6x6 |
| `k_q4(E, nu, t, coords)` | Q4 plane stress | 2 | 8x8 |
| `k_plate_q4(E, nu, t, kappa, coords)` | Mindlin Q4 (shell thick) | 3 | 12x12 |
| `space_frame_ke(E, G, Iz, Iy, J, A, coord)` | Space frame (Logan) | 6 | 12x12 |

### Solvers

| Funcion | Descripcion |
|---------|-------------|
| `fem_deform(nds, els, sups, loads, ...)` | Solver frame/shell de alto nivel |
| `assemble(Kg, Ke, dofs)` | Ensamblaje en matriz global |
| `solve_fem(Kg, Fv, fixedDofs)` | Resolver con condiciones de borde |
| `modal_solve(Kf, Mf, nModes)` | Analisis modal (eigenvalues) |
| `fem_check(Uf)` | Validar resultados (NaN, singular, excesivos) |

### Visualizacion

| Funcion | Descripcion |
|---------|-------------|
| `show3d(nds, els, title, supVec, loads)` | Geometria 3D con apoyos y flechas de carga |
| `show_deformed(nds, els, Uf, scale, dof, title, supVec, loads)` | Forma deformada |
| `show_deformed_contour(nds, els, Uf, vals, scale, dof, title)` | Contorno de colores |
| `plot(x, y, title)` | Grafica 2D |

## Instalar y ejecutar

```bash
npm install
npm run dev      # → localhost:4700
npm run build    # → dist/
npm test         # → vitest (91 tests)
```

## Deploy a GitHub Pages

```bash
npm run build
npx gh-pages -d dist
```

## Arquitectura

```
src/
  engine.ts       — Parser MATLAB (math.js + nerdamer + funciones custom)
  fem.ts          — Matrices de rigidez (cercha, portico, CST, Q4, placa Mindlin)
  fem/            — Solver hibrido basado en Awatif (deformHybrid.ts)
  renderer.ts     — Renderizado KaTeX
  viewer3d.ts     — Visualizacion 3D Three.js (deformada, contorno, cargas)
  plotter.ts      — Graficas 2D
  templates.ts    — 90+ ejemplos predefinidos
  wasm/           — Solver C++/Eigen WASM (sparse, eigenvalues)
  main.ts         — Punto de entrada UI
```

## Stack tecnologico

- TypeScript + Vite
- math.js 13 (parser, matrices, algebra lineal)
- nerdamer (CAS simbolico)
- KaTeX 0.16 (renderizado matematico)
- Three.js (visualizacion 3D)
- Eigen 3.4.0 via Emscripten (solver sparse WASM)
- Vitest (testing — 91 tests, 90+ templates validados)
- Validado vs OpenSeesPy

## Licencia

MIT
