# Decisions

Changes to, and clarifications of, [the brief](brief.md), agreed during planning. Newest last.

## Stack

- **npm instead of pnpm.** One package, not a monorepo, so pnpm's advantages are small, and npm ships with Node. Pass script arguments after `--`: `npm run generate -- --count 30`.
- **Nuxt 4 instead of Next.js.** Built with Nitro's `node-server` preset (`.output/server/index.mjs`), which runs as a plain Node server in a container, so the Pi and scaling plans are unchanged. API routes become Nitro routes such as `server/api/games/[id]/moves.post.ts`; Better Auth mounts at `server/api/auth/[...all].ts`.
- **TypeScript 6, not 7.** Vue's type checker (`vue-tsc`) can't use TypeScript 7 yet because 7.0 has no JavaScript compiler API. Revisit once it does.
- **npm 11.** npm 10 fails to install Nuxt with "Cannot read properties of null (reading 'edgesOut')", a resolver bug that npm 11 (the version Node 24 ships) doesn't have. npm 11 blocks dependency install scripts unless approved, so `package.json` lists `allowScripts` for better-sqlite3 and esbuild.
- **Drizzle 0.45, the stable line.** Drizzle's docs now point at the 1.0 release candidate; move once 1.0 is stable.
- **A client-rendered app (`ssr: false`).** Everything is interactive and the daily puzzle depends on the player's local date, so server rendering adds nothing. It also avoids forwarding Better Auth cookies during SSR. Nitro still serves the API.
- **Line endings are LF** (`.gitattributes`), so scripts work unchanged in Linux containers.
- **Better Auth's generated tables** (`npm run auth:schema`) use SQLite's `unixepoch()` for column defaults. Regenerate with `--dialect postgresql` when moving to Postgres.

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

12. **Two difficulty tiers for now: Easy and Medium.** The engine still grades Hard (needs L3), but the generator only makes Easy and Medium, since Hard almost never occurs (see the findings below). Revisit after the friends test; the strongest candidate is a "read the last letters" tier.
13. **Anonymous players appear on the leaderboard**, under a generated name until they pick one.
14. **Streaks count consecutive daily wins.** A loss or a missed day resets the streak.
15. **Past daily puzzles stay out of the practice archive** for now.
16. **Hosting:** a Raspberry Pi 4, and no domain yet. The plan is to register one with Namecheap and point its nameservers at Cloudflare (free plan) so the Cloudflare Tunnel can use it. Until then, the fallback is Tailscale Funnel.
17. **Pencil notes stay in the browser** (localStorage, per game). They're free, so the server never needs them.
18. **Anonymous players get a generated name** such as "Masked Wolf 12", which the leaderboard will show until they choose one.
19. **The API uses 0-based positions**, like the engine. The UI adds 1.
20. **Rate limits are kept in memory:** 30 moves and 20 game starts per player per minute. That's enough for one server process; several instances would need a shared store.
21. **Starting today's game starts its clock**, so the server measures time from the first visit. Time only breaks ties.
22. **Practice games resume** where the player left off. After a practice game ends, "Play again" starts a fresh one; the ranked daily game can't be replayed.

## Generator findings (milestone 1)

From `npm run generate -- --survey` over the 60 starter messages (20–31 letters, 3–6 cribs):

- **Uniqueness is easy:** 97–98% of attempts have exactly one solution (the brief's prototype saw about two-thirds; excluding repeated cribs, rule 1, is most of the difference).
- **Coverage is the bottleneck:** only 43–47% of attempts reveal every message letter, and about 10–14% with 3 cribs.
- **Difficulty:** 87% Easy and 13% Medium, with no Hard. Medium is most common with 6 cribs (35–37%).
- **Par:** averages 3.3–3.4, rising from 2.7 with 3 cribs to 3.6–3.7 with 6.
- **Long messages don't produce Hard either.** On nine 35–40 letter messages with 3 cribs: 0 Hard, and coverage falls to 4%.
- **L3 is almost never needed.** Across about 19,000 unique puzzles (with and without coverage), L3 was needed to place the cribs only 4 times, and never in a puzzle that covers the message. Cribs constrain each other in pairs, and L2 already checks every pair, which is close to complete for 2–6 cribs.
- **What separates Easy from Medium:** every Easy puzzle has an L1-forced first move, and 98% of Medium puzzles have none. Medium means "one L2 insight to get started" (96% need exactly one L2 move).

So, as defined, Hard puzzles essentially don't occur at these sizes. For now there are two tiers (decision 12); the Lab below is exploring what a harder mode should be.

## The Lab: trial variants for a harder mode

From the first playtest: the cribs come from one sensible English sentence, so their order can often be guessed by arranging them into a sentence, which skips some of the deduction. That's fine for Easy. To find a harder mode, the Lab (`/lab`, unranked) offers rule variants that combine freely. A puzzle's variant is stored with it (`puzzles.variant`):

- **Few words** (`coverage: "partial"`): 2–3 cribs that leave 1–3 swaps to read from the decrypted text and declare. Par adds one move per swap to read.
- **Decoy** (`decoy: true`): one listed word isn't in the message. Cribbot reasons with the rule "exactly one word is absent", and uniqueness counts that way too.
- **Your own words** (`words: "free"`): no list. A typed word counts as correct if those letters really are there, even across a word boundary, and overlapping true words are allowed. Par is the fewest words plus swaps that decrypt everything. A hint reveals one word.
- **Blind** (`feedback: "blind"`): placements and declared swaps stay on the player's device, can be moved or removed freely, and show clashes between themselves, but never whether they're right. The server only checks a submitted decryption: a wrong one is a mistake with no detail. A hint confirms one move on the board. There's no par; the score is 100 minus mistakes and hints.
- **Lists**: grammar-light messages in `content/lab-messages.txt`, so word order gives little away.

Make Lab puzzles with `npm run generate -- --lab` and import them with `npm run seed -- <run> --lab`.

**Findings** (every variant across all 80 messages):

| Variant | Easy | Medium | Hard | Mean par |
| --- | --- | --- | --- | --- |
| Few words | 36 | 24 | 0 | 4.7 |
| Lists, few words | 12 | 8 | 0 | 5.3 |
| Decoy | 0 | 31 | 29 | 3.3 |
| Few words, decoy | 0 | 23 | 37 | 4.6 |

Your-own-words par is 2–5, mean 3.6.

- **A decoy is what finally produces logic-Hard puzzles.** Any word might be the absent one, and L2 only compares words in pairs, so it can't rule anything out. When the decoy fits somewhere, only L3 trial and error ("if THE were the decoy, everything else would have to fit… and it can't") exposes it.
- **When the decoy fits nowhere at all,** L2 spots it and the puzzle is Medium.
- **The golden puzzle with OAK as a decoy** is Hard with par 3.
