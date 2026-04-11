/**
 * Smoke test: run ALL templates and report errors
 * Categories: numeric, symbolic, graphic, fem
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createEngine } from '../src/engine';
import { TEMPLATES } from '../src/templates';

// Skip templates that need browser-only APIs
const SKIP = [
  'Awatif — Plate (Delaunay shell)',  // needs getMesh WASM
  '📚 Funciones FEM (referencia)',     // reference only
  'Test — Plate 10x10 isotropic',     // too slow for CI
];

const fast = TEMPLATES.filter(t => !SKIP.includes(t.name));

// Classify template by content
function classify(code: string): string[] {
  const tags: string[] = [];
  if (/fem_deform|stiffness|assemble|solve_fem|k_cst|k_q4|k_plate_q4|k_frame|space_frame_ke|modal_solve/.test(code)) tags.push('FEM');
  if (/sdiff|sint|sdefint|ssubs|ssolve|sexpand|sfactor|ssimplify/.test(code)) tags.push('Symbolic');
  if (/show3d|show_deformed|show_contour/.test(code)) tags.push('3D');
  if (/plot\(/.test(code)) tags.push('Plot');
  if (/fem_check/.test(code)) tags.push('Check');
  if (tags.length === 0) tags.push('Numeric');
  return tags;
}

// Collect results for summary
const report: { name: string; cat: string; tags: string[]; status: string; errors: string[] }[] = [];

describe('All templates smoke test', () => {
  for (const tmpl of fast) {
    it(`[${tmpl.category}] ${tmpl.name}`, async () => {
      const engine = createEngine();
      const tags = classify(tmpl.code);
      const t0 = Date.now();
      const results = await engine.evaluate(tmpl.code);
      const dt = Date.now() - t0;
      const errors = results.filter(r => r.type === 'error');
      const errMsgs = errors.slice(0, 5).map(e => `L${e.line}: ${e.error}`);

      report.push({
        name: tmpl.name,
        cat: tmpl.category,
        tags,
        status: errors.length === 0 ? `✅ OK (${dt}ms)` : `⛔ ${errors.length} errors`,
        errors: errMsgs
      });

      if (errors.length > 0) {
        console.log(`\n⛔ [${tmpl.name}] ${errors.length} ERRORS:`);
        for (const msg of errMsgs) console.log(`   ${msg}`);
      }

      expect(errors.length).toBe(0);
    }, 20000);
  }

  afterAll(() => {
    // Print summary table
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  TEMPLATE TEST REPORT');
    console.log('═══════════════════════════════════════════════════════════\n');

    const categories = [...new Set(report.map(r => r.cat))];
    let totalPass = 0, totalFail = 0;

    for (const cat of categories) {
      const items = report.filter(r => r.cat === cat);
      const pass = items.filter(r => r.status.startsWith('✅')).length;
      const fail = items.length - pass;
      totalPass += pass;
      totalFail += fail;

      console.log(`── ${cat} (${pass}/${items.length}) ──`);
      for (const r of items) {
        const tagStr = r.tags.join('+');
        console.log(`  ${r.status}  [${tagStr}]  ${r.name}`);
        for (const e of r.errors) console.log(`         ${e}`);
      }
      console.log('');
    }

    console.log('───────────────────────────────────────────────────────────');
    console.log(`  TOTAL: ${totalPass} passed, ${totalFail} failed, ${report.length} templates`);
    console.log('═══════════════════════════════════════════════════════════\n');
  });
});
