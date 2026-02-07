import js from "@eslint/js";
import globals from "globals";
import solid from "eslint-plugin-solid";
import tseslint from "typescript-eslint";

const TS_FILES = [
  "packages/ui/src/**/*.{ts,tsx}",
  "packages/electron-app/electron/**/*.{ts,tsx}",
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/release/**",
      "packages/tauri-app/target/**",
      "packages/**/public/**",
    ],
  },
  {
    files: TS_FILES,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-console": "off",

      // Low-churn defaults: avoid forcing refactors across existing code.
      "prefer-const": "off",
      "no-extra-boolean-cast": "off",
      "no-useless-escape": "off",
      "no-control-regex": "off",
      "no-case-declarations": "off",

      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
    },
  },
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    extends: [solid.configs["flat/recommended"]],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: {
      // Low-churn: Solid's strictness is great, but too noisy for a first pass.
      "solid/reactivity": "off",
      "solid/style-prop": "off",
      "solid/components-return-once": "off",
      "solid/prefer-for": "off",
      "solid/no-destructure": "off",
      "solid/no-innerhtml": "warn",
    },
  },
  {
    files: ["packages/electron-app/electron/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
  },
);
