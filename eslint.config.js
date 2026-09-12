import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Build output, vendored shadcn primitives, and generated Supabase artifacts.
    // These are not hand-maintained, so linting them only produces noise.
    ignores: [
      "dist",
      "coverage",
      "src/components/ui/**",
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
    ],
  },

  // ---- Frontend: browser + React ----
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Tracked as debt with a shrinking budget rather than ignored outright —
      // `npm run lint:budget` fails if the count grows. See CONTRIBUTING.md.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ---- Edge functions: Deno, not a browser ----
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.deno,
        Deno: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      // Deno resolves remote URL imports; the TS resolver here cannot.
      "import/no-unresolved": "off",
    },
  },

  // ---- Build / tooling config at the repo root ----
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["*.{ts,js}", "*.config.{ts,js}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
