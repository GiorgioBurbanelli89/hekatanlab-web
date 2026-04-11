/**
 * Elasto-Plastic Material Models
 * Converted from Owen & Hinton "Finite Elements in Plasticity" (1980)
 * Chapter 7: Elasto-Plastic Problems
 *
 * Yield criteria: Tresca, Von Mises, Mohr-Coulomb, Drucker-Prager
 * Flow rule: associated (a = ∂F/∂σ)
 * Hardening: isotropic (σ_y = σ_y0 + H'·ε_p_eff)
 */

// ═══════════════════════════════════════════════════════════════
// Yield Criteria (Owen §7.4, Table 7.2)
// ═══════════════════════════════════════════════════════════════

export enum YieldCriterion {
  TRESCA = 1,
  VON_MISES = 2,
  MOHR_COULOMB = 3,
  DRUCKER_PRAGER = 4,
}

export interface MaterialProps {
  E: number;          // Young's modulus
  nu: number;         // Poisson's ratio
  sigma_y: number;    // Yield stress
  H_prime: number;    // Hardening modulus (slope of σ vs ε_p curve)
  phi_deg?: number;   // Friction angle (degrees) — for MC/DP
}

export interface StressState {
  sigma: number[];    // [σ_x, σ_y, τ_xy, σ_z] stress components
  devia: number[];    // deviatoric stress
  smean: number;      // mean stress
  J2: number;         // second deviatoric invariant
  J3: number;         // third deviatoric invariant
  sigma_eff: number;  // effective stress √J2
  theta: number;      // Lode angle
  sin3theta: number;
  yield: number;      // yield function value
}

// ═══════════════════════════════════════════════════════════════
// INVAR — Stress invariants (Owen §7.8A, lines 11440-11496)
// Computes J2', J3', effective stress, Lode angle, yield function
// ═══════════════════════════════════════════════════════════════
export function stressInvariants(
  sigma: number[],
  criterion: YieldCriterion,
  mat: MaterialProps
): StressState {
  const ROOT3 = Math.sqrt(3);

  // Mean stress (Eq 7.7)
  const smean = (sigma[0] + sigma[1] + (sigma[3] || 0)) / 3.0;

  // Deviatoric stress
  const devia = [
    sigma[0] - smean,  // s_x
    sigma[1] - smean,  // s_y
    sigma[2],           // τ_xy (deviatoric shear = total shear)
    (sigma[3] || 0) - smean, // s_z
  ];

  // J2' = ½ s_ij s_ij (Eq 7.8)
  const J2 = devia[2] * devia[2] +
    0.5 * (devia[0] * devia[0] + devia[1] * devia[1] + devia[3] * devia[3]);

  // J3' (Eq 7.9)
  const J3 = devia[0] * (devia[1] * devia[3] - 0) - 0 + 0;
  // Simplified for 2D: J3' = s_x*s_y*s_z - s_z*τ_xy² (approx)
  // Actually Owen uses: J3 = s_x*(s_y*s_z - J2) which is different
  // For plane stress (s_z = -(s_x+s_y)):
  const J3_owen = devia[0] * (devia[1] * devia[3] - J2);

  // Effective stress σ_eff = √J2
  const sigma_eff = Math.sqrt(Math.max(0, J2));

  // sin(3θ) = -3√3·J3' / (2·J2·σ_eff) (Eq 7.61)
  let sin3theta = 0;
  if (sigma_eff > 1e-20) {
    sin3theta = -3.0 * ROOT3 * J3_owen / (2.0 * J2 * sigma_eff);
    sin3theta = Math.max(-1, Math.min(1, sin3theta));
  }
  const theta = Math.asin(sin3theta) / 3.0;

  // Yield function value (Table 7.2, Column 3)
  let yieldVal = 0;
  switch (criterion) {
    case YieldCriterion.TRESCA:
      // F = 2·cos(θ)·σ_eff - σ_y
      yieldVal = 2.0 * Math.cos(theta) * sigma_eff;
      break;
    case YieldCriterion.VON_MISES:
      // F = √3·σ_eff - σ_y = √(3·J2) - σ_y
      yieldVal = ROOT3 * sigma_eff;
      break;
    case YieldCriterion.MOHR_COULOMB: {
      const phi_rad = (mat.phi_deg || 30) * Math.PI / 180;
      const snphi = Math.sin(phi_rad);
      // F = σ_mean·sin(φ) + σ_eff·(cos(θ) - sin(θ)·sin(φ)/√3) - c·cos(φ)
      yieldVal = smean * snphi + sigma_eff * (Math.cos(theta) - Math.sin(theta) * snphi / ROOT3);
      break;
    }
    case YieldCriterion.DRUCKER_PRAGER: {
      const phi_rad = (mat.phi_deg || 30) * Math.PI / 180;
      const snphi = Math.sin(phi_rad);
      // F = 6·σ_mean·sin(φ) / (√3·(3-sin(φ))) + σ_eff - k
      yieldVal = 6.0 * smean * snphi / (ROOT3 * (3.0 - snphi)) + sigma_eff;
      break;
    }
  }

  return { sigma, devia, smean, J2, J3: J3_owen, sigma_eff, theta, sin3theta, yield: yieldVal };
}

