// The Lovable wrapper supplies TanStack Start, React, Tailwind and Nitro.
// Keep its default target inside Lovable; explicitly select Nitro's Netlify
// preset for Netlify builds so SSR is emitted as a Netlify Function and the
// static site is written to dist/.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isNetlifyBuild = process.env["NETLIFY"] === "true";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(isNetlifyBuild ? { nitro: { preset: "netlify" } } : {}),
});
