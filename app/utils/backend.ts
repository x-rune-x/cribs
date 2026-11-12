import type { Move } from "#engine";
import type { GameView, MoveResponse, PracticeItem, StartGameRequest } from "#shared/types/api";
import { api } from "./api";

/** Everything the app asks of a backend. */
export interface GameBackend {
  startGame(request: StartGameRequest): Promise<GameView>;
  move(gameId: string, move: Move): Promise<MoveResponse>;
  enableAssist(gameId: string): Promise<GameView>;
  listPuzzles(kind: "practice" | "lab"): Promise<PracticeItem[]>;
}

/** The real backend: the server checks every move and keeps the answers. */
const serverBackend: GameBackend = {
  startGame: (request) => api<GameView>("/api/games", { method: "POST", body: request }),
  move: (gameId, move) => api<MoveResponse>(`/api/games/${gameId}/moves`, { method: "POST", body: move }),
  enableAssist: (gameId) => api<GameView>(`/api/games/${gameId}/assist`, { method: "POST" }),
  listPuzzles: (kind) => api<PracticeItem[]>(kind === "lab" ? "/api/lab" : "/api/practice"),
};

let browserBackend: Promise<GameBackend> | null = null;

/**
 * The backend for this build. The static playtest build (NUXT_PUBLIC_BACKEND=static)
 * plays entirely in the browser, with the answers shipped alongside the puzzles.
 */
export function useBackend(): GameBackend {
  const config = useRuntimeConfig();
  if (config.public.backend !== "static") return serverBackend;
  const baseURL = config.app.baseURL;
  const load = () => (browserBackend ??= import("./browser-backend").then((m) => m.createBrowserBackend(baseURL)));
  return {
    startGame: async (request) => (await load()).startGame(request),
    move: async (gameId, move) => (await load()).move(gameId, move),
    enableAssist: async (gameId) => (await load()).enableAssist(gameId),
    listPuzzles: async (kind) => (await load()).listPuzzles(kind),
  };
}
