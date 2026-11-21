import { describe, expect, it } from "vitest";
import { buildWebviewHtml } from "./webview-html.ts";

const html = buildWebviewHtml({
  scriptUri: "vscode-webview://x/webview.js",
  styleUri: "vscode-webview://x/webview.css",
  cspSource: "vscode-webview://x",
  nonce: "abc123",
});

describe("buildWebviewHtml", () => {
  it("denies everything but its own styles and the script that has the nonce", () => {
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
    expect(csp).toBe(
      "default-src 'none'; style-src vscode-webview://x; script-src 'nonce-abc123'",
    );
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("loads the script with the same nonce, and has no inline script or style", () => {
    expect(html).toContain(
      '<script nonce="abc123" src="vscode-webview://x/webview.js">',
    );
    expect(html).toContain('href="vscode-webview://x/webview.css"');
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toMatch(/<style|style="/);
  });

  it("gives the app its root", () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('class="in-webview"');
  });
});
