import { describe, it, expect } from 'vitest';
import { createEngine } from '../src/engine';
import { TEMPLATES } from '../src/templates';

const NAMES = ['Awatif — Truss Paramétrico', 'Awatif — Estructura 3D'];

describe('Awatif templates', () => {
  for (const name of NAMES) {
    it(`${name} — no errors`, async () => {
      const tmpl = TEMPLATES.find(t => t.name === name)!;
      const engine = createEngine();
      const results = await engine.evaluate(tmpl.code);
      const errors = results.filter(r => r.type === 'error');
      if (errors.length > 0) {
        for (const e of errors.slice(0, 5)) {
          console.log(`  L${e.line}: ${e.error}`);
        }
      }
      expect(errors.length).toBe(0);
    }, 20000);
  }
});
