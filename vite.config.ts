import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    // Prose, vendored lexicons and tool state are not source.
    ignorePatterns: [
      '**/*.md',
      // Agent worktrees are whole copies of the repo: every pattern below would
      // need a twin to reach inside one, and none of it is this checkout's source.
      '.claude/worktrees/**',
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
