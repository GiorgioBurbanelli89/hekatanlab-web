import { test, expect } from '@playwright/test';

// Only fast templates with 3D graphics (< 5s execution)
const graphicTemplates = [
  'FEM — Barra axial',
  'FEM — 3 resortes',
  'FEM — Truss 2D (3 barras)',
  'FEM — Ensamblaje con for',
  'FEM — Frame 2D + Diagramas N/V/M',
  'FEM — Space Frame 3D',
  'Awatif — Truss Paramétrico',
  'Awatif — Estructura 3D',
  'Test — Bar (Logan 3.9)',
];

for (const name of graphicTemplates) {
  test(`${name} — graphics render`, async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    await page.waitForSelector('select');
    await page.selectOption('select', { label: name });
    // Wait for execution + render
    await page.waitForTimeout(3000);

    // Canvas must exist
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBeGreaterThan(0);

    // Check no fatal errors in output
    const outputText = await page.locator('#output').innerText();
    const fatalErrors = outputText.split('\n').filter(l =>
      (l.includes('Error:') || l.includes('singular')) &&
      !l.includes('fn for error') && !l.includes('fn eval error')
    );
    expect(fatalErrors).toEqual([]);

    // Scroll to last graphic and snapshot
    await page.evaluate(() => {
      const el = document.querySelector('#output');
      if (el) el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(500);

    const slug = name.replace(/[^a-zA-Z0-9]/g, '_');
    await expect(page.locator('#output')).toHaveScreenshot(`${slug}.png`);
  });
}
