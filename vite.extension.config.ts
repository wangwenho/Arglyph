import { defineConfig } from "vite";

// Extension host build: bundles src/extension/extension.ts, with the shared
// src/protocol.ts it imports, into the single file out/extension.cjs that
// package.json's `main` points to (what VS Code's bundling guide recommends).
// `vscode` is provided by the running VS Code, and the Node built-ins by Node,
// so neither goes into the bundle. Types are checked by `pnpm typecheck`.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "out",
    // out/webview/ is the webview build's: leave it alone.
    emptyOutDir: false,
    target: "node22",
    sourcemap: true,
    minify: false,
    lib: {
      entry: "src/extension/extension.ts",
      formats: ["cjs"],
      fileName: () => "extension.cjs",
    },
    rollupOptions: {
      external: ["vscode", /^node:/],
    },
  },
});
