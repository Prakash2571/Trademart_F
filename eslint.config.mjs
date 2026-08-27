/**
 * ESLint configuration (flat config, ESLint 9+).
 *
 * ============================================================================
 * NOT CURRENTLY EXECUTED BY CI. READ THIS BEFORE ASSUMING IT RUNS.
 * ============================================================================
 *
 * The environment this repository was hardened in has no npm registry access, so
 * package-lock.json cannot be regenerated. Adding `eslint` to package.json without a
 * matching lockfile entry would make `npm ci` fail on every install - and `npm ci`
 * failing loudly when the lockfile and package.json disagree is a property worth
 * keeping, not working around.
 *
 * So this file is committed ready to run, and `npm run lint` currently runs
 * tsconfig.lint.json (dead code, control-flow mistakes) plus the repository guards in
 * src/lib/repoGuards.test.ts (the API client boundary, unsafe HTML, credentials in web
 * storage, accessibility basics).
 *
 * TO TURN THIS ON, from a machine with registry access:
 *
 *   npm install -D eslint@^9 @eslint/js typescript-eslint eslint-plugin-react-hooks \
 *                  eslint-plugin-jsx-a11y eslint-config-next@^15
 *   npm pkg set scripts.lint:eslint="eslint ."
 *   # then add `npm run lint:eslint` to the Lint step in .github/workflows/ci.yml
 *
 * Commit the resulting package-lock.json in the same change.
 *
 * WHY NOT `next lint`
 * -------------------
 * It is deprecated in Next 15 and removed in 16, and it hides which rules are active
 * behind a framework command. An explicit config in the repository is reviewable; a
 * framework default is not.
 *
 * The rule choices below are deliberate rather than a preset dump:
 *
 *   no-floating-promises          an unawaited API call swallows its own failure, so a
 *                                 destructive action can silently do nothing
 *   no-explicit-any               `any` on an API response is how a backend contract
 *                                 change becomes a runtime crash in a page component
 *   react-hooks/exhaustive-deps   a stale closure in a data-fetching hook shows an
 *                                 operator yesterday's data with today's controls
 *   jsx-a11y/*                    this is an operator console used with a keyboard
 *   no-restricted-globals fetch   every request must go through lib/api.ts, which is
 *                                 what attaches credentials and the CSRF header
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: ['.next/**', 'dist-test/**', 'node_modules/**', 'next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // --- Promises -------------------------------------------------------
      // The failure mode this catches: a destructive action whose await was dropped
      // reports success immediately and never tells anyone it failed.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // --- Types ----------------------------------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',

      // --- Dead code (also enforced by tsconfig.lint.json) ----------------
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // --- React ----------------------------------------------------------
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // --- Accessibility --------------------------------------------------
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/no-autofocus': 'warn',

      // --- The API client boundary ----------------------------------------
      // Every request must go through lib/api.ts: that is where credentials:'include',
      // the CSRF header, error normalisation and the request id live. A direct fetch
      // gets none of them and looks like it works.
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Use the helpers in @/lib/api. A direct fetch skips credentials, the CSRF header, error normalisation and the request id.',
        },
      ],
    },
  },
  {
    // lib/api.ts is the one place allowed to call fetch - it IS the boundary.
    files: ['src/lib/api.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
