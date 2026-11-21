// The page every panel starts from. It has no dependency on `vscode`, so the
// policy below can be tested.
//
// CSP: deny everything by default, then allow only scripts that carry this
// panel's nonce and styles from the webview's own origin. The nonce is new for
// every panel, so a script injected into the page cannot guess it and will not
// run. The app renders itself into #root.

export interface WebviewHtmlParts {
  scriptUri: string;
  styleUri: string;
  /** `webview.cspSource`: where this webview's own resources are served from. */
  cspSource: string;
  nonce: string;
}

export function buildWebviewHtml({
  scriptUri,
  styleUri,
  cspSource,
  nonce,
}: WebviewHtmlParts): string {
  const csp = [
    "default-src 'none'",
    `style-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Arglyph</title>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body class="in-webview">
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
