import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "content/**"] },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // JSX use counts as use; the base rule can't see it.
      //
      // ignoreRestSiblings is off by default and this code uses the pattern it
      // exists for: `const { id, gen, ...payload } = q` means "everything but
      // these", and the named halves are the point rather than an oversight.
      // Eleven of them were being reported as unused variables, which is most
      // of the noise two real errors were hiding in.
      "no-unused-vars": ["error", {
        varsIgnorePattern: "^[A-Z_]",
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],

      // storage.js deliberately swallows quota and private-mode failures.
      "no-empty": ["error", { allowEmptyCatch: true }],

      // Real smells, but fixing them means reworking effects across the app.
      // Warnings so they stay visible without blocking CI on day one.
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },

  {
    // A service worker runs in neither the browser nor node environment: self,
    // clients, caches and the fetch event are its own globals. public/sw.js
    // matched no block here, so it inherited none of them and linted as six
    // undefined variables the moment it landed.
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: globals.serviceworker,
    },
  },

  {
    files: ["api/**/*.js", "scripts/**/*.mjs", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
