module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'import'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'test/**', 'test-main/**'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    "@typescript-eslint/no-namespace": "off",
    // Enforce absolute imports using src/* path alias for cross-boundary imports
    'import/no-restricted-paths': [
      'warn',
      {
        zones: [
          // Prevent cross-module relative imports from auth to other modules
          {
            target: './src/auth',
            from: './src/user',
            message: 'Use absolute imports: import { ... } from "src/user/..."',
          },
          {
            target: './src/auth',
            from: './src/audit',
            message: 'Use absolute imports: import { ... } from "src/audit/..."',
          },
          {
            target: './src/auth',
            from: './src/portfolio',
            message: 'Use absolute imports: import { ... } from "src/portfolio/..."',
          },
          {
            target: './src/auth',
            from: './src/defi',
            message: 'Use absolute imports: import { ... } from "src/defi/..."',
          },
          {
            target: './src/auth',
            from: './src/oracle',
            message: 'Use absolute imports: import { ... } from "src/oracle/..."',
          },
          // Prevent cross-module relative imports from user
          {
            target: './src/user',
            from: './src/auth',
            message: 'Use absolute imports: import { ... } from "src/auth/..."',
          },
          {
            target: './src/user',
            from: './src/audit',
            message: 'Use absolute imports: import { ... } from "src/audit/..."',
          },
          {
            target: './src/user',
            from: './src/portfolio',
            message: 'Use absolute imports: import { ... } from "src/portfolio/..."',
          },
          {
            target: './src/user',
            from: './src/defi',
            message: 'Use absolute imports: import { ... } from "src/defi/..."',
          },
          {
            target: './src/user',
            from: './src/oracle',
            message: 'Use absolute imports: import { ... } from "src/oracle/..."',
          },
          // Prevent cross-module relative imports from audit
          {
            target: './src/audit',
            from: './src/auth',
            message: 'Use absolute imports: import { ... } from "src/auth/..."',
          },
          {
            target: './src/audit',
            from: './src/user',
            message: 'Use absolute imports: import { ... } from "src/user/..."',
          },
          {
            target: './src/audit',
            from: './src/portfolio',
            message: 'Use absolute imports: import { ... } from "src/portfolio/..."',
          },
          {
            target: './src/audit',
            from: './src/defi',
            message: 'Use absolute imports: import { ... } from "src/defi/..."',
          },
          {
            target: './src/audit',
            from: './src/oracle',
            message: 'Use absolute imports: import { ... } from "src/oracle/..."',
          },
          // Prevent cross-module relative imports from portfolio
          {
            target: './src/portfolio',
            from: './src/auth',
            message: 'Use absolute imports: import { ... } from "src/auth/..."',
          },
          {
            target: './src/portfolio',
            from: './src/user',
            message: 'Use absolute imports: import { ... } from "src/user/..."',
          },
          {
            target: './src/portfolio',
            from: './src/audit',
            message: 'Use absolute imports: import { ... } from "src/audit/..."',
          },
          {
            target: './src/portfolio',
            from: './src/defi',
            message: 'Use absolute imports: import { ... } from "src/defi/..."',
          },
          {
            target: './src/portfolio',
            from: './src/oracle',
            message: 'Use absolute imports: import { ... } from "src/oracle/..."',
          },
          // Prevent cross-module relative imports from defi
          {
            target: './src/defi',
            from: './src/auth',
            message: 'Use absolute imports: import { ... } from "src/auth/..."',
          },
          {
            target: './src/defi',
            from: './src/user',
            message: 'Use absolute imports: import { ... } from "src/user/..."',
          },
          {
            target: './src/defi',
            from: './src/audit',
            message: 'Use absolute imports: import { ... } from "src/audit/..."',
          },
          {
            target: './src/defi',
            from: './src/portfolio',
            message: 'Use absolute imports: import { ... } from "src/portfolio/..."',
          },
          {
            target: './src/defi',
            from: './src/oracle',
            message: 'Use absolute imports: import { ... } from "src/oracle/..."',
          },
          // Prevent cross-module relative imports from oracle
          {
            target: './src/oracle',
            from: './src/auth',
            message: 'Use absolute imports: import { ... } from "src/auth/..."',
          },
          {
            target: './src/oracle',
            from: './src/user',
            message: 'Use absolute imports: import { ... } from "src/user/..."',
          },
          {
            target: './src/oracle',
            from: './src/audit',
            message: 'Use absolute imports: import { ... } from "src/audit/..."',
          },
          {
            target: './src/oracle',
            from: './src/portfolio',
            message: 'Use absolute imports: import { ... } from "src/portfolio/..."',
          },
          {
            target: './src/oracle',
            from: './src/defi',
            message: 'Use absolute imports: import { ... } from "src/defi/..."',
          },
          // Prevent cross-module relative imports from config
          {
            target: './src/config',
            from: './src/auth',
            message: 'Use absolute imports: import { ... } from "src/auth/..."',
          },
          {
            target: './src/config',
            from: './src/user',
            message: 'Use absolute imports: import { ... } from "src/user/..."',
          },
          {
            target: './src/config',
            from: './src/audit',
            message: 'Use absolute imports: import { ... } from "src/audit/..."',
          },
          {
            target: './src/config',
            from: './src/portfolio',
            message: 'Use absolute imports: import { ... } from "src/portfolio/..."',
          },
          {
            target: './src/config',
            from: './src/defi',
            message: 'Use absolute imports: import { ... } from "src/defi/..."',
          },
          {
            target: './src/config',
            from: './src/oracle',
            message: 'Use absolute imports: import { ... } from "src/oracle/..."',
          },
        ],
      },
    ],
  },
};
