const fs = require('node:fs');
const path = require('node:path');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const importXPlugin = require('eslint-plugin-import-x');

// Read from disk rather than hardcoding, so a new src/tools/<name>/ folder is fenced off
// automatically without an eslint.config.cjs edit.
const toolNames = fs
  .readdirSync(path.join(__dirname, 'src/tools'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.eslint.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'import-x': importXPlugin,
    },
    settings: {
      // The Node resolver doesn't map NodeNext-style `.js` specifiers back to their `.ts`
      // source files, so no-restricted-paths would silently fail to resolve (and skip) every
      // import in this codebase — the TS resolver understands that mapping.
      'import-x/resolver': {
        typescript: { project: './tsconfig.eslint.json' },
      },
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      // Two-layer architecture (docs/claude/architecture.md): shared/ must stay reusable and
      // unaware of any specific tool; sibling tools must not reach into each other's folders —
      // promote shared logic to shared/ instead.
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/shared', from: './src/tools' },
            ...toolNames.map((name) => ({
              target: `./src/tools/${name}`,
              from: './src/tools',
              except: [`./${name}`],
            })),
          ],
        },
      ],
    },
  },
];