// ═══════════════════════════════════════════════════════════════
// YIELDF — Flow vector a = ∂F/∂σ (Owen §7.8A.1, lines 11581+)
// a = C1·a1 + C2·a2 + C3·a3 (Eq 7.74)
// ═══════════════════════════════════════════════════════════════
export function flowVector(
  state: StressState,
  criterion: YieldCriterion,
  mat: MaterialProps
): number[] {
  const ROOT3 = Math.sqrt(3);
  const { devia, sigma_eff, theta, sin3theta } = state;

  // Base vectors (Eq 7.75 for 2D):
  // a1 = ∂J2'/∂σ = deviatoric stress direction
  // a2 = ∂(σ_mean)/∂σ = [1/3, 1/3, 0, 1/3]
  // a3 = complex (involves ∂J3'/∂σ)

  if (sigma_eff < 1e-20) return [0, 0, 0, 0];

  const a1 = [devia[0], devia[1], 2 * devia[2], devia[3]]; // ∂J2/∂σ
  const a2 = [1 / 3, 1 / 3, 0, 1 / 3];

  let C1 = 0, C2 = 0;

  switch (criterion) {
    case YieldCriterion.TRESCA:
      C1 = Math.cos(theta) / sigma_eff;
      // Simplified — full Tresca needs C3 for corner treatment
      break;
    case YieldCriterion.VON_MISES:
      // F = √3·σ_eff → a = √3/(2·σ_eff)·s = √3·a1/(2·σ_eff)
      C1 = ROOT3 / (2 * sigma_eff);
      C2 = 0;
      break;
    case YieldCriterion.MOHR_COULOMB: {
      const phi_rad = (mat.phi_deg || 30) * Math.PI / 180;
      const snphi = Math.sin(phi_rad);
      C1 = (Math.cos(theta) - Math.sin(theta) * snphi / ROOT3) / (2 * sigma_eff);
      C2 = snphi;
      break;
    }
    case YieldCriterion.DRUCKER_PRAGER: {
      const phi_rad = (mat.phi_deg || 30) * Math.PI / 180;
      const snphi = Math.sin(phi_rad);
      C1 = 1 / (2 * sigma_eff);
      C2 = 6 * snphi / (ROOT3 * (3 - snphi));
      break;
    }
  }

  const a = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    a[i] = C1 * a1[i] + C2 * a2[i];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════
// Elasto-Plastic D matrix (Owen Eq 7.47)
// D_ep = D - D·a·a'·D / (H' + a'·D·a)
// ═══════════════════════════════════════════════════════════════
export function elastoplasticDmatrix(
  D: number[][],
  a: number[],
  H_prime: number
): number[][] {
  const n = D.length;

  // Da = D·a
  const Da = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      Da[i] += D[i][j] * a[j];
    }
  }

  // a'·D·a = a'·Da
  let aDa = 0;
  for (let i = 0; i < n; i++) aDa += a[i] * Da[i];

  // denominator
  const denom = H_prime + aDa;
  if (Math.abs(denom) < 1e-30) return D; // no correction if denominator ~0

  // D_ep = D - Da·Da' / denom
  const Dep: number[][] = [];
  for (let i = 0; i < n; i++) {
    Dep.push([...D[i]]);
    for (let j = 0; j < n; j++) {
      Dep[i][j] -= Da[i] * Da[j] / denom;
    }
  }

  return Dep;
}

// ═══════════════════════════════════════════════════════════════
// Plane stress D-matrix (Owen §6.4.9 MODPS)
// ═══════════════════════════════════════════════════════════════
export function planeStressD(E: number, nu: number): number[][] {
  const c = E / (1 - nu * nu);
  return [
    [c, c * nu, 0, 0],
    [c * nu, c, 0, 0],
    [0, 0, c * (1 - nu) / 2, 0],
    [0, 0, 0, 0],
  ];
}

// ═══════════════════════════════════════════════════════════════
// Plate bending D-matrices (Owen §6.4.10 MODPB)
// Returns {Dflex, Dsher} for Mindlin plate bending
// ═══════════════════════════════════════════════════════════════
export function plateBendingD(E: number, nu: number, t: number, kappa: number): {
  Dflex: number[][];
  Dsher: number[][];
} {
  const Dc = E * t * t * t / (12 * (1 - nu * nu));
  const Dflex = [
    [Dc, Dc * nu, 0],
    [Dc * nu, Dc, 0],
    [0, 0, Dc * (1 - nu) / 2],
  ];
  // Owen: DSHER(1,1) = E*t / (2.4 + 2.4*nu) = κ*G*t where κ=5/6
  const Sc = kappa * E * t / (2 * (1 + nu));
  const Dsher = [[Sc, 0], [0, Sc]];
  return { Dflex, Dsher };
}
