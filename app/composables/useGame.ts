import { computed, ref } from "vue";
import {
  type Hint,
  type Letter,
  type Move,
  type MoveResult,
  type Pair,
  type PreviewCell,
  comparePairs,
  describeHint,
  describePlacementReason,
  describeSwapReason,
  formatPair,
  pair,
  pairsOf,
  preview,
  scanPlacements,
  toMove,
} from "#engine";
import type { GameView, MoveResponse, StartGameRequest } from "#shared/types/api";
import { type ApiError, api, apiError } from "~/utils/api";

export interface Feedback {
  tone: "good" | "bad" | "info";
  text: string;
  hint?: Hint;
}

export interface GridCell {
  cipher: Letter;
  shown: Letter | null;
  source: PreviewCell["source"] | "revealed";
  pencil: Letter | null;
}

/** Client-side play: previews use only public data, and every move goes to the server. */
export function useGame() {
  const game = ref<GameView | null>(null);
  const loadError = ref<ApiError | null>(null);
  const busy = ref(false);
  const selected = ref<string | null>(null);
  const pos = ref(0);
  const feedback = ref<Feedback | null>(null);
  const pencil = ref<Partial<Record<Letter, Letter>>>({});

  const playing = computed(() => game.value?.status === "playing");
  const ciphertext = computed(() => game.value?.puzzle.ciphertext ?? "");
  const lockedCribs = computed(() => new Set(game.value?.locked.map((p) => p.crib)));
  const unlocked = computed(() => game.value?.puzzle.cribs.filter((c) => !lockedCribs.value.has(c)) ?? []);
  const spotCount = computed(() => (selected.value ? ciphertext.value.length - selected.value.length + 1 : 0));
  const assisted = computed(() => game.value?.mode === "assisted");
  const trying = computed(() => (selected.value && playing.value ? { crib: selected.value, pos: pos.value } : null));

  const cells = computed<GridCell[]>(() => {
    const g = game.value;
    if (!g) return [];
    const base: Omit<GridCell, "pencil">[] = trying.value
      ? preview(g, trying.value.crib, trying.value.pos)
      : [...g.puzzle.ciphertext].map((ch, i) => {
          const cipher = ch as Letter;
          const known = g.known[cipher] ?? null;
          if (known) return { cipher, shown: known, source: "known" as const };
          // After a loss, show the rest of the message as revealed rather than found.
          const revealed = g.finished ? (g.finished.plaintext[i] as Letter) : null;
          return { cipher, shown: revealed, source: revealed ? ("revealed" as const) : null };
        });
    return base.map((cell) => ({ ...cell, pencil: cell.source ? null : (pencil.value[cell.cipher] ?? null) }));
  });

  /** Swaps the current preview would add. */
  const previewPairs = computed<Pair[]>(() => {
    const t = trying.value;
    const g = game.value;
    if (!t || !g) return [];
    const pairs = new Map<string, Pair>();
    for (let i = 0; i < t.crib.length; i++) {
      const w = t.crib[i] as Letter;
      const c = g.puzzle.ciphertext[t.pos + i] as Letter;
      if (w !== c && g.known[w] !== c) pairs.set(pair(w, c).join(""), pair(w, c));
    }
    return [...pairs.values()].sort(comparePairs);
  });

  /** Assist mode only: why each position is impossible. */
  const scan = computed(() => {
    const g = game.value;
    if (!assisted.value || !g || !selected.value) return null;
    return scanPlacements(g.puzzle.ciphertext, selected.value, g.known, g.locked);
  });

  const knownPairs = computed(() => (game.value ? pairsOf(game.value.known) : []));
  const pencilPairs = computed(() => pairsOf(pencil.value));

  async function start(request: StartGameRequest) {
    busy.value = true;
    loadError.value = null;
    try {
      game.value = await api<GameView>("/api/games", { method: "POST", body: request });
      selected.value = null;
      feedback.value = null;
      loadPencil();
    } catch (error) {
      loadError.value = apiError(error);
    } finally {
      busy.value = false;
    }
  }

  function select(crib: string) {
    if (!playing.value || lockedCribs.value.has(crib) || selected.value === crib) return;
    selected.value = crib;
    pos.value = 0;
  }

  function cycle(direction: 1 | -1) {
    const list = unlocked.value;
    if (list.length === 0) return;
    const index = selected.value ? list.indexOf(selected.value) : direction === 1 ? -1 : 0;
    select(list[(index + direction + list.length) % list.length]!);
  }

  const cancel = () => {
    selected.value = null;
  };
  const moveTo = (p: number) => {
    if (selected.value) pos.value = Math.max(0, Math.min(spotCount.value - 1, p));
  };
  const slide = (delta: number) => moveTo(pos.value + delta);

  async function submit(move: Move) {
    const g = game.value;
    if (!g || busy.value || !playing.value) return;
    busy.value = true;
    try {
      const response = await api<MoveResponse>(`/api/games/${g.id}/moves`, { method: "POST", body: move });
      game.value = response.game;
      feedback.value = describeResult(move, response.result, response.game);
      if (move.kind === "lock" && response.result.kind === "lock" && response.result.correct) selected.value = null;
      prunePencil();
    } catch (error) {
      feedback.value = { tone: "bad", text: apiError(error).message };
    } finally {
      busy.value = false;
    }
  }

  const lock = () => (selected.value ? submit({ kind: "lock", crib: selected.value, pos: pos.value }) : undefined);
  const declare = (a: Letter, b: Letter) => submit({ kind: "swap", a, b });
  const askHint = () => submit({ kind: "hint" });

  function playHint(hint: Hint) {
    const move = hint.kind === "forced" ? toMove(hint.move) : hint.move;
    if (move.kind === "lock") {
      selected.value = move.crib;
      pos.value = move.pos;
    }
    return submit(move);
  }

  async function enableAssist() {
    const g = game.value;
    if (!g || g.mode !== "practice") return;
    try {
      game.value = await api<GameView>(`/api/games/${g.id}/assist`, { method: "POST" });
    } catch (error) {
      feedback.value = { tone: "bad", text: apiError(error).message };
    }
  }

  // Pencil notes are free and stay in this browser.

  const pencilKey = () => `crib:pencil:${game.value?.id}`;

  function loadPencil() {
    try {
      pencil.value = JSON.parse(localStorage.getItem(pencilKey()) ?? "{}");
    } catch {
      pencil.value = {};
    }
    prunePencil();
  }

  function savePencil(next: Partial<Record<Letter, Letter>>) {
    pencil.value = next;
    try {
      localStorage.setItem(pencilKey(), JSON.stringify(next));
    } catch {
      // Storage may be unavailable; notes then last for this visit only.
    }
  }

  function setPencil(a: Letter, b: Letter) {
    const next = { ...pencil.value };
    for (const letter of [a, b]) {
      const old = next[letter];
      if (old) delete next[old];
    }
    next[a] = b;
    next[b] = a;
    savePencil(next);
  }

  function clearPencil(letter: Letter) {
    const next = { ...pencil.value };
    const partner = next[letter];
    delete next[letter];
    if (partner) delete next[partner];
    savePencil(next);
  }

  function prunePencil() {
    const known = game.value?.known ?? {};
    const next = { ...pencil.value };
    for (const [a, b] of pairsOf(next)) {
      if (known[a] || known[b]) {
        delete next[a];
        delete next[b];
      }
    }
    if (Object.keys(next).length !== Object.keys(pencil.value).length) savePencil(next);
  }

  return {
    game,
    loadError,
    busy,
    selected,
    pos,
    feedback,
    playing,
    unlocked,
    spotCount,
    assisted,
    trying,
    cells,
    previewPairs,
    scan,
    knownPairs,
    pencilPairs,
    start,
    select,
    cycle,
    cancel,
    moveTo,
    slide,
    lock,
    declare,
    askHint,
    playHint,
    enableAssist,
    setPencil,
    clearPencil,
  };
}

