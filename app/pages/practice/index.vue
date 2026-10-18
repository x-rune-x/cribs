<script setup lang="ts">
useHead({ title: "Crib · Practice" });
</script>

<template>
  <section class="archive" aria-labelledby="practice-title">
    <div class="kicker">Archive</div>
    <h1 id="practice-title">Practice</h1>
    <p class="muted">Unranked puzzles to sharpen your skills. Assist mode is allowed here.</p>
    <PuzzleList endpoint="/api/practice" base="/practice" />
  </section>
</template>

<style scoped>
.archive {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

h1 {
  font-size: 26px;
  font-weight: 600;
}
</style>
