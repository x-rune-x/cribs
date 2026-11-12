// A spoiler-free summary of a finished game, for pasting into a chat.

import type { GameView } from "./types/api";

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Says how the game went without giving anything away: the puzzle, the outcome,
 * the counts, and one mark per move (🟩 right, 🟥 mistake, 💡 hint).
 */
export function resultsText(game: GameView): string {
  const p = game.puzzle;
  const number = `No. ${String(p.number).padStart(3, "0")}`;
  const difficulty = p.difficulty[0]!.toUpperCase() + p.difficulty.slice(1);
  const title =
    p.kind === "lab"
      ? `Crib Lab ${number} · ${p.label ?? "Experimental"}`
      : `Crib ${p.kind === "daily" ? "daily" : "practice"} ${number} · ${difficulty}`;

  const blind = p.variant.feedback === "blind";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const outcome =
    game.status === "won" ? (blind ? "Solved" : `Solved in ${plural(game.moves, "move")} (par ${p.par})`) : "Out of mistakes";
  const lines = [title, `${outcome} · ${plural(game.mistakes, "mistake")} · ${plural(game.hints, "hint")}`];
  if (game.finished) lines.push(`Score ${game.finished.score} · ${formatDuration(game.finished.durationMs)}`);
  const trail = game.log.map((entry) => (entry.correct === null ? "💡" : entry.correct ? "🟩" : "🟥")).join("");
  if (trail) lines.push(trail);
  return lines.join("\n");
}
