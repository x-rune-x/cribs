import { getRouterParam } from "h3";
import { useDb } from "../../../db/client";
import { enableAssist } from "../../../services/games";
import { defineApiHandler } from "../../../utils/api";
import { requireUserId } from "../../../utils/auth";

export default defineApiHandler(async (event) => enableAssist(useDb(), await requireUserId(event), getRouterParam(event, "id")!));
