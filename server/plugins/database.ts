import { useDb } from "../db/client";

// Open the database and run migrations at startup, before serving requests.
export default defineNitroPlugin(() => {
  useDb();
});
