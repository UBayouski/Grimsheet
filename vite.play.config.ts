import { defineConfig } from 'vite';

// Bundles the headless play core (src/play/headless.ts) and everything it imports, including the
// level JSON, into one ESM file in dist-play/, so scripts/play.mjs runs with plain `node`.
// This is tooling only; it is not part of the site build (vite.config.ts) and never ships in dist/.
export default defineConfig({
  build: {
    outDir: 'dist-play',
    emptyOutDir: true,
    lib: {
      entry: 'src/play/headless.ts',
      formats: ['es'],
      fileName: () => 'headless.js',
    },
    target: 'node20',
    minify: false,
    rollupOptions: {
      // Node built-ins stay external; the game and level code is bundled.
      external: [/^node:/],
    },
  },
});
