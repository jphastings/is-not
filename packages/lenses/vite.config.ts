import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    platform: 'neutral',
    external: ['node:fs/promises', 'node:url'],
    clean: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
