import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '*.visual.ts',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:4700',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --port 4700',
    port: 4700,
    reuseExistingServer: true,
    timeout: 30000,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05, // 5% tolerance for anti-aliasing
    },
  },
});
