/** Bump when a change to the rules, solver or analysis would change a stored analysis. */
export const ENGINE_VERSION = 1;

/** Bump when a change to the generator would change the puzzles it makes from the same seed. */
export const GENERATOR_VERSION = 1;

/** A game fails at this many mistakes, and the solution is revealed. */
export const MAX_MISTAKES = 5;

/** Message length in letters, after spaces and punctuation are removed. */
export const MESSAGE_LENGTH = { min: 18, max: 40 } as const;

export const CRIB_COUNT = { min: 3, max: 6 } as const;

export const MIN_CRIB_LENGTH = 3;
