import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  build: { target: 'es2022' },
  worker: { format: 'es' },
  // harfbuzzjs loads its WASM from the directory of its own script: served unbundled, the file is next to it.
  optimizeDeps: { exclude: ['harfbuzzjs'] },
});
