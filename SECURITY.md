# Security Policy

## Supported versions

Only the latest release of Arglyph receives security fixes.

## Reporting a vulnerability

Report it privately, not in a public issue:

1. Open the [Security tab](https://github.com/wangwenho/Arglyph/security) of this repository.
2. Choose **Report a vulnerability** and describe what you found.

Include the Arglyph and VS Code versions and, if a particular font file triggers the problem, where to get that file. Do not attach fonts whose license does not allow sharing.

Once a fix is released, the report is published as a security advisory.

## Scope

Arglyph only reads the font file you open. It makes no network requests, and its webview blocks them. Reports are most useful when they concern:

- A crafted font file that crashes, hangs or otherwise misuses the extension.
- Anything that lets a font file or its text run code, read other files or reach the network.
- A flaw in how the webview is isolated from the rest of VS Code.

Problems in VS Code itself, or in fonts that merely look wrong, are better reported to the VS Code project or as a normal [issue](https://github.com/wangwenho/Arglyph/issues).
