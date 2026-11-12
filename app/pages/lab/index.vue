<script setup lang="ts">
useHead({ title: "Crib · Lab" });
</script>

<template>
  <section class="archive" aria-labelledby="lab-title">
    <div class="kicker">Experimental</div>
    <h1 id="lab-title">Lab</h1>
    <p class="muted">
      Trial rule variants for a harder mode: fewer words, a decoy word, bringing your own words, and blind placement
      that's only checked when you submit. Unranked. Tell us which ones feel good.
    </p>
    <PuzzleList kind="lab" base="/lab" />
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
