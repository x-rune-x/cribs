<script setup lang="ts">
import { computed } from "vue";
import type { BlindBoard, Pair, Placement } from "#engine";

const props = defineProps<{
  placed: readonly Placement[];
  declared: readonly Pair[];
  board: BlindBoard;
  unassigned: number;
}>();

const emit = defineEmits<{ unplace: [placement: Placement]; undeclare: [pair: Pair] }>();

/** The first clash, in words: e.g. "M is paired with both G and U". */
const clash = computed(() => {
  const letter = props.board.clashes[0];
  if (!letter) return null;
  const partners = props.board.partners[letter] ?? [];
  if (partners.length < 2) return `${letter} would be placed over itself`;
  return `${letter} is paired with ${partners.length > 2 ? "several letters" : `both ${partners[0]} and ${partners[1]}`}`;
});
</script>

<template>
  <section class="blind" aria-labelledby="blind-title">
    <h2 id="blind-title" class="kicker">Your placements · unchecked</h2>
    <ul v-if="placed.length || declared.length" class="chips">
      <li v-for="p in placed" :key="`${p.crib}@${p.pos}`">
        <button type="button" class="chip mono" :aria-label="`Remove ${p.crib} from ${p.pos + 1}`" @click="emit('unplace', p)">
          {{ p.crib }} at {{ p.pos + 1 }} <span aria-hidden="true">×</span>
        </button>
      </li>
      <li v-for="d in declared" :key="d.join('')">
        <button type="button" class="chip mono" :aria-label="`Remove ${d[0]}⇄${d[1]}`" @click="emit('undeclare', d)">
          {{ d[0] }} ⇄ {{ d[1] }} <span aria-hidden="true">×</span>
        </button>
      </li>
    </ul>
    <p class="status" :class="{ clash }" role="status">
      <template v-if="clash">
        <span aria-hidden="true">✗</span> Your placements clash: {{ clash }}. Remove one before you submit.
      </template>
      <template v-else-if="board.mapping">Every letter has a partner. Submit when you're ready.</template>
      <template v-else-if="placed.length || declared.length">
        {{ unassigned }} {{ unassigned === 1 ? "letter still needs" : "letters still need" }} a partner before you can submit.
      </template>
      <template v-else>Place words anywhere: nothing is checked until you submit the whole decryption.</template>
    </p>
  </section>
</template>

<style scoped>
.blind {
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
}

.chip {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px dashed var(--muted);
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.chip:hover {
  background: var(--raised);
}

.status {
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted);
}

.status.clash {
  color: var(--amber);
}
</style>
