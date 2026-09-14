import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    // web/ keeps SvelteKit's tab convention (`pnpm --filter web check`); the rest
    // is prose, vendored lexicons or tool state, not source.
    ignorePatterns: [
      'web/**',
      '**/*.md',
      '.beans/**',
      '.beans.yml',
      '.changeset/**',
      '.github/**',
      'lexicons/**',
      'packages/lenses/lexicons/**',
    ],
  },
  lint: { plugins: ['typescript'] },
});
