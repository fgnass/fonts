import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  // Two pages: the app, and the privacy notice at /privacy/.
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', privacy: 'privacy/index.html' } } },
  worker: { format: 'es' },
  // harfbuzzjs loads its WASM from the directory of its own script: served unbundled, the file is next to it.
  optimizeDeps: { exclude: ['harfbuzzjs'] },
});
