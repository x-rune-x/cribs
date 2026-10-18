import { timingSafeEqual } from "node:crypto";
import { createError, getRequestHeader, readBody } from "h3";
import type { ImportRequest } from "#shared/types/api";
import { useDb } from "../../db/client";
import { importPuzzles } from "../../services/puzzles";
import { defineApiHandler } from "../../utils/api";

// How puzzles reach the database: `npm run seed` posts generated files here,
// so only the web server ever writes to the database file.
export default defineApiHandler(async (event) => {
  const expected = process.env.ADMIN_TOKEN ?? "";
  const given = (getRequestHeader(event, "authorization") ?? "").replace(/^Bearer /, "");
  const ok = expected.length >= 16 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  return importPuzzles(useDb(), await readBody<ImportRequest>(event), Date.now());
});
