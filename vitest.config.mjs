import { configDefaults, defineConfig } from 'vitest/config';

export const LOCAL_OUTPUT_EXCLUDES = [
  '.trae/**',
  '.superpowers/**',
  'artifacts/**',
  'coverage/**',
  'dist/**',
  'miniprogram_npm/**',
];

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ...LOCAL_OUTPUT_EXCLUDES],
  },
});
