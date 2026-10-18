import { defineConfig, devices } from "@playwright/test";
import { E2E_ADMIN_TOKEN, E2E_PORT } from "./e2e/env";

// Runs the production build on its own port with a fresh database in data/e2e/.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${E2E_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && node e2e/server.mjs",
    url: `http://localhost:${E2E_PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      PORT: String(E2E_PORT),
      DATABASE_PATH: "data/e2e/crib.db",
      MIGRATIONS_DIR: "server/db/migrations",
      BETTER_AUTH_SECRET: "e2e-only-secret-that-is-long-enough-1234",
      BETTER_AUTH_URL: `http://localhost:${E2E_PORT}`,
      ADMIN_TOKEN: E2E_ADMIN_TOKEN,
    },
  },
});
