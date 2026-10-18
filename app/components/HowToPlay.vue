<script setup lang="ts">
import { ref } from "vue";
import { MAX_MISTAKES, SCORING } from "#engine";

const dialog = ref<HTMLDialogElement | null>(null);

defineExpose({
  open: () => dialog.value?.showModal(),
});
</script>

<template>
  <dialog ref="dialog" class="help" aria-labelledby="help-title" @click.self="dialog?.close()">
    <div class="body">
      <div class="top">
        <h2 id="help-title">How to play</h2>
        <button type="button" class="close" aria-label="Close" @click="dialog?.close()">×</button>
      </div>
      <p>
        You've intercepted an enemy message. Its letters have been swapped in pairs (A⇄G, B⇄C and so on, 13 swaps in
        all), so every letter stands for its partner, and no letter ever stands for itself.
      </p>
      <p>You know some words in the message, but not where they are. Place them to break the cipher.</p>
      <ul>
        <li><strong>Slide</strong> a word along the message to see what each spot would decrypt. Sliding is free.</li>
        <li>
          <strong>Lock</strong> it in when you're sure. If it's right, its swaps decrypt the matching letters
          everywhere. If it's wrong, that's a mistake. {{ MAX_MISTAKES }} mistakes ends the game.
        </li>
        <li>
          A word can't go where it would put a letter over itself, pair one letter with two others, clash with a swap
          you've found, or overlap a locked word. Spotting those spots is the skill.
        </li>
        <li><strong>Declare</strong> a swap when you recognise a half-decrypted word. <strong>Pencil</strong> notes are free.</li>
        <li><strong>Hint</strong>: Cribbot shows a move that's logically forced right now, and why.</li>
        <li>You win when every letter is decrypted, even if some words are never placed.</li>
      </ul>
      <h3>Score</h3>
      <p>
        Start at {{ SCORING.start }}: −{{ SCORING.perMistake }} per mistake, −{{ SCORING.perHint }} per hint,
        +{{ SCORING.perMoveUnderPar }} per move under par, −{{ SCORING.perMoveOverPar }} per move over par.
      </p>
      <h3>Keyboard</h3>
      <p>← → slide the word, ↑ ↓ change word, Enter locks it, Esc cancels.</p>
      <form method="dialog">
        <button class="btn btn-primary">Got it</button>
      </form>
    </div>
  </dialog>
</template>

<style scoped>
.help {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
}

.help::backdrop {
  background: rgb(0 0 0 / 0.6);
}

.body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 15px;
  line-height: 1.45;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h2 {
  font-size: 20px;
}

.close {
  width: 44px;
  height: 44px;
  margin-right: -10px;
  border: none;
  background: none;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
}

h3 {
  margin: 6px 0 0;
  font-size: 15px;
}

ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
