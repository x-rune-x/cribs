import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type DB = ReturnType<typeof createDatabase>;

/**
 * Opens (or creates) the database and brings it up to date. Only the web
 * server calls this for the real database file: scripts go through its API.
 * Pass ":memory:" for a fresh database in tests.
 */
export function createDatabase(file: string, migrationsFolder: string) {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder });
  return db;
}

let instance: DB | undefined;

/** The server's database, opened on first use. */
export function useDb(): DB {
  instance ??= createDatabase(
    process.env.DATABASE_PATH ?? "data/crib.db",
    process.env.MIGRATIONS_DIR ?? "server/db/migrations",
  );
  return instance;
}
