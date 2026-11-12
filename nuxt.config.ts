import { fileURLToPath } from "node:url";

// The static playtest build plays entirely in the browser (see scripts/build-playtest.ts).
const staticBuild = process.env.NUXT_PUBLIC_BACKEND === "static";

export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  // The game is fully interactive and the daily puzzle depends on the player's
  // local date, so there's nothing useful to render on the server.
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    public: {
      /** "server" (the real game) or "static" (playtest build, answers in the browser). */
      backend: "server",
    },
  },
  alias: {
    "#engine": fileURLToPath(new URL("./src/engine/index.ts", import.meta.url)),
  },
  app: {
    head: {
      title: "Crib",
      htmlAttrs: { lang: "en" },
      meta: [
        { name: "description", content: "A daily cipher-deduction word game." },
        { name: "theme-color", content: "#121418" },
      ],
    },
  },
  nitro: {
    preset: staticBuild ? "static" : "node-server",
  },
});
