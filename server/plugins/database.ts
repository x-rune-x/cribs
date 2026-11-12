import { useDb } from "../db/client";

// Open the database and run migrations at startup, before serving requests.
export default defineNitroPlugin(() => {
  // The static playtest build only runs the server while prerendering, and needs no database.
  if (process.env.NUXT_PUBLIC_BACKEND === "static") return;
  useDb();
});
