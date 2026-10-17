# Build "Crib": a daily cipher-deduction word game (web app)

I want a mobile-first web game with accounts, skill scores and, later, a premium tier. I'll first self-host it on a Raspberry Pi so friends can test it, then move to scalable hosting if it takes off, so keep it portable. This brief is the spec. A static visual mockup is in `design/crib-mockup.html`.

## How I want you to work

- Read this whole brief first. Then reply with a plan before writing any code: repo layout, the engine's main types and functions, the database schema, and any questions where the brief is ambiguous or where you think a rule is a mistake. Wait for my go-ahead.
- Build in the milestones at the end of this brief. At the end of each one, stop, summarise what changed, tell me how to run it, and commit.
- Write the puzzle engine test-first. Keep it in `src/engine/` with no framework imports (no React, Next.js or database code), so the same code runs in the browser, on the server and in CLI scripts.
- Check current docs for library versions and setup steps rather than relying on memory.
- Never ship secrets or puzzle solutions to the client. Use `.env.local`, and keep `.env.example` up to date.

## The game

**Premise:** you've intercepted an enemy message encrypted with a swap cipher. You know a few words that appear in it (cribs), but not where they appear. Place them to break the cipher.

### Cipher rules (the engine must enforce exactly these)

1. The key pairs all 26 letters into 13 swaps (A⇄G, B⇄C, …). Encrypting replaces each letter with its partner, and decrypting is the same operation.
2. As a result, no letter ever encrypts to itself.
3. Messages are A–Z only, with no spaces or punctuation, and 18–40 letters long. They're shown in one numbered row that wraps on small screens.

### A puzzle

- A ciphertext plus 3–6 cribs. Each crib is a different word of at least 3 letters from the plaintext.
- Cribs never overlap in the true solution.
- Cribs are listed alphabetically, so the list order reveals nothing about where they go.
- Every puzzle has exactly one solution, and the solution's swaps cover every letter that appears in the message.

### Placements

Placing crib `w` at position `p` asserts `w[i] ⇄ ciphertext[p+i]` for every `i`. A placement is **impossible** if any of these hold:

- a crib letter sits on the same ciphertext letter (a letter would encrypt to itself)
- it contradicts itself, e.g. the crib maps E to two different letters, or two different crib letters land on the same ciphertext letter
- it contradicts a swap that's already known
- it overlaps a crib that's already locked

Return these reasons as typed values, so the UI can explain them in words (e.g. "E would encrypt to itself at 14").

### Moves

Every move counts, and the server checks each one against the solution.

- **Lock crib:** commit crib X at position p.
  - If it's correct, its swaps are added and every occurrence of those letters across the message decrypts.
  - If it's wrong, it's rejected and counts as a mistake; the board doesn't change. If the placement was impossible given what the player already knew, say why. If it was possible but simply wrong, just say it isn't there.
- **Declare swap:** assert X⇄Y directly. This is for a player who recognises a partly decrypted word, e.g. `OL_` must be OLD. A correct declaration is added; a wrong one is a mistake.
- **Hint:** the solving bot (Cribbot, below) reveals one move that is logically forced right now, and why. Counts as a hint.

These cost nothing:

- dragging or previewing a crib along the message to see what it would decrypt
- pencil notes on letters
- cancelling a preview

**Win:** every letter in the message is decrypted. Players can win without placing every crib.

**Fail:** 5 mistakes. The solution is then revealed. Make the limit a config constant.

### What ranked play must NOT do

In a preview, show what the placement would decrypt, but never mark it valid or invalid. Feedback comes only when a move is submitted. Spotting impossible positions is the player's job, and it's the core skill.

