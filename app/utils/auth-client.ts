import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });

let session: Promise<void> | null = null;

/** Signs the visitor in anonymously if they aren't signed in yet, so anyone can play straight away. */
export function ensureSession(force = false): Promise<void> {
  if (force) session = null;
  session ??= (async () => {
    const current = await authClient.getSession();
    if (current.data) return;
    const { error } = await authClient.signIn.anonymous();
    if (error) throw new Error(error.message ?? "Couldn't start a session");
  })().catch((error: unknown) => {
    session = null;
    throw error;
  });
  return session;
}
