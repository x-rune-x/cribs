<script setup lang="ts">
import { computed, ref } from "vue";
import { formatDuration, resultsText } from "#shared/share";
import type { GameView } from "#shared/types/api";

const props = defineProps<{ game: GameView }>();
const emit = defineEmits<{ again: [] }>();

const won = computed(() => props.game.status === "won");
const finished = computed(() => props.game.finished!);
const time = computed(() => formatDuration(finished.value.durationMs));
const versusPar = computed(() => {
  const diff = props.game.moves - props.game.puzzle.par;
  if (!won.value) return `par ${props.game.puzzle.par}`;
  return diff === 0 ? "on par" : diff < 0 ? `${-diff} under par` : `${diff} over par`;
});

/** Spoiler-free results to paste into a chat. Falls back to a text box if the clipboard is unavailable. */
const results = computed(() => resultsText(props.game));
const copy = ref<"idle" | "copied" | "manual">("idle");
async function copyResults() {
  try {
    await navigator.clipboard.writeText(results.value);
    copy.value = "copied";
  } catch {
    copy.value = "manual";
  }
}
</script>

<template>
  <section class="end panel" aria-labelledby="end-title" aria-live="polite">
    <h2 id="end-title" class="title">{{ won ? "Message decrypted" : "Out of mistakes" }}</h2>
    <p v-if="!won" class="muted">Here's what the message said.</p>
    <p class="message mono">{{ finished.text }}</p>
    <dl class="stats">
      <div>
        <dt>Score</dt>
        <dd class="score">{{ finished.score }}</dd>
      </div>
      <div v-if="game.puzzle.variant.feedback !== 'blind'">
        <dt>Moves</dt>
        <dd>{{ game.moves }} <small>{{ versusPar }}</small></dd>
      </div>
      <div>
        <dt>Mistakes</dt>
        <dd>{{ game.mistakes }}</dd>
      </div>
      <div>
        <dt>Hints</dt>
        <dd>{{ game.hints }}</dd>
      </div>
      <div>
        <dt>Time</dt>
        <dd>{{ time }}</dd>
      </div>
    </dl>
    <p v-if="game.mode !== 'ranked'" class="note muted">
      Practice game{{ game.mode === "assisted" ? " with assist" : "" }}: not ranked.
    </p>
    <div class="actions">
      <button type="button" class="btn btn-primary" @click="copyResults">{{ copy === "copied" ? "Copied ✓" : "Copy results" }}</button>
      <NuxtLink v-if="game.mode === 'ranked'" to="/practice" class="btn">Practice puzzles</NuxtLink>
      <template v-else>
        <button type="button" class="btn" @click="emit('again')">Play again</button>
        <NuxtLink :to="game.puzzle.kind === 'lab' ? '/lab' : '/practice'" class="btn">
          {{ game.puzzle.kind === "lab" ? "All Lab puzzles" : "All practice puzzles" }}
        </NuxtLink>
      </template>
    </div>
    <p class="visually-hidden" role="status">{{ copy === "copied" ? "Results copied" : "" }}</p>
    <label v-if="copy === 'manual'" class="manual">
      <span class="muted">Copy these results:</span>
      <textarea readonly rows="4" :value="results" @focus="($event.target as HTMLTextAreaElement).select()" />
    </label>
  </section>
</template>

<style scoped>
.end {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  font-size: 20px;
  font-weight: 600;
}

.message {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.5;
  color: var(--locked-text);
}

.stats {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 10px;
}

.stats div {
  background: var(--raised);
  border-radius: 10px;
  padding: 8px 10px;
}

dt {
  font-size: 12px;
  color: var(--muted);
}

dd {
  margin: 2px 0 0;
  font-family: var(--mono);
  font-size: 18px;
  font-weight: 600;
}

dd small {
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}

.score {
  color: var(--amber);
}

.note {
  font-size: 13px;
}

.manual {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.manual textarea {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--raised);
  font-family: var(--mono);
  font-size: 13px;
  resize: none;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
