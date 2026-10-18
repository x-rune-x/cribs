<script setup lang="ts">
import { localDateString } from "#shared/dates";

const route = useRoute();
useHead({ title: "Crib · Lab" });
const request = { kind: "practice" as const, puzzleId: String(route.params.id), localDate: localDateString() };
</script>

<template>
  <GameScreen :key="request.puzzleId" :request="request" />
</template>
