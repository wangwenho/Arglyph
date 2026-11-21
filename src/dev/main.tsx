import type { ChangeEvent } from "react";
import { type AppHandle, mountApp } from "../app/mount-app.tsx";
import { findEmptyGlyphs } from "../core/font/emptiness.ts";
import { loadFont } from "../core/font/loader.ts";
import "../app/styles/index.css";
import "./dev.css";

// dev page (`pnpm dev`, `pnpm bench`): the font comes from a file
// picker in the toolbar instead of from the extension host.
const container = document.getElementById("root");
if (!container) throw new Error("#root is missing");
container.classList.add("dev-page");
// `?theme=dark` shows the dark theme, which is what VS Code does with a class on
// <body>; the dev page has no VS Code to do it.
if (new URLSearchParams(location.search).get("theme") === "dark") {
  document.body.classList.add("vscode-dark");
}

let app: AppHandle | null = null;

async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  const font = loadFont(buffer);
  app?.showFont(font, {
    fileName: file.name,
    fileSize: file.size,
    bytes: buffer,
    emptyGlyphs: findEmptyGlyphs(buffer, font.glyphs.length),
  });
}

app = mountApp(container, {
  copyText: (text) => navigator.clipboard.writeText(text),
  // Closed unless asked for (`?inspector=1`): `pnpm bench` measures the grid at
  // the same width as before the inspector existed.
  inspectorDefault:
    new URLSearchParams(location.search).get("inspector") === "1",
  toolbarExtra: <input type="file" onChange={onFileChange} />,
  onViewReady(view) {
    if (!import.meta.env.DEV) return;
    // The overlay is removed when the view goes (React mounts it twice in
    // development), and not installed at all if that happens first.
    let stop: (() => void) | undefined;
    let gone = false;
    import("./perf-stats.ts").then(({ installPerfStats }) => {
      const viewport = document.getElementById("grid-viewport");
      if (!viewport || gone) return;
      const stats = installPerfStats({
        viewport,
        takeCacheStats: () => view.takeCacheStats(),
      });
      view.setRenderObserver(stats.onRender);
      stop = stats.stop;
    });
    return () => {
      gone = true;
      stop?.();
    };
  },
});
