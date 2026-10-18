import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  // The game is fully interactive and the daily puzzle depends on the player's
  // local date, so there's nothing useful to render on the server.
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  css: ["~/assets/css/main.css"],
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
    preset: "node-server",
  },
});
