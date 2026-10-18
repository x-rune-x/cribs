import { getRouterParam } from "h3";
import { useDb } from "../../db/client";
import { getGame } from "../../services/games";
import { defineApiHandler } from "../../utils/api";
import { requireUserId } from "../../utils/auth";

export default defineApiHandler(async (event) => getGame(useDb(), await requireUserId(event), getRouterParam(event, "id")!));
