<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { StartGameRequest } from "#shared/types/api";
import { useGame } from "~/composables/useGame";
import HowToPlay from "./HowToPlay.vue";

const props = defineProps<{ request: StartGameRequest }>();

const g = useGame();
const help = ref<InstanceType<typeof HowToPlay> | null>(null);
const { game, selected, pos, playing, feedback, busy, blind, freeWords, variant } = g;

onMounted(() => {
  g.start(props.request);
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

const kicker = computed(() => {
  const p = game.value?.puzzle;
  if (!p) return "";
  const number = `No. ${String(p.number).padStart(3, "0")}`;
  if (p.kind === "lab") return `Lab · ${number} · ${p.label ?? "Experimental"}`;
  const difficulty = p.difficulty[0]!.toUpperCase() + p.difficulty.slice(1);
  return `${p.kind === "daily" ? "Daily" : "Practice"} · ${number} · ${difficulty} · Par ${p.par}`;
});

/** What's different about a Lab puzzle's rules. */
const notes = computed(() => {
  if (game.value?.puzzle.kind !== "lab") return [];
  const v = variant.value;
  const lines: string[] = [];
  if (v.words === "free") lines.push("No word list: type a word you think is in the message and slide it along.");
  if (v.decoy) lines.push("One of the listed words isn't in the message.");
  if (v.coverage === "partial") lines.push("The words won't reveal every letter. Read what's left and declare the swaps.");
  if (v.feedback === "blind") {
    lines.push("Blind: placements aren't checked. Move and remove them freely, then submit the whole decryption. A wrong submission is a mistake.");
  }
  return lines;
});

const placedCribs = computed(() => g.placed.value.map((p) => p.crib));

/** The main button: lock (or place, in blind mode) the word being slid, or submit a blind decryption. */
const primary = computed(() => {
  if (selected.value) return { label: `${blind.value ? "Place" : "Lock"} ${selected.value} at ${pos.value + 1}`, enabled: true, run: g.lock };
  if (blind.value) {
    const ready = !!g.board.value?.mapping;
    return { label: ready ? "Submit decryption" : "Give every letter a partner to submit", enabled: ready, run: g.submitDecryption };
  }
  return { label: "Pick a word to place", enabled: false, run: g.lock };
});

const mistakePips = computed(() => {
  const view = game.value!;
  return "●".repeat(view.mistakes) + "○".repeat(Math.max(0, view.maxMistakes - view.mistakes));
});

function playAgain() {
  if (props.request.kind === "practice") g.start({ ...props.request, fresh: true });
}

/** Arrow keys slide the word, up and down change word, Enter locks, Escape cancels. */
function onKey(event: KeyboardEvent) {
  if (!playing.value || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, select, textarea, dialog")) return;
  const ours = !target || target === document.body || !!target.closest("[data-game-keys]");
  switch (event.key) {
    case "ArrowLeft":
    case "ArrowRight": {
      const step = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 5 : 1);
      if (selected.value) g.slide(step);
      else g.cycle(1);
      break;
    }
    case "ArrowUp":
    case "ArrowDown":
      g.cycle(event.key === "ArrowDown" ? 1 : -1);
      break;
    case "Home":
      g.moveTo(0);
      break;
    case "End":
      g.moveTo(g.spotCount.value - 1);
      break;
    case "Enter":
      if (!ours || !selected.value) return;
      g.lock();
      break;
    case "Escape":
      if (!selected.value) return;
      g.cancel();
      break;
    default:
      return;
  }
  event.preventDefault();
}
</script>

<template>
  <div class="screen">
    <header class="head">
      <div class="intro">
        <div class="kicker">{{ kicker || "&nbsp;" }}</div>
        <h1>Crib</h1>
        <p class="muted">Letters swap in pairs, and no letter ever becomes itself. Slide known words along the message to find the swaps.</p>
      </div>
      <button type="button" class="help-button" aria-label="How to play" @click="help?.open()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" />
          <path d="M12 17.5h.01" />
        </svg>
      </button>
    </header>

    <ul v-if="notes.length" class="notes panel" aria-label="Lab rules">
      <li v-for="note in notes" :key="note">{{ note }}</li>
    </ul>

    <div v-if="g.loadError.value" class="panel notice" role="alert">
      <template v-if="g.loadError.value.code === 'no-daily'">
        <p>There's no puzzle for today yet.</p>
        <NuxtLink to="/practice" class="btn">Try a practice puzzle</NuxtLink>
      </template>
      <template v-else>
        <p>{{ g.loadError.value.message }}</p>
        <button type="button" class="btn" @click="g.start(request)">Try again</button>
      </template>
    </div>
    <p v-else-if="!game" class="muted" role="status">Intercepting the message…</p>

    <template v-else>
      <MessageGrid :cells="g.cells.value" :locked="game.locked" :placed="blind ? g.placed.value : []" :trying="g.trying.value" />

      <EndSummary v-if="game.finished" :game="game" @again="playAgain" />

      <template v-else>
        <CribSlider
          v-if="selected"
          :crib="selected"
          :pos="pos"
          :count="g.spotCount.value"
          :scan="g.scan.value"
          @move="g.moveTo"
          @step="g.slide"
        />

        <BlindPanel
          v-if="blind && g.board.value"
          :placed="g.placed.value"
          :declared="g.declared.value"
          :board="g.board.value"
          :unassigned="g.unassigned.value"
          @unplace="g.unplace"
          @undeclare="g.undeclare"
        />

        <SwapsPanel
          :known="game.known"
          :blind="blind"
          :known-pairs="g.knownPairs.value"
          :preview-pairs="g.previewPairs.value"
          :pencil-pairs="g.pencilPairs.value"
          :ciphertext="game.puzzle.ciphertext"
          :playing="playing"
          :busy="busy"
          @declare="g.declare"
          @pencil="g.setPencil"
          @unpencil="g.clearPencil"
        />

        <WordEntry
          v-if="freeWords"
          :selected="selected"
          :tried="g.tried.value"
          :max-length="game.puzzle.ciphertext.length"
          :disabled="busy"
          @select="g.select"
        />
        <CribList
          v-else
          :cribs="game.puzzle.cribs"
          :locked="game.locked"
          :placed="placedCribs"
          :decoy="variant.decoy"
          :selected="selected"
          :disabled="busy"
          @select="g.select"
        />

        <label v-if="game.mode !== 'ranked'" class="assist">
          <input type="checkbox" :checked="g.assisted.value" :disabled="g.assisted.value" @change="g.enableAssist()" />
          <span>
            Assist mode
            <small class="muted">Shows which spots are impossible. It stays on for this game.</small>
          </span>
        </label>

        <!-- Kept on screen on phones, so the Lock button and each move's result stay visible. -->
        <div class="dock">
          <p class="status">
            <span v-if="!blind">Moves <strong class="mono">{{ game.moves }}</strong> · par {{ game.puzzle.par }}</span>
            <span>
              Mistakes <span class="pips mono" aria-hidden="true">{{ mistakePips }}</span>
              <span class="visually-hidden">{{ game.mistakes }} of {{ game.maxMistakes }}</span>
            </span>
            <span>Hints <strong class="mono">{{ game.hints }}</strong></span>
          </p>

          <div class="feedback" role="status" aria-live="polite">
            <div v-if="feedback" class="message" :class="feedback.tone">
              <span class="icon" aria-hidden="true">{{ feedback.tone === "good" ? "✓" : feedback.tone === "bad" ? "✗" : "i" }}</span>
              <p>{{ feedback.text }}</p>
              <button v-if="feedback.hint" type="button" class="btn" :disabled="busy" @click="g.playHint(feedback.hint)">Play it</button>
            </div>
          </div>

          <nav class="actions" aria-label="Actions">
            <button v-if="selected" type="button" class="btn" @click="g.cancel">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
              Cancel
            </button>
            <button v-else type="button" class="btn" :disabled="busy" @click="g.askHint">Hint</button>
            <button type="button" class="btn btn-primary" :disabled="!primary.enabled || busy" @click="primary.run">
              {{ primary.label }}
            </button>
          </nav>
        </div>
      </template>
    </template>

    <HowToPlay ref="help" />
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

h1 {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.15;
}

.intro p {
  font-size: 14px;
  line-height: 1.4;
}

.help-button {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  border: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.notes {
  margin: 0;
  padding: 10px 14px 10px 30px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted);
  border-color: var(--amber);
}

.notice {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.assist {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  min-height: 44px;
  cursor: pointer;
}

.assist input {
  width: 20px;
  height: 20px;
  margin: 2px 0 0;
  accent-color: var(--amber);
}

.assist small {
  display: block;
  font-size: 12px;
}

.status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 13px;
  color: var(--muted);
}

.status strong {
  color: var(--text);
}

.pips {
  color: var(--amber);
  letter-spacing: 2px;
}

.feedback:empty {
  display: none;
}

.message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 14px;
  line-height: 1.4;
}

.message p {
  flex: 1;
}

.message.good {
  border-color: var(--locked-border);
}

.message.bad {
  border-color: var(--amber);
}

.icon {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  background: var(--raised);
}

.message.good .icon {
  background: var(--locked-fill);
  color: var(--locked-text);
}

.message.bad .icon {
  background: var(--amber-tint);
  color: var(--amber);
}

.dock {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  padding: 10px 0 calc(8px + env(safe-area-inset-bottom));
  background: linear-gradient(to bottom, transparent, var(--bg) 10px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 8px;
}

.actions .btn {
  min-height: 48px;
}
</style>
