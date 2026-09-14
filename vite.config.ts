import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    // Prose, vendored lexicons and tool state are not source.
    ignorePatterns: [
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
