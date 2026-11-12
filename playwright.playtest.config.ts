import { defineConfig, devices } from "@playwright/test";

// Builds the static playtest site (with the golden puzzle as today's daily) and
// serves it the way GitHub Pages does, under /cribs/.
const PORT = 3200;

export default defineConfig({
  testDir: "e2e-playtest",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}/cribs/`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run playtest:build -- --start today --golden && node e2e-playtest/serve.mjs",
    url: `http://localhost:${PORT}/cribs/`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { PORT: String(PORT) },
  },
});
