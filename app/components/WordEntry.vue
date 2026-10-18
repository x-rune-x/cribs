<script setup lang="ts">
import { computed, ref } from "vue";
import { MIN_CRIB_LENGTH } from "#engine";

const props = defineProps<{
  selected: string | null;
  tried: readonly string[];
  maxLength: number;
  disabled: boolean;
}>();

const emit = defineEmits<{ select: [word: string] }>();

const text = ref("");
const word = computed(() => text.value.toUpperCase().replace(/[^A-Z]/g, ""));
const problem = computed(() => {
  if (word.value.length === 0) return null;
  if (word.value.length < MIN_CRIB_LENGTH) return `Words need at least ${MIN_CRIB_LENGTH} letters.`;
  if (word.value.length > props.maxLength) return "That's longer than the message.";
  return null;
});

function tryWord() {
  if (!word.value || problem.value) return;
  emit("select", word.value);
  text.value = "";
}
</script>

<template>
  <section class="entry" aria-labelledby="entry-title">
    <h2 id="entry-title" class="kicker">Your own words</h2>
    <form class="row" @submit.prevent="tryWord">
      <label class="visually-hidden" for="word-input">A word you think is in the message</label>
      <input
        id="word-input"
        v-model="text"
        class="mono"
        type="text"
        inputmode="text"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        placeholder="Type a word"
        :maxlength="maxLength"
        :disabled="disabled"
      />
      <button type="submit" class="btn" :disabled="disabled || !word || !!problem">Slide it</button>
    </form>
    <p class="note muted" :class="{ problem }">{{ problem ?? "Look at the shape of the message, guess a word, then slide it along." }}</p>
    <div v-if="tried.length" class="tried" aria-label="Words you've tried">
      <button
        v-for="w in tried"
        :key="w"
        type="button"
        class="word mono"
        :class="{ active: selected === w }"
        :aria-pressed="selected === w"
        :disabled="disabled"
        data-game-keys
        @click="emit('select', w)"
      >
        {{ w }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.entry {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

input {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--raised);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

input::placeholder {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  color: var(--faint);
}

.note {
  font-size: 13px;
}

.note.problem {
  color: var(--amber);
}

.tried {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.word {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 14px;
  cursor: pointer;
}

.word.active {
  border: 2px solid var(--amber);
  color: var(--amber);
}
</style>
