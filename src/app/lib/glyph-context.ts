// What the grid tells VS Code about the glyph under the pointer, for the native
// context menu ("Copy Code Point", "Copy Character"; see package.json,
// contributes.menus["webview/context"]).
//
// VS Code reads the `data-vscode-context` attribute of the element that was
// right-clicked (and of its ancestors) at the moment the menu opens, so it has to
// be set while the event is handled, not on the next render: that is why this
// is a function of the model and an index, not of the app's state.

import { codepointToCharacter } from "../../core/glyph/info.ts";
import { formatGlyphLabel } from "../../core/glyph/label.ts";
import type { GridModel } from "../../core/grid/model.ts";
import { GLYPH_MENU_SECTION, type GlyphMenuContext } from "../../protocol.ts";

/**
 * The JSON for `data-vscode-context` over item `index`. An item with no code
 * point (a ligature, .notdef) or no item at all has nothing to copy: the menu
 * is then empty, and VS Code's own entries stay hidden.
 */
export function glyphMenuContext(
  model: GridModel | null,
  index: number,
): string {
  const codepoint =
    model && index >= 0 && index < model.count ? model.codepointAt(index) : -1;
  if (codepoint < 0)
    return JSON.stringify({ preventDefaultContextMenuItems: true });
  const character = codepointToCharacter(codepoint);
  const context: GlyphMenuContext = {
    webviewSection: GLYPH_MENU_SECTION,
    codePoint: formatGlyphLabel(codepoint, -1),
    ...(character === null ? {} : { character }),
    "arglyph.hasCharacter": character !== null,
    preventDefaultContextMenuItems: true,
  };
  return JSON.stringify(context);
}