**Assist mode** is a toggle allowed only in practice. It greys out positions that are impossible under the rules above (the mockup's "Sliding DAWN" panel shows this). An assisted game is unranked.

## Puzzle engine (`src/engine/`)

### `cipher`

Seeded RNG, key generation, encrypt/decrypt, and the swap and key types.

### `rules`

Placement checks with typed reasons, merging swap sets, and overlap checks.

### `state`

Pure game state plus `applyMove(state, move, solution) → { state, result }`, which runs on the server. The client only needs `preview(state, crib, pos)`, which uses public data only.

### `solver`

- `countSolutions(puzzle, limit = 2)`: backtracking that tries the crib with the fewest candidate positions first.
- `candidates(state, level)`:
  - **L1** checks each unplaced crib's positions on their own against the rules and the known swaps.
  - **L2** also removes a position if some other unplaced crib has no compatible position left alongside it. It repeats until nothing changes.
  - Both levels must be sound: they must never remove the true position.
- `forcedMoves(state, level)`:
  - a crib with exactly one candidate
  - a swap implied by every remaining candidate of some crib
  - the last unpaired letters pairing with each other

### `grader`

- **Difficulty:**
  - **Easy:** Cribbot can win using only L1 forced moves.
  - **Medium:** it needs L2.
  - **Hard:** it needs trial-and-error search.
- **Par:** the fewest forced moves needed to win. Find it by search, not greedily. In the golden puzzle below, greedily taking the L2-forced move that reveals the most letters takes 4 moves, but MILL → DAWN → THE wins in 3.

### `generator` + `scripts/generate.ts`

1. Read messages from `content/messages.txt`. Write 60 short spy-themed starter messages there for me to edit. Use common words, e.g. "MEET AT THE OLD MILL AT DAWN".
2. For each message:
   - Generate a seeded random key.
   - Choose a crib subset from the message's distinct words of at least 3 letters.
   - Keep the result only if it has one solution, the solution covers every message letter, and it hits the target difficulty. Otherwise retry with a new key or subset.
3. Output the public puzzle and the solution separately.
4. Print stats: how often a candidate is unique, the difficulty mix, and the par distribution.

I ran a quick Python prototype that used every word of at least 3 letters as a crib.

- About two-thirds of random keys gave a unique solution.
- Of the unique ones, about 83% were Easy and 17% Medium. None were Hard.
- Average par was 3.5, with about 5 cribs.

Hard puzzles will probably need fewer cribs, longer messages, or both. Tell me what you find.

### `scoring`

Put the formula in one config object so I can tune it. Starting proposal:

- Start at 100.
- −15 per mistake.
- −10 per hint.
- +5 per move under par (beating par takes word recognition via declared swaps).
- −3 per move over par.
- Clamp to 0–100. A failed game scores 0.

Measure time on the server and use it only to break ties.

### `analysis` (Cribbot)

Replay a finished game move by move. For each move, show:

- the state before the move
- Cribbot's best move at that point
- the player's move, rated as one of:
  - **Best:** forced, and on a par-length path
  - **Good:** forced, but not optimal (e.g. it revealed nothing new)
  - **Leap:** correct, but not yet provable from crib logic (word recognition or a lucky guess)
  - **Mistake:** wrong. If it was already provably impossible, say why, e.g. "MEET at 3 was ruled out: T would pair with K, but you already had T⇄O."

Finish with a summary: skill score, moves vs par, mistakes, hints, leaps, and Cribbot's own path. Store an engine version number with each analysis so games can be re-analysed after rule changes.

### Golden test puzzle (use it as a fixture)

- **Plaintext:** `MEETATTHEOLDMILLATDAWN`
- **Key:** A⇄G B⇄C D⇄R E⇄K F⇄J H⇄Y I⇄W L⇄V M⇄U N⇄X O⇄T P⇄Q S⇄Z
- **Ciphertext:** `UKKOGOOYKTVRUWVVGORGIX`
- **Cribs:** DAWN, MEET, MILL, THE

Expected results:

- Exactly one solution. Positions (1-based): MEET 1, THE 7, MILL 13, DAWN 19.
- MILL has only one legal position from the start.
- It's Easy (L1 only), with par 3: MILL@13 → DAWN@19 → THE@7. Those three moves decrypt the whole message (O comes from T⇄O).
- Adding OLD as a fifth crib leaves the solution unique.

## Stack

Avoid vendor-specific platforms (no Supabase or Vercel-only features). Moving off the Pi should only take changes to environment variables and where the containers run.

- **TypeScript** throughout, with pnpm.
- **Next.js** (App Router), built with `output: "standalone"` so it runs as a plain Node server in a container.
- **SQLite** with **Drizzle ORM** and its migrations.
  - Turn on WAL mode, a busy timeout and foreign keys.
  - Only the web server opens the database for writing. Scripts like the puzzle seeder run through the app (e.g. `docker compose exec web …`), not as a second process holding the file.
  - Keep it portable to Postgres: store timestamps as integer epoch milliseconds and JSON through Drizzle's JSON mode, avoid SQLite-only SQL, and keep all queries in one data-access module.
  - Tests use a fresh in-memory database. Local dev needs no Docker for the database.
- **Better Auth** for accounts:
  - Use its anonymous plugin so anyone can play immediately.
  - For the friends test, add email and password sign-up. Linking creates a new user id, so move the anonymous player's games across in the plugin's `onLinkAccount` hook.
  - Magic-link and Google sign-in come later, once there's an email provider and a permanent domain.
- **Stripe** for premium (milestone 5, test mode only). Use the Stripe CLI to forward webhooks during development.
- **Vitest** for the engine and other unit tests, and **Playwright** for a few end-to-end flows.
- Styling is your call, but match the design tokens below.

## Hosting: Raspberry Pi first

- **Hardware:** a Raspberry Pi 4 or 5 with at least 4 GB of RAM, running 64-bit Raspberry Pi OS. Ask me which model I have. Recommend booting from an SSD, because constant database writes wear out SD cards.
- **Docker Compose** with these services:
  - `web`: the Next.js standalone server, with the SQLite file on a named volume
  - `litestream`: continuously replicates the database to S3-compatible storage (Cloudflare R2 or Backblaze B2), keeping 14 days of snapshots
  - `tunnel`: cloudflared
  - the daily-puzzle stock check

  Give every service a restart policy, and add a health-check endpoint. Document a restore onto a fresh machine (`litestream restore`) and test that it works.
- **Builds:** build arm64 images off the Pi, either with `docker buildx` on my PC or in GitHub Actions pushing to GHCR. The Pi should never run `next build`. A single `deploy` script pulls the new image, runs migrations and restarts.
- **Public access:**
  - Use a Cloudflare Tunnel on my own domain. It needs no port forwarding and works behind CGNAT.
  - If I don't have a domain yet, fall back to Tailscale Funnel.
  - Only the web server is reachable through the tunnel. Nothing else listens publicly.
- **Docs:**
  - `docs/deploy-pi.md`: step-by-step instructions for someone who has never set up a Pi server.
  - `docs/scaling.md`: a short guide to the options for growing. The default is a VPS running the same Compose file with SQLite. Alternatives are hosted SQLite (Turso) for serverless hosts, or moving to Postgres (a schema rewrite plus a data-copy script).

### Security model

- Only server code touches the database. There is no client-side database access, and the solutions table is never exposed through any API.
- The client only ever receives the ciphertext, the cribs, and the result of each move.
- `POST /api/games/:id/moves` validates the move with the engine, records it with a server timestamp, and returns the result plus any newly revealed swaps. Rate-limit it.
- Enforce premium on the server, not just by hiding UI.

### Daily puzzle

- One puzzle per day, the same for everyone, keyed by the player's local date as Wordle does.
- The server accepts a local date within one day of UTC and never serves a future puzzle.
- **Practice** is an archive of non-daily puzzles: unranked, and assist is allowed.

### Suggested data model (improve it if you see a better shape)

- `puzzles`: id, number, publish_date (nullable), kind (daily | practice), ciphertext, cribs, difficulty, par, length
- `puzzle_solutions`: puzzle_id, plaintext, positions, swaps. Server only.
- Better Auth's own tables for users and sessions, plus `profiles`: user_id, display_name, is_premium, stripe_customer_id
- `games`: id, user_id, puzzle_id, mode (ranked | assisted | practice), status, started_at, finished_at, move/mistake/hint counts, score. At most one ranked game per user per daily puzzle.
- `moves`: game_id, seq, kind (lock | swap | hint), payload, correct, reason, created_at
- `game_analysis`: game_id, json, engine_version
- `subscriptions`: user_id, stripe_subscription_id, status, current_period_end

## Free vs premium

**Free:**

- daily puzzle and practice
- an end-of-game summary: score, moves vs par, mistakes
- the daily leaderboard and streaks
- a spoiler-free share text, Wordle-style

**Premium:**

- full game history, with stats and a skill trend over time
- Cribbot's move-by-move analysis for every game. Today's analysis only appears after you've finished.

## Milestones

1. **Engine and generator, no UI.**
   - `pnpm test` passes, including the golden puzzle.
   - `pnpm generate --count 30` writes puzzles and prints the stats above.
2. **Playable game, anonymous players.**
   - Anonymous auth, daily and practice puzzles, server-checked moves, and an end screen.
   - Mobile-first, per the mockup. Keyboard play works too: arrow keys slide a crib, Enter locks it.
   - A Playwright test plays the golden puzzle to a win.
3. **Accounts and competition.**
   - Email and password sign-up that keeps the anonymous player's games.
   - Display names, a daily leaderboard (by score, then time), streaks, and share text.
4. **Deploy to the Pi for the friends test.**
   - Everything under "Hosting: Raspberry Pi first", including Litestream backups with a tested restore, the deploy script and both docs.
   - A scheduled check that warns if fewer than 30 future daily puzzles exist.
   - Seed at least 60 days of daily puzzles.
5. **Premium (Stripe test mode).**
   - Subscription via Stripe Checkout, a webhook that updates the user's entitlement, and the customer portal.
   - History and analysis pages.

## Design reference

`design/crib-mockup.html` shows the play screen.

**Colours:**

| Role | Value |
| --- | --- |
| Background | `#121418` |
| Surface | `#1B1E24` |
| Raised | `#262A32` |
| Border | `#2F343D` |
| Text | `#ECE8DF` |
| Muted text | `#A3A9B3` |
| Faint text | `#8F96A1` |
| Current attempt (amber) | `#F2B544`, tint `#2E2614` |
| Locked (blue) | fill `#1D3550`, text `#CFE5FF`, line `#7DBBFF` |

**Type:** IBM Plex Mono for letters and IBM Plex Sans for UI.

**Accessibility:**

- Touch targets at least 44px.
- Never rely on colour alone.
- Real buttons and labels throughout.

The mockup's clash-marking panel is Assist mode only (see above).

## Out of scope for now

Native apps, friends and social features, ads, localisation, and other cipher types.
