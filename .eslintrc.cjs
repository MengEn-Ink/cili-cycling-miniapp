module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2022: true, node: true },
  globals: { wx: 'readonly', App: 'readonly', Page: 'readonly' },
  ignorePatterns: ['dist/'],
  rules: { '@typescript-eslint/no-explicit-any': 'off' },
};
