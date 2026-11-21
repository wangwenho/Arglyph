// The menu over a glyph in the grid.
//
// The menu itself is VS Code's: it reads `data-vscode-context` from the page
// when it opens, and runs the commands of package.json's "webview/context" with
// that object. This checks the half that is ours, in the page: that a right
// click selects the glyph and leaves the right description behind. (That the
// menu then shows up needs VS Code itself.)

import { FONTS } from "../fixtures/fonts.ts";
import { type Context, check, open } from "./harness.ts";

export async function contextMenu({ fonts: { latin } }: Context) {
  if (latin) {
    const app = await open(FONTS.latin);
    const context = () =>
      app.page.$eval("#grid-viewport", (e) =>
        e.dataset.vscodeContext ? JSON.parse(e.dataset.vscodeContext) : null,
      );
    const label = () => app.page.$eval(".glyph-label", (e) => e.textContent);

    check("No description until a menu is opened", (await context()) === null);

    await app.clickCard(2, { button: "right" });
    const first = await context();
    check(
      "A right click selects the glyph and describes it: its code point and character",
      first?.webviewSection === "arglyph.glyph" &&
        first.codePoint === (await label()) &&
        first.character ===
          String.fromCodePoint(Number.parseInt(first.codePoint.slice(2), 16)) &&
        first["arglyph.hasCharacter"] === true &&
        first.preventDefaultContextMenuItems === true,
      JSON.stringify(first),
    );

    await app.clickCard(5, { button: "right" });
    const second = await context();
    check(
      "Another glyph, another description (not the one selected before)",
      second?.codePoint === (await label()) &&
        second.codePoint !== first?.codePoint,
      `${first?.codePoint} -> ${second?.codePoint}`,
    );

    // The key that opens the menu from the keyboard: its event carries the
    // middle of the grid, not a glyph. It describes the selected one and leaves
    // the selection where it was.
    await app.page.mouse.move(0, 0);
    await app.page.focus("#grid-viewport");
    await app.page.keyboard.press("ArrowRight");
    const chosen = await label();
    await app.page.keyboard.press("ContextMenu");
    const keyboard = await context();
    check(
      "The context-menu key describes the selected glyph and does not move the selection",
      keyboard?.codePoint === chosen && (await label()) === chosen,
      `${keyboard?.codePoint} vs ${chosen} vs ${await label()}`,
    );
    await app.page.close();
  }
}
