import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Config for the dev page (`pnpm dev`), `pnpm bench` and Vitest.
// The Webview build has its own file: vite.webview.config.ts.
export default defineConfig({
  plugins: [react()],
});
