import { useDb } from "../db/client";
import { listPuzzles } from "../services/puzzles";
import { defineApiHandler } from "../utils/api";
import { requireUserId } from "../utils/auth";

export default defineApiHandler(async (event) => listPuzzles(useDb(), await requireUserId(event), "practice"));
