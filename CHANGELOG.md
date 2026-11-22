# Changelog

## 1.0.1 (2026-11-22)

- The project links now point to the renamed repository, `wangwenho/Arglyph`.
- The README images have consistent descriptions.

## 1.0.0 (2026-11-21)

First release.

- **Grid view**: every glyph of a `.ttf` or `.otf` font in a grid that stays smooth with tens of thousands of glyphs. Each cell shows one of four states: drawn, blank, undrawn or missing. Filter by Unicode block (grouped by plane) or by state, and change the glyph size.
- **Search**: by character, code point such as `U+4E00`, or range such as `U+4E00-4E2F`, several at once.
- **Zoom view**: one glyph over the whole area, with nine layers you can toggle: fill, outline, points and handles, layout, side bearings (LSB, glyph width, RSB), metrics, bounding box, rulers and grid. Guide labels show their values in font units. Wheel zoom from 0.1× to 128× of the fit size, drag to pan, fit to view, and an overview that shows where the view is on the glyph.
- **Text view**: type your own text and see it in the font, with missing characters marked; horizontal and vertical writing, line height and letter spacing.
- **Inspector**: font and glyph facts, with copy buttons; `Cmd/Ctrl`+`I` shows or hides it.
- **Right-click menu** on a glyph in the grid: Copy Code Point and Copy Character, so the inspector does not have to be open. The right click also selects the glyph; the menu key does the same for the selected one.
- **Theme**: follows your VS Code theme, light, dark or high contrast, and adjusts glyph colors so they stay readable.
- **Per-tab memory**: each editor tab keeps its own view, glyph size, zoom layers, text, inspector and filters.
- **Live reload** when the font file changes on disk, also for names like `Font[wght].ttf`; a file that goes away is said so, and the last version stays on screen.
- Keyboard navigation throughout; press `?` for every shortcut.
