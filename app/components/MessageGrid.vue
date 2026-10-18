<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { Placement } from "#engine";
import type { GridCell } from "~/composables/useGame";

const props = defineProps<{
  cells: GridCell[];
  locked: readonly Placement[];
  trying: Placement | null;
}>();

const CELL = 28;
const GAP = 4;
const container = ref<HTMLElement | null>(null);
const columns = ref(11);
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? 350;
    columns.value = Math.max(8, Math.min(20, Math.floor((width + GAP) / (CELL + GAP))));
  });
  if (container.value) observer.observe(container.value);
});
onBeforeUnmount(() => observer?.disconnect());

type Span = Placement & { kind: "locked" | "trying" };

const spans = computed<Span[]>(() => [
  ...props.locked.map((p) => ({ ...p, kind: "locked" as const })),
  ...(props.trying ? [{ ...props.trying, kind: "trying" as const }] : []),
]);

/** The span over each position; a preview shows over a locked word it overlaps. */
const spanAt = computed(() => {
  const at: (Span | null)[] = props.cells.map(() => null);
  for (const span of spans.value) {
    for (let i = span.pos; i < span.pos + span.crib.length; i++) {
      if (!at[i] || span.kind === "trying") at[i] = span;
    }
  }
  return at;
});

const rows = computed(() => {
  const out: { start: number; indexes: number[]; labels: { text: string; kind: string; col: number; span: number }[] }[] = [];
  for (let start = 0; start < props.cells.length; start += columns.value) {
    const end = Math.min(start + columns.value, props.cells.length);
    out.push({
      start,
      indexes: Array.from({ length: end - start }, (_, i) => start + i),
      labels: spans.value
        .filter((s) => s.pos >= start && s.pos < end)
        .map((s) => ({
          text: `${s.crib} · ${s.kind === "locked" ? "locked" : "trying"}`,
          kind: s.kind,
          col: s.pos - start + 1,
          span: Math.min(s.crib.length, end - s.pos),
        })),
    });
  }
  return out;
});

const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }));

function shown(cell: GridCell): string {
  if (cell.shown) return cell.shown;
  if (cell.pencil) return cell.pencil.toLowerCase();
  return "·";
}

function letterClass(cell: GridCell): string {
  if (cell.source) return cell.source;
  return cell.pencil ? "pencil" : "unknown";
}

function describe(i: number): string {
  const cell = props.cells[i]!;
  const span = spanAt.value[i];
  const parts = [`${i + 1}: ${cell.cipher}`];
  if (cell.source === "known") parts.push(`decrypts to ${cell.shown}`);
  else if (cell.source === "crib" || cell.source === "implied") parts.push(`would decrypt to ${cell.shown}`);
  else if (cell.source === "revealed") parts.push(`was ${cell.shown}`);
  else parts.push(cell.pencil ? `pencilled as ${cell.pencil}` : "unknown");
  if (span) parts.push(span.kind === "locked" ? `in ${span.crib}, locked` : `under ${span.crib}`);
  return parts.join(", ");
}
</script>

<template>
  <section ref="container" class="intercept" aria-labelledby="intercept-title">
    <h2 id="intercept-title" class="kicker">Intercept</h2>
    <div v-for="row in rows" :key="row.start" class="row">
      <ol class="cells" :style="gridStyle" :start="row.start + 1">
        <li v-for="i in row.indexes" :key="i" class="cell" :aria-label="describe(i)">
          <span class="num" aria-hidden="true">{{ i + 1 }}</span>
          <span class="tile" :class="spanAt[i]?.kind" aria-hidden="true">{{ cells[i]!.cipher }}</span>
          <span class="plain" :class="letterClass(cells[i]!)" aria-hidden="true">{{ shown(cells[i]!) }}</span>
        </li>
      </ol>
      <div v-if="row.labels.length" class="labels" :style="gridStyle" aria-hidden="true">
        <span
          v-for="label in row.labels"
          :key="label.text"
          class="label"
          :class="label.kind"
          :style="{ gridColumn: `${label.col} / span ${label.span}` }"
          >{{ label.text }}</span
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.intercept {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cells,
.labels {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-family: var(--mono);
  text-align: center;
}

.num {
  font-size: 10px;
  color: var(--muted);
}

.tile {
  height: 34px;
  border-radius: 6px;
  background: var(--raised);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
}

.tile.locked {
  background: var(--locked-fill);
  box-shadow: inset 0 0 0 2px var(--locked-line);
}

.tile.trying {
  background: var(--amber-tint);
  box-shadow: inset 0 0 0 2px var(--amber);
}

.plain {
  font-size: 15px;
  font-weight: 600;
  min-height: 20px;
}

.plain.known {
  color: var(--locked-line);
}

.plain.crib {
  color: var(--amber);
}

/* Elsewhere in the message: dotted, so it reads as a consequence, not the word itself. */
.plain.implied {
  color: var(--amber);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.plain.revealed {
  color: var(--muted);
  font-weight: 500;
}

.plain.pencil {
  color: var(--faint);
  font-weight: 500;
  font-style: italic;
}

.plain.unknown {
  color: var(--faint);
  font-weight: 500;
}

.label {
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label.locked {
  color: var(--locked-line);
}

.label.trying {
  color: var(--amber);
}
</style>
