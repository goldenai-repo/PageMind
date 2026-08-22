import path from "path";
import type { ViteUserConfig } from "vitest/config";

export default {
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
} satisfies ViteUserConfig;
