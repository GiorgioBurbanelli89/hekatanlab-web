import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: '/hekatanlab-web/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 4700,
  },
});
