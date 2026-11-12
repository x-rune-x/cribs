import { computed, ref } from "vue";
import {
  type Hint,
  type Letter,
  type Move,
  type MoveResult,
  type Pair,
  type Placement,
  type PreviewCell,
  MIN_CRIB_LENGTH,
  STANDARD_VARIANT,
  blindBoard,
  comparePairs,
  describeHint,
  describePlacementReason,
  describeSwapReason,
  firstClearPosition,
  formatPair,
  pair,
  pairsOf,
  preview,
  scanPlacements,
  toMove,
} from "#engine";
import type { GameView, StartGameRequest } from "#shared/types/api";
import { type ApiError, apiError } from "~/utils/api";
import { useBackend } from "~/utils/backend";

export interface Feedback {
  tone: "good" | "bad" | "info";
  text: string;
  hint?: Hint;
}

export interface GridCell {
  cipher: Letter;
  shown: Letter | null;
  /** "placed" and "clash" are blind mode's unchecked placements. */
  source: PreviewCell["source"] | "revealed" | "placed" | "clash";
  pencil: Letter | null;
}

type LetterMap = Partial<Record<Letter, Letter>>;

/** Client-side play: previews use only public data, and every checked move goes to the server. */
export function useGame() {
  const backend = useBackend();
  const game = ref<GameView | null>(null);
  const loadError = ref<ApiError | null>(null);
  const busy = ref(false);
  const selected = ref<string | null>(null);
  const pos = ref(0);
  const feedback = ref<Feedback | null>(null);
  const pencil = ref<LetterMap>({});
  // Blind mode: the player's own placements and swaps, kept on this device until they submit.
  const placed = ref<Placement[]>([]);
  const declared = ref<Pair[]>([]);
  // Words the player has typed (your-own-words mode), most recent first.
  const tried = ref<string[]>([]);

  const variant = computed(() => game.value?.puzzle.variant ?? STANDARD_VARIANT);
  const blind = computed(() => variant.value.feedback === "blind");
  const freeWords = computed(() => variant.value.words === "free");
  const playing = computed(() => game.value?.status === "playing");
  const ciphertext = computed(() => game.value?.puzzle.ciphertext ?? "");
  const lockedCribs = computed(() => new Set(game.value?.locked.map((p) => p.crib)));
  const unlocked = computed(() => game.value?.puzzle.cribs.filter((c) => !lockedCribs.value.has(c)) ?? []);
  const spotCount = computed(() => (selected.value ? ciphertext.value.length - selected.value.length + 1 : 0));
  const assisted = computed(() => game.value?.mode === "assisted");
  const trying = computed(() => (selected.value && playing.value ? { crib: selected.value, pos: pos.value } : null));

  /** Blind mode: what the player's placements add up to, and where they clash. */
  const board = computed(() => {
    const g = game.value;
    if (!g || !blind.value) return null;
    return blindBoard(g.puzzle.ciphertext, g.known, placed.value, declared.value);
  });

  /** Confirmed swaps, plus blind placements that don't clash: the board a preview builds on. */
  const working = computed<LetterMap>(() => {
    const g = game.value;
    if (!g) return {};
    if (!board.value) return g.known;
    const map: LetterMap = {};
    for (const [letter, partners] of Object.entries(board.value.partners) as [Letter, Letter[]][]) {
      if (partners.length === 1) map[letter] = partners[0]!;
    }
    return map;
  });

  const cells = computed<GridCell[]>(() => {
    const g = game.value;
    if (!g) return [];
    const confirmed = g.known;
    const clashes = new Set(board.value?.clashes ?? []);
    const base: Omit<GridCell, "pencil">[] = trying.value
      ? preview({ puzzle: g.puzzle, known: working.value }, trying.value.crib, trying.value.pos).map((cell) => ({
          ...cell,
          source: cell.source === "known" && !confirmed[cell.cipher] ? ("placed" as const) : cell.source,
        }))
      : [...g.puzzle.ciphertext].map((ch, i) => {
          const cipher = ch as Letter;
          if (confirmed[cipher]) return { cipher, shown: confirmed[cipher]!, source: "known" as const };
          if (clashes.has(cipher)) return { cipher, shown: null, source: "clash" as const };
          const mine = board.value ? working.value[cipher] : undefined;
          if (mine) return { cipher, shown: mine, source: "placed" as const };
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
      if (w !== c && working.value[w] !== c) pairs.set(pair(w, c).join(""), pair(w, c));
    }
    return [...pairs.values()].sort(comparePairs);
  });

  /** Assist mode only: why each position is impossible. */
  const scan = computed(() => {
    const g = game.value;
    if (!assisted.value || !g || !selected.value) return null;
    return scanPlacements(g.puzzle.ciphertext, selected.value, working.value, freeWords.value ? [] : [...g.locked, ...placed.value]);
  });

  const knownPairs = computed(() => (game.value ? pairsOf(game.value.known) : []));
  const pencilPairs = computed(() => pairsOf(pencil.value));
  /** Letters in the message that still need a partner before a blind submission. */
  const unassigned = computed(() => [...new Set(ciphertext.value)].filter((c) => !working.value[c as Letter]).length);

  async function start(request: StartGameRequest) {
    busy.value = true;
    loadError.value = null;
    try {
      game.value = await backend.startGame(request);
      selected.value = null;
      feedback.value = null;
      tried.value = [];
      loadLocal();
    } catch (error) {
      loadError.value = apiError(error);
    } finally {
      busy.value = false;
    }
  }

  /** Picks a word to slide: a listed crib, or (with your own words) any word typed. */
  function select(word: string) {
    const g = game.value;
    if (!g || !playing.value || selected.value === word) return;
    if (freeWords.value) {
      if (!/^[A-Z]+$/.test(word) || word.length < MIN_CRIB_LENGTH || word.length > g.puzzle.ciphertext.length) return;
      tried.value = [word, ...tried.value.filter((w) => w !== word)].slice(0, 8);
    } else if (lockedCribs.value.has(word)) {
      return;
    }
    selected.value = word;
    const mine = blind.value && !freeWords.value ? placed.value.find((p) => p.crib === word) : undefined;
    pos.value = mine ? mine.pos : firstClearPosition(g.puzzle.ciphertext, word, [...g.locked, ...placed.value]);
  }

  function cycle(direction: 1 | -1) {
    const list = freeWords.value ? tried.value : unlocked.value;
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
      const response = await backend.move(g.id, move);
      game.value = response.game;
      feedback.value = describeResult(move, response.result, response.game);
      if (move.kind === "lock" && response.result.kind === "lock" && response.result.correct) selected.value = null;
      if (response.result.kind === "hint" && response.result.revealed.length > 0) dropConfirmedPlacements();
      pruneLocal();
    } catch (error) {
      feedback.value = { tone: "bad", text: apiError(error).message };
    } finally {
      busy.value = false;
    }
  }

  function lock() {
    const word = selected.value;
    if (!word) return;
    if (!blind.value) return submit({ kind: "lock", crib: word, pos: pos.value });
    // Blind mode: place it here without telling the server. It can be moved or removed freely.
    const placement = { crib: word, pos: pos.value };
    const others = placed.value.filter((p) => (freeWords.value ? p.crib !== word || p.pos !== placement.pos : p.crib !== word));
    placed.value = [...others, placement];
    selected.value = null;
    saveLocal();
    feedback.value = { tone: "info", text: `${word} placed at ${placement.pos + 1}. Nothing is checked until you submit.` };
  }

  function unplace(placement: Placement) {
    placed.value = placed.value.filter((p) => p.crib !== placement.crib || p.pos !== placement.pos);
    saveLocal();
  }

  function declare(a: Letter, b: Letter) {
    if (!blind.value) return submit({ kind: "swap", a, b });
    declared.value = [...declared.value.filter(([x, y]) => x !== a && y !== a && x !== b && y !== b), pair(a, b)];
    saveLocal();
    feedback.value = { tone: "info", text: `${a}⇄${b} noted. Nothing is checked until you submit.` };
  }

  function undeclare(p: Pair) {
    declared.value = declared.value.filter((d) => d.join("") !== p.join(""));
    saveLocal();
  }

  const askHint = () => submit({ kind: "hint" });

  function playHint(hint: Hint) {
    const move = hint.kind === "forced" ? toMove(hint.move) : hint.move;
    if (move.kind === "lock") {
      selected.value = move.crib;
      pos.value = move.pos;
    }
    return submit(move);
  }

  /** Blind mode: send the whole decryption to be checked. */
  function submitDecryption() {
    const mapping = board.value?.mapping;
    if (mapping) return submit({ kind: "submit", mapping });
  }

  async function enableAssist() {
    const g = game.value;
    if (!g || g.mode !== "practice") return;
    try {
      game.value = await backend.enableAssist(g.id);
    } catch (error) {
      feedback.value = { tone: "bad", text: apiError(error).message };
    }
  }

  // Pencil notes, blind placements and declared swaps are free and stay in this browser.

  const storageKey = () => `crib:local:${game.value?.id}`;

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) ?? "{}");
      pencil.value = saved.pencil ?? {};
      placed.value = saved.placed ?? [];
      declared.value = saved.declared ?? [];
    } catch {
      pencil.value = {};
      placed.value = [];
      declared.value = [];
    }
    pruneLocal();
  }

  function saveLocal() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ pencil: pencil.value, placed: placed.value, declared: declared.value }));
    } catch {
      // Storage may be unavailable; these then last for this visit only.
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
    pencil.value = next;
    saveLocal();
  }

  function clearPencil(letter: Letter) {
    const next = { ...pencil.value };
    const partner = next[letter];
    delete next[letter];
    if (partner) delete next[partner];
    pencil.value = next;
    saveLocal();
  }

  /** Drops pencil notes for letters that are now confirmed. */
  function pruneLocal() {
    const known = game.value?.known ?? {};
    const next = { ...pencil.value };
    for (const [a, b] of pairsOf(next)) {
      if (known[a] || known[b]) {
        delete next[a];
        delete next[b];
      }
    }
    if (Object.keys(next).length !== Object.keys(pencil.value).length) {
      pencil.value = next;
      saveLocal();
    }
  }

  /** A hint confirmed a word in blind mode: the player's own placement of it is no longer needed. */
  function dropConfirmedPlacements() {
    const confirmed = new Set(game.value?.locked.map((p) => p.crib));
    placed.value = placed.value.filter((p) => freeWords.value || !confirmed.has(p.crib));
    saveLocal();
  }

  return {
    game,
    loadError,
    busy,
    selected,
    pos,
    feedback,
    variant,
    blind,
    freeWords,
    playing,
    unlocked,
    spotCount,
    assisted,
    trying,
    board,
    cells,
    placed,
    declared,
    tried,
    unassigned,
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
    unplace,
    declare,
    undeclare,
    askHint,
    playHint,
    submitDecryption,
    enableAssist,
    setPencil,
    clearPencil,
  };
}

function describeResult(move: Move, result: MoveResult, game: GameView): Feedback {
  const tally = `Mistake ${game.mistakes} of ${game.maxMistakes}.`;
  if (result.kind === "hint") {
    const confirmed = result.revealed.length > 0 ? " Confirmed on the board." : "";
    return { tone: "info", text: `Cribbot: ${describeHint(result.hint)}${confirmed}`, hint: result.revealed.length ? undefined : result.hint };
  }
  if (result.kind === "submit") {
    return result.correct
      ? { tone: "good", text: "That's it: the message is decrypted." }
      : { tone: "bad", text: `That isn't right yet. ${tally}` };
  }
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
