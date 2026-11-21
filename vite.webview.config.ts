import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Webview build: bundles src/webview/main.ts (with the app, canvas and core code
// and the CSS it imports) into out/webview/webview.js + webview.css. The file
// names are fixed so the extension can point to them with asWebviewUri.
// The dev page still uses `pnpm dev` (index.html + default config).
export default defineConfig({
  plugins: [react()],
  // Library mode leaves `process.env.NODE_ENV` in place, and a webview has no
  // `process`: React would throw on load. Replace it with a constant.
  define: { "process.env.NODE_ENV": '"production"' },
  publicDir: false,
  build: {
    outDir: "out/webview",
    emptyOutDir: true,
    lib: {
      entry: "src/webview/main.ts",
      formats: ["iife"],
      name: "ArglyphWebview",
      fileName: () => "webview.js",
      cssFileName: "webview",
    },
  },
});
