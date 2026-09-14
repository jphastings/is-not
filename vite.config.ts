import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: { singleQuote: true },
  lint: { plugins: ['typescript'] },
});
