import { useDb } from "../db/client";
import { listPractice } from "../services/puzzles";
import { defineApiHandler } from "../utils/api";
import { requireUserId } from "../utils/auth";

export default defineApiHandler(async (event) => listPractice(useDb(), await requireUserId(event)));
