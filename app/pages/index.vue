<script setup lang="ts">
import { localDateString } from "#shared/dates";

useHead({ title: "Crib · Today's message" });
// The daily puzzle follows the player's own calendar date, as Wordle does.
const request = { kind: "daily" as const, localDate: localDateString() };
</script>

<template>
  <GameScreen :request="request" />
</template>