function describeResult(move: Move, result: MoveResult, game: GameView): Feedback {
  const tally = `Mistake ${game.mistakes} of ${game.maxMistakes}.`;
  if (result.kind === "hint") return { tone: "info", text: `Cribbot: ${describeHint(result.hint)}`, hint: result.hint };
  if (move.kind === "lock" && result.kind === "lock") {
    const where = `${move.crib} at ${move.pos + 1}`;
    if (result.correct) {
      const swaps = result.revealed.length > 0 ? `New swaps: ${result.revealed.map(formatPair).join(", ")}.` : "No new swaps.";
      return { tone: "good", text: `${move.crib} locked at ${move.pos + 1}. ${swaps}` };
    }
    const [reason] = result.reasons;
    return {
      tone: "bad",
      text: reason ? `${where} is impossible: ${describePlacementReason(reason)}. ${tally}` : `${move.crib} isn't at ${move.pos + 1}. ${tally}`,
    };
  }
  if (move.kind === "swap" && result.kind === "swap") {
    if (result.correct) return { tone: "good", text: `${move.a}⇄${move.b} is right.` };
    const [reason] = result.reasons;
    return {
      tone: "bad",
      text: reason ? `${move.a}⇄${move.b} is impossible: ${describeSwapReason(reason)}. ${tally}` : `${move.a} and ${move.b} don't swap. ${tally}`,
    };
  }
  return { tone: "info", text: "" };
}
