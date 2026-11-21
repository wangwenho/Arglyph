import { useEffect, useRef, useState } from "react";

/** The font as the browser's own text layout can use it. */
export type TextFace =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; family: string }
  | { status: "failed"; message: string };

let faceCount = 0;

/**
 * Register the font `bytes` with the page, under a name of its own, once
 * `enabled`: the text view sets its text in it. The bytes are what was read
 * from the file, which is also what opentype.js parsed, so the browser and the
 * grid show the same font. The browser checks the font by itself and may refuse
 * one opentype.js is happy with, which is why there is a `failed` state.
 *
 * When the file changes, the old face stays until the new one is ready, so the
 * text does not flash in another font in between.
 */
export function useTextFace(
  bytes: ArrayBuffer | null | undefined,
  enabled: boolean,
): TextFace {
  const [face, setFace] = useState<TextFace>({ status: "idle" });
  const registered = useRef<FontFace | null>(null);

  useEffect(() => {
    if (!enabled || !bytes) return;
    const family = `ArglyphTextFace${++faceCount}`;
    const fontFace = new FontFace(family, bytes);
    let cancelled = false;
    setFace((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );
    fontFace.load().then(
      () => {
        if (cancelled) return;
        document.fonts.add(fontFace);
        if (registered.current) document.fonts.delete(registered.current);
        registered.current = fontFace;
        setFace({ status: "ready", family });
      },
      (error: unknown) => {
        if (cancelled) return;
        setFace({
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bytes, enabled]);

  useEffect(
    () => () => {
      if (registered.current) document.fonts.delete(registered.current);
      registered.current = null;
    },
    [],
  );

  return face;
}
