import { parseKey } from "../cipher";
import type { PublicPuzzle, Solution } from "../state";

// The golden test puzzle from docs/brief.md. Positions here are 0-based; the
// brief's 1-based positions are MEET 1, THE 7, MILL 13, DAWN 19.

export const GOLDEN_TEXT = "MEET AT THE OLD MILL AT DAWN";
export const GOLDEN_PLAINTEXT = "MEETATTHEOLDMILLATDAWN";
export const GOLDEN_KEY = parseKey("A⇄G B⇄C D⇄R E⇄K F⇄J H⇄Y I⇄W L⇄V M⇄U N⇄X O⇄T P⇄Q S⇄Z");
export const GOLDEN_CIPHERTEXT = "UKKOGOOYKTVRUWVVGORGIX";
export const GOLDEN_CRIBS = ["DAWN", "MEET", "MILL", "THE"] as const;
export const GOLDEN_POSITIONS = { MEET: 0, THE: 6, MILL: 12, DAWN: 18 } as const;

export const goldenPuzzle: PublicPuzzle = {
  ciphertext: GOLDEN_CIPHERTEXT,
  cribs: GOLDEN_CRIBS,
  difficulty: "easy",
  par: 3,
};

export const goldenSolution: Solution = {
  plaintext: GOLDEN_PLAINTEXT,
  positions: GOLDEN_POSITIONS,
  key: GOLDEN_KEY,
};
