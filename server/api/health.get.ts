import { createError, defineEventHandler } from "h3";
import { useDb } from "../db/client";
import { ping } from "../db/queries";

export default defineEventHandler(() => {
  if (!ping(useDb())) throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  return { status: "ok" };
});
