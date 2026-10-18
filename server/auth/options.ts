import type { BetterAuthOptions } from "better-auth";
import { anonymous } from "better-auth/plugins";

/**
 * Better Auth options shared by the server and by `npm run auth:schema`, so the
 * generated tables always match the plugins in use. The database adapter is
 * added in server/utils/auth.ts.
 */
export function authOptions() {
  return {
    appName: "Crib",
    plugins: [anonymous({ generateName: () => anonymousName() })],
  } satisfies BetterAuthOptions;
}

const ADJECTIVES = ["Quiet", "Silver", "Hidden", "Masked", "Swift", "Shadow", "Clever", "Distant", "Midnight", "Copper"];
const NOUNS = ["Fox", "Owl", "Courier", "Raven", "Cipher", "Agent", "Lantern", "Falcon", "Sparrow", "Wolf"];

/** A spy-ish placeholder name for anonymous players, shown until they pick one. */
export function anonymousName(random: () => number = Math.random): string {
  const pick = (words: string[]) => words[Math.floor(random() * words.length)]!;
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${Math.floor(random() * 90 + 10)}`;
}
