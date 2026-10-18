# Crib

A daily cipher-deduction word game. You've intercepted a message encrypted with a swap cipher and you know a few words in it (cribs), but not where they go. Place them to break the cipher.

The spec is [docs/brief.md](docs/brief.md); decisions made since are in [docs/decisions.md](docs/decisions.md).

## Status

Milestone 1 (engine and generator, no UI) is done. Milestone 2 builds the playable game on Nuxt.

## Getting started

Needs Node 24 or later.

```sh
npm install
npm test                              # engine tests, including the golden puzzle
npm run typecheck
npm run generate -- --count 30        # write 30 puzzles to data/puzzles/run-<seed>/
```

### Generating puzzles

Messages live in [content/messages.txt](content/messages.txt), one per line. Edit them freely, then check them:

```sh
npm run generate -- --check                    # length and usable cribs for every message
npm run generate -- --count 30 --seed demo     # reproducible run
npm run generate -- --difficulty medium        # easy, medium, hard or mix (default)
npm run generate -- --survey                   # sample every message and print stats only
npm run generate -- --help
```

Each run writes `manifest.json`, `puzzles.json` (public: ciphertext, cribs, difficulty, par) and `solutions.json` (server only) to `data/puzzles/run-<seed>/`. Everything under `data/`, including the database later, is gitignored so solutions never reach the repo.

## Layout

```
src/engine/   the puzzle engine: pure TypeScript, no framework, database or Node imports
  cipher      seeded RNG, keys, encrypt/decrypt, swap types
  rules       placement checks with typed reasons, swap merging, overlaps
  state       game state, applyMove (server) and preview (client)
  solver      L1/L2/L3 candidates, forced moves, solution counting, shortest forced paths
  grader      difficulty and par
  generator   messages to puzzles
  scoring     the score formula, in one config object
  analysis    Cribbot's move-by-move review
  explain     typed reasons to sentences
scripts/      CLI scripts (generate)
content/      starter messages
data/         generated puzzles and the database (gitignored)
```

Positions are 0-based in the engine and in generated files; the UI shows them 1-based.
