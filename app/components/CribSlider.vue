<script setup lang="ts">
import { computed, ref } from "vue";
import type { PlacementReason } from "#engine";

const props = defineProps<{
  crib: string;
  pos: number;
  count: number;
  /** Assist mode only: why each position is impossible (empty where it fits). */
  scan: PlacementReason[][] | null;
}>();

const emit = defineEmits<{ move: [pos: number]; step: [delta: number] }>();

const track = ref<HTMLElement | null>(null);
let dragging = false;

function positionAt(event: PointerEvent): number {
  const rect = track.value!.getBoundingClientRect();
  return Math.floor(((event.clientX - rect.left) / rect.width) * props.count);
}

function onDown(event: PointerEvent) {
  dragging = true;
  track.value?.setPointerCapture(event.pointerId);
  emit("move", positionAt(event));
}

function onMove(event: PointerEvent) {
  if (dragging) emit("move", positionAt(event));
}

function onUp(event: PointerEvent) {
  dragging = false;
  track.value?.releasePointerCapture(event.pointerId);
}

type Spot = "fit" | "clash" | "self" | "contradiction";

const spots = computed<Spot[] | null>(() =>
  props.scan
    ? props.scan.map((reasons) => {
        if (reasons.length === 0) return "fit";
        if (reasons.some((r) => r.kind === "self-encrypt")) return "self";
        if (reasons.some((r) => r.kind === "self-contradiction")) return "contradiction";
        return "clash";
      })
    : null,
);

function segmentClass(i: number): string[] {
  const classes = [];
  if (i === props.pos) classes.push("current");
  if (spots.value) classes.push(spots.value[i]!);
  return classes;
}

/** The mockup's assist explanations: clashes, self-encryptions and fits. */
const legend = computed(() => {
  if (!spots.value || !props.scan) return [];
  const lines: { kind: Spot; text: string }[] = [];
  const count = (kind: Spot) => spots.value!.filter((s) => s === kind).length;
  const plural = (n: number) => (n === 1 ? "spot" : "spots");
  const clashes = count("clash");
  if (clashes > 0) lines.push({ kind: "clash", text: `${clashes} ${plural(clashes)} clash with swaps or words you've already placed` });
  const contradictions = count("contradiction");
  if (contradictions > 0) {
    lines.push({ kind: "contradiction", text: `${contradictions} ${plural(contradictions)} would pair one letter with two others` });
  }
  props.scan.forEach((reasons, i) => {
    const self = reasons.find((r) => r.kind === "self-encrypt");
    if (self && self.kind === "self-encrypt" && lines.filter((l) => l.kind === "self").length < 2) {
      lines.push({ kind: "self", text: `Spot ${i + 1} puts ${self.letter} over ${self.letter}, and no letter can become itself` });
    }
  });
  const fits = spots.value.flatMap((s, i) => (s === "fit" ? [i + 1] : []));
  if (fits.length === 1) lines.push({ kind: "fit", text: `Spot ${fits[0]} is the only fit` });
  else if (fits.length > 1) lines.push({ kind: "fit", text: `${fits.length} spots fit: ${fits.slice(0, 8).join(", ")}${fits.length > 8 ? "…" : ""}` });
  return lines;
});
</script>

<template>
  <section class="panel slider" aria-labelledby="slider-title">
    <div class="head">
      <h2 id="slider-title" class="title">
        Sliding <span class="mono word">{{ crib }}</span> along the message
      </h2>
      <span class="spot mono">Spot {{ pos + 1 }} of {{ count }}</span>
    </div>
    <div class="control">
      <button type="button" class="step" aria-label="Slide left" :disabled="pos === 0" @click="emit('step', -1)">
        <span aria-hidden="true">◀</span>
      </button>
      <div
        ref="track"
        class="track"
        role="slider"
        tabindex="0"
        data-game-keys
        :aria-label="`Position of ${crib}`"
        aria-valuemin="1"
        :aria-valuemax="count"
        :aria-valuenow="pos + 1"
        :aria-valuetext="`Spot ${pos + 1} of ${count}`"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <span v-for="i in count" :key="i" class="segment" :class="segmentClass(i - 1)">{{
          spots?.[i - 1] === "self" ? "=" : ""
        }}</span>
      </div>
      <button type="button" class="step" aria-label="Slide right" :disabled="pos >= count - 1" @click="emit('step', 1)">
        <span aria-hidden="true">▶</span>
      </button>
    </div>
    <ul v-if="legend.length" class="legend">
      <li v-for="line in legend" :key="line.text" :class="line.kind">
        <span class="swatch" :class="line.kind" aria-hidden="true">{{ line.kind === "self" ? "=" : "" }}</span>
        {{ line.text }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.slider {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.word {
  color: var(--amber);
}

.spot {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}

/* A tall hit area around a thin visual track, so it's easy to touch. */
.track {
  display: flex;
  gap: 3px;
  align-items: center;
  min-height: 44px;
  touch-action: none;
  cursor: pointer;
  border-radius: 6px;
}

.segment {
  flex: 1;
  height: 16px;
  border-radius: 3px;
  background: var(--raised);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-size: 10px;
  line-height: 1;
}

.segment.clash,
.segment.contradiction {
  background: var(--border);
  opacity: 0.6;
}

.segment.self {
  background: transparent;
  border: 1.5px solid var(--text);
}

.segment.fit {
  background: transparent;
  border: 1.5px solid var(--amber);
}

.segment.current {
  background: var(--amber);
  border-color: var(--amber);
  color: var(--bg);
  opacity: 1;
}

.control {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  gap: 6px;
  align-items: center;
}

.step {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--raised);
  font-size: 14px;
  cursor: pointer;
}

.step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.legend {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  line-height: 1.35;
  color: var(--muted);
}

.legend li {
  display: flex;
  gap: 8px;
}

.legend li.self {
  color: var(--text);
}

.legend li.fit {
  color: var(--amber);
}

.swatch {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border-radius: 3px;
  background: var(--border);
  font-family: var(--mono);
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.swatch.self {
  background: transparent;
  border: 1.5px solid var(--text);
}

.swatch.fit {
  background: var(--amber);
}
</style>
