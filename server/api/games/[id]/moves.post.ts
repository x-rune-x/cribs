import { getRouterParam, readBody } from "h3";
import { useDb } from "../../../db/client";
import { playMove } from "../../../services/games";
import { defineApiHandler, enforceRateLimit } from "../../../utils/api";
import { requireUserId } from "../../../utils/auth";

// Validates the move with the engine, records it with the server's timestamp,
// and returns the result with the updated game.
export default defineApiHandler(async (event) => {
  const userId = await requireUserId(event);
  enforceRateLimit(event, `moves:${userId}`, 30, 60_000);
  return playMove(useDb(), userId, getRouterParam(event, "id")!, await readBody(event), Date.now());
});
