// Only used by `npm run auth:schema` to generate server/db/auth-schema.ts.
import { betterAuth } from "better-auth";
import { authOptions } from "./options";

export const auth = betterAuth(authOptions());
