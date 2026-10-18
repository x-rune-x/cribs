# Crib

A daily cipher-deduction word game. You've intercepted a message encrypted with a swap cipher and you know a few words in it (cribs), but not where they go. Place them to break the cipher.

The spec is [docs/brief.md](docs/brief.md); decisions made since are in [docs/decisions.md](docs/decisions.md).

## Status

- Milestone 1, the engine and generator: done.
- Milestone 2, the playable game for anonymous players: done.
- Milestone 3, accounts, the leaderboard, streaks and share text: next.

## Getting started

Needs Node 24 or later and npm 11 (`npm install -g npm@11` if `npm -v` shows 10).

```sh
npm install
cp .env.example .env.local     # then fill in BETTER_AUTH_SECRET and ADMIN_TOKEN (the file explains how)
npm run dev                    # http://localhost:3000
```

The dev server creates `data/crib.db` and runs migrations on startup. With it running, add some puzzles from a second terminal:

```sh
npm run generate -- --count 30 --seed demo
npm run seed -- data/puzzles/run-demo --daily 14    # 14 daily puzzles from today; the rest go to practice
npm run seed -- --golden                            # optional: the golden test puzzle as today's daily
```

Seeding goes through the running server (`POST /api/admin/puzzles`), so only the server ever writes to the database.

## Tests

```sh
npm test                        # engine and server unit tests (in-memory databases)
npm run typecheck
npx playwright install chromium # once
npm run test:e2e                # builds the app and plays the golden puzzle in a browser
```

The end-to-end tests run the production build on port 3100 with a fresh database in `data/e2e/`.

## Generating puzzles

Messages live in [content/messages.txt](content/messages.txt), one per line. Edit them freely, then check them:

```sh
npm run generate -- --check                    # length and usable cribs for every message
npm run generate -- --count 30 --seed demo     # reproducible run
npm run generate -- --difficulty medium        # easy, medium or mix (default)
npm run generate -- --survey                   # sample every message and print stats only
npm run generate -- --help
```

Each run writes `manifest.json`, `puzzles.json` (public) and `solutions.json` (server only) to `data/puzzles/run-<seed>/`. Everything under `data/` is gitignored, so solutions never reach the repo.

## Layout

```
src/engine/   the puzzle engine: pure TypeScript, no framework, database or Node imports (alias #engine)
app/          the Nuxt app (client-rendered): pages, components, the game composable
server/
  api/        Nitro routes: games, moves, practice, health, auth, admin import
  db/         Drizzle schema, migrations, and queries.ts, the one data-access module
  services/   game and puzzle logic over the engine and the database
  auth/       Better Auth options (anonymous players)
shared/       types and date helpers used by both app and server (alias #shared)
scripts/      generate and seed
e2e/          Playwright tests
content/      starter messages
data/         generated puzzles and the database (gitignored)
```

Positions are 0-based in the engine, the API and generated files; the UI shows them 1-based.
