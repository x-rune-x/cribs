<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { PracticeItem } from "#shared/types/api";
import { api, apiError } from "~/utils/api";

const props = defineProps<{ endpoint: string; base: string }>();

const items = ref<PracticeItem[] | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    items.value = await api<PracticeItem[]>(props.endpoint);
  } catch (e) {
    error.value = apiError(e).message;
  }
});

const STATUS = { playing: "In progress", won: "Solved", failed: "Failed" } as const;
const capitalise = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function meta(item: PracticeItem): string {
  const parts = item.label ? [item.label] : [capitalise(item.difficulty)];
  if (item.label && item.variant.words === "cribs") parts.push(capitalise(item.difficulty));
  if (item.variant.feedback !== "blind") parts.push(`par ${item.par}`);
  parts.push(`${item.length} letters`);
  return parts.join(" · ");
}
</script>

<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-else-if="!items" class="muted" role="status">Loading…</p>
  <p v-else-if="items.length === 0" class="muted">No puzzles here yet.</p>
  <ul v-else class="list">
    <li v-for="item in items" :key="item.id">
      <NuxtLink :to="`${base}/${item.id}`" class="item">
        <span class="number mono">No. {{ String(item.number).padStart(3, "0") }}</span>
        <span class="meta">{{ meta(item) }}</span>
        <span v-if="item.status" class="status" :class="item.status">{{ STATUS[item.status] }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>

<style scoped>
.list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  min-height: 52px;
  padding: 8px 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 12px;
}

.item:hover {
  background: var(--raised);
  color: var(--text);
}

.number {
  font-weight: 600;
}

.meta {
  flex: 1;
  font-size: 14px;
  color: var(--muted);
}

.status {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--raised);
}

.status.won {
  background: var(--locked-fill);
  color: var(--locked-text);
}

.status.playing {
  color: var(--amber);
}
</style>
