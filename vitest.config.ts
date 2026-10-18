import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The same aliases Nuxt sets up, so server code can be tested without Nuxt.
    alias: {
      "#engine": fileURLToPath(new URL("./src/engine/index.ts", import.meta.url)),
      "#shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "server/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
