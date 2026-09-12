import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // `json-summary` is what the CI test-health report reads.
      reporter: ["text", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/components/ui/**",
        "src/integrations/supabase/types.ts",
        "src/integrations/supabase/previewAuthStorage.ts",
        "src/test/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "**/*.d.ts",
      ],
      // No thresholds yet. The suite is a placeholder, so a gate here would
      // fail every run and teach everyone to ignore it. Thresholds get turned
      // on in the same PR that lands the first real tests — see CONTRIBUTING.md.
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
