<script setup lang="ts">
import { computed, ref } from "vue";
import { type Letter, type Pair, type SwapMap, LETTERS } from "#engine";

const props = defineProps<{
  known: SwapMap;
  knownPairs: Pair[];
  previewPairs: Pair[];
  pencilPairs: Pair[];
  ciphertext: string;
  playing: boolean;
  busy: boolean;
  /** Blind mode: declared swaps stay unchecked until the player submits. */
  blind?: boolean;
}>();

const emit = defineEmits<{ declare: [a: Letter, b: Letter]; pencil: [a: Letter, b: Letter]; unpencil: [letter: Letter] }>();

const open = ref(false);
const first = ref<Letter>("A");
const second = ref<Letter>("B");

const problem = computed(() => {
  const a = first.value;
  const b = second.value;
  if (a === b) return "A letter can't swap with itself.";
  if (!props.ciphertext.includes(a) && !props.ciphertext.includes(b)) return `Neither ${a} nor ${b} is in the message.`;
  if (props.known[a] === b) return `${a}⇄${b} is already found.`;
  return null;
});

function openForm() {
  // Start from the first message letter that isn't decrypted yet.
  const unknown = [...props.ciphertext].find((ch) => !props.known[ch as Letter]) as Letter | undefined;
  if (unknown) first.value = unknown;
  open.value = true;
}
</script>

<template>
  <section class="swaps" aria-labelledby="swaps-title">
    <div class="heading">
      <h2 id="swaps-title" class="kicker">Swaps · {{ knownPairs.length }} of 13 found</h2>
      <button v-if="playing && !open" type="button" class="toggle" @click="openForm">Declare or pencil</button>
    </div>
    <ul v-if="knownPairs.length || previewPairs.length" class="chips" aria-label="Swaps">
      <li v-for="p in knownPairs" :key="`k${p.join('')}`" class="chip found">{{ p[0] }} ⇄ {{ p[1] }}</li>
      <li v-for="p in previewPairs" :key="`p${p.join('')}`" class="chip trying">
        <span class="visually-hidden">Trying </span>{{ p[0] }} ⇄ {{ p[1] }}
      </li>
    </ul>
    <p v-else class="empty muted">None yet. Lock a word to find its swaps.</p>

    <ul v-if="pencilPairs.length" class="chips" aria-label="Pencil notes">
      <li v-for="p in pencilPairs" :key="`n${p.join('')}`">
        <button type="button" class="chip pencil" :aria-label="`Remove note ${p[0]}⇄${p[1]}`" @click="emit('unpencil', p[0])">
          <span aria-hidden="true">✎</span> {{ p[0] }} ⇄ {{ p[1] }} <span aria-hidden="true">×</span>
        </button>
      </li>
    </ul>

    <template v-if="playing && open">
      <form class="form panel" @submit.prevent>
        <div class="pickers">
          <label>
            <span class="muted">Letter</span>
            <select v-model="first" class="mono">
              <option v-for="l in LETTERS" :key="l" :value="l">{{ l }}</option>
            </select>
          </label>
          <span class="arrow mono" aria-hidden="true">⇄</span>
          <label>
            <span class="muted">Partner</span>
            <select v-model="second" class="mono">
              <option v-for="l in LETTERS" :key="l" :value="l">{{ l }}</option>
            </select>
          </label>
        </div>
        <p class="note muted">
          {{
            problem ??
            (blind
              ? "Pencil notes are free. Declared swaps go on the board unchecked until you submit."
              : "Pencil notes are free. A declared swap counts as a move, and a wrong one is a mistake.")
          }}
        </p>
        <div class="buttons">
          <button type="button" class="btn" :disabled="first === second" @click="emit('pencil', first, second)">Pencil in</button>
          <button type="button" class="btn btn-primary" :disabled="!!problem || busy" @click="emit('declare', first, second)">
            Declare {{ first }}⇄{{ second }}
          </button>
          <button type="button" class="btn" @click="open = false">Close</button>
        </div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.swaps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chips {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 600;
}

.chip {
  padding: 6px 10px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.chip.found {
  background: var(--locked-fill);
  color: var(--locked-text);
}

.chip.trying {
  padding: 5px 9px;
  border: 1px dashed var(--amber);
  color: var(--amber);
}

.chip.pencil {
  min-height: 44px;
  border: 1px dotted var(--faint);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-style: italic;
  cursor: pointer;
}

.empty {
  font-size: 14px;
}

.heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin: -8px 0 -6px;
}

.toggle {
  min-height: 44px;
  padding: 0 4px;
  border: none;
  background: none;
  color: var(--locked-line);
  font-size: 14px;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pickers {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.pickers label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.pickers select {
  min-height: 44px;
  min-width: 72px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--raised);
  font-size: 16px;
  font-weight: 600;
}

.arrow {
  font-size: 18px;
  padding-bottom: 10px;
}

.note {
  font-size: 13px;
  line-height: 1.35;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
