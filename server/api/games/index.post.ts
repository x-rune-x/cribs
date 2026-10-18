import { readBody } from "h3";
import type { StartGameRequest } from "#shared/types/api";
import { useDb } from "../../db/client";
import { badRequest } from "../../services/errors";
import { startDailyGame, startPracticeGame } from "../../services/games";
import { defineApiHandler, enforceRateLimit } from "../../utils/api";
import { requireUserId } from "../../utils/auth";

export default defineApiHandler(async (event) => {
  const userId = await requireUserId(event);
  enforceRateLimit(event, `start:${userId}`, 20, 60_000);
  const body = (await readBody<StartGameRequest>(event)) ?? {};
  const now = Date.now();
  if (body.kind === "daily") return startDailyGame(useDb(), userId, body.localDate, now);
  if (body.kind === "practice") {
    return startPracticeGame(useDb(), userId, body.puzzleId, { localDate: body.localDate, fresh: body.fresh === true }, now);
  }
  throw badRequest("bad-request", "Say which game to start");
});
