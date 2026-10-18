import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { createError, type H3Event } from "h3";
import { authOptions } from "../auth/options";
import { useDb } from "../db/client";
import { account, session, user, verification } from "../db/schema";

function createAuth() {
  // BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
  return betterAuth({
    ...authOptions(),
    database: drizzleAdapter(useDb(), { provider: "sqlite", schema: { user, session, account, verification } }),
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function useAuth() {
  instance ??= createAuth();
  return instance;
}

/** The signed-in player's id. Everyone has one: the app signs visitors in anonymously. */
export async function requireUserId(event: H3Event): Promise<string> {
  const current = await useAuth().api.getSession({ headers: event.headers });
  if (!current) throw createError({ statusCode: 401, statusMessage: "Sign in first" });
  return current.user.id;
}
