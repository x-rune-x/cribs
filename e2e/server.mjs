// Starts the production server for end-to-end tests with a fresh database.
import { rmSync } from "node:fs";

rmSync("data/e2e", { recursive: true, force: true });
await import("../.output/server/index.mjs");
