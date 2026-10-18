# Decisions

Changes to, and clarifications of, [the brief](brief.md), agreed during planning. Newest last.

## Stack

- **npm instead of pnpm.** One package, not a monorepo, so pnpm's advantages are small, and npm ships with Node. Pass script arguments after `--`: `npm run generate -- --count 30`.
- **Nuxt 4 instead of Next.js.** Built with Nitro's `node-server` preset (`.output/server/index.mjs`), which runs as a plain Node server in a container, so the Pi and scaling plans are unchanged. API routes become Nitro routes such as `server/api/games/[id]/moves.post.ts`; Better Auth mounts at `server/api/auth/[...all].ts`.
- **TypeScript 6, not 7.** Vue's type checker (`vue-tsc`) can't use TypeScript 7 yet because 7.0 has no JavaScript compiler API. Revisit once it does.

## Rules

1. **A crib must occur exactly once in the message letters.** Messages have no spaces, so THE also matches inside OTHER or across "WITH EVERY". A crib that occurs twice could be placed in two spots, which breaks uniqueness or marks a correct-looking placement wrong. The generator skips such words, so a lock is correct exactly when all its swaps match the key.
2. **No score ceiling by default.** `SCORING.max` is `null`, so beating par lifts a clean game above 100. Set `max: 100` to restore the cap.
3. **L3 exists, and Hard means "needs L3".** L3 drops a position if assuming it and running L2 leads to a contradiction: trial and error done as a proof. Puzzles L3 can't finish are rejected.
4. **Par and hints use the puzzle's reasoning level:** L2 for Easy and Medium, L3 for Hard. Par is found by breadth-first search over forced moves, never greedily.
5. **"Provable" means forced at that same level.** A correct move that isn't is rated a Leap.
6. **Moves compared with par are correct locks and correct declared swaps.** Mistakes and hints are charged separately.
7. **Declared swaps that are invalid input, not mistakes:** a pair where neither letter is in the message, a swap that's already known, and X⇄X. A declared swap that clashes with a known one is a mistake, and the result says why.
8. **A placement contradicts itself if any letter would pair with two different letters.** That covers the brief's examples and the case where crib and ciphertext letters chain (M⇄O and O⇄T).
9. **Hints show a move and the reason; the player then plays it** as a normal move (a "Play it" button in the UI).
10. **The mockup's "Undo" becomes "Cancel"**: it clears the preview only, since every move counts.
11. **Only the web server writes the database.** The seeder posts puzzle files to an admin-only endpoint on the running server (token in `.env.local`), and migrations run inside the web process at startup. The deploy script pulls the image, recreates `web` and waits for the health check.

## Open questions

These were raised without a recommendation and are still to be answered before their milestones:

- Should the leaderboard show only signed-up players, or anonymous ones too? (Milestone 3)
- Does a streak count consecutive daily wins (a loss resets it, as in Wordle) or consecutive days played? (Milestone 3)
- Should past daily puzzles join the practice archive once their day has passed? (Milestone 2)
- Which Raspberry Pi model, and is there a domain on Cloudflare yet? (Milestone 4)

## Generator findings (milestone 1)

From `npm run generate -- --survey` over the 60 starter messages (20–31 letters, 3–6 cribs):

- **Uniqueness is easy:** 97–98% of attempts have exactly one solution (the brief's prototype saw about two-thirds; excluding repeated cribs, rule 1, is most of the difference).
- **Coverage is the bottleneck:** only 43–47% of attempts reveal every message letter, and about 10–14% with 3 cribs.
- **Difficulty:** 87% Easy and 13% Medium, with no Hard. Medium is most common with 6 cribs (35–37%).
- **Par:** averages 3.3–3.4, rising from 2.7 with 3 cribs to 3.6–3.7 with 6.
- **Long messages don't produce Hard either.** On nine 35–40 letter messages with 3 cribs: 0 Hard, and coverage falls to 4%.
- **L3 is almost never needed.** Across about 19,000 unique puzzles (with and without coverage), L3 was needed to place the cribs only 4 times, and never in a puzzle that covers the message. Cribs constrain each other in pairs, and L2 already checks every pair, which is close to complete for 2–6 cribs.
- **What separates Easy from Medium:** every Easy puzzle has an L1-forced first move, and 98% of Medium puzzles have none. Medium means "one L2 insight to get started" (96% need exactly one L2 move).

So, as defined, Hard puzzles essentially don't occur at these sizes. How to define a third tier is an open decision.
