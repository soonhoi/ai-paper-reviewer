import { defineConfig } from "astro/config";
import node from "@astrojs/node";

const desktop = process.env.PAPER_DESKTOP_BUILD === "1";
export default defineConfig({
  srcDir: desktop ? "./desktop-ui" : "./src",
  outDir: desktop ? "./dist-desktop" : "./dist",
  output: desktop ? "static" : "server",
  ...(desktop ? {} : { adapter: node({ mode: "standalone" }) }),
  server: { host: "127.0.0.1", port: 4321 },
  vite: { ssr: { external: ["pdf-parse", "@napi-rs/canvas", "openai", "dotenv"] } },
});
