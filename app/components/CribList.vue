<script setup lang="ts">
import type { Placement } from "#engine";

const props = defineProps<{
  cribs: readonly string[];
  locked: readonly Placement[];
  selected: string | null;
  disabled: boolean;
  /** Blind mode: cribs the player has placed (unchecked). They can still be picked up and moved. */
  placed?: readonly string[];
  /** One of the words isn't in the message. */
  decoy?: boolean;
}>();

const emit = defineEmits<{ select: [crib: string] }>();

const lockedAt = (crib: string) => props.locked.find((p) => p.crib === crib);
const isPlaced = (crib: string) => props.placed?.includes(crib) ?? false;
const label = (crib: string) => {
  const locked = lockedAt(crib);
  if (locked) return `${crib}, locked at ${locked.pos + 1}`;
  return isPlaced(crib) ? `${crib}, placed` : undefined;
};
</script>

<template>
  <section class="words" aria-labelledby="words-title">
    <h2 id="words-title" class="kicker">{{ decoy ? "Words: one isn't in the message" : "Words in this message" }}</h2>
    <div class="grid">
      <button
        v-for="crib in cribs"
        :key="crib"
        type="button"
        class="word mono"
        :class="{ locked: lockedAt(crib), placed: isPlaced(crib), active: selected === crib }"
        :aria-pressed="selected === crib"
        :aria-label="label(crib)"
        :disabled="!!lockedAt(crib) || disabled"
        data-game-keys
        @click="emit('select', crib)"
      >
        <svg v-if="lockedAt(crib)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        {{ crib }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.words {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
}

.word {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
}

.word.active {
  border: 2px solid var(--amber);
  color: var(--amber);
}

.word.placed {
  border-style: dashed;
  border-color: var(--muted);
}

.word.locked {
  border-color: var(--locked-border);
  background: var(--locked-fill);
  color: var(--locked-text);
  cursor: default;
  opacity: 1;
}

.word:disabled:not(.locked) {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
