import { useEffect, useRef } from "react";
import {
  type HelpContext,
  helpGroups,
  modifierName,
  type Shortcut,
} from "../lib/shortcuts.ts";

export interface HelpDialogProps {
  /** What the user was looking at: its keys come first. */
  context: HelpContext;
  onClose(): void;
}

function Keys({ shortcut, mod }: { shortcut: Shortcut; mod: string }) {
  const alternatives: React.ReactNode[] = [
    ...shortcut.keys.map((combo) => (
      <span className="help-combo" key={combo.join("+")}>
        {combo.map((key, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a combination is a fixed list
          <kbd key={i}>{key === "Mod" ? mod : key}</kbd>
        ))}
      </span>
    )),
    ...(shortcut.gestures ?? []).map((gesture) => (
      <span className="help-gesture" key={gesture}>
        {gesture.replace("Mod", mod)}
      </span>
    )),
  ];
  return (
    <dt>
      {alternatives.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
        <span key={i} className="help-alternative">
          {i > 0 && <span className="help-or">or</span>}
          {item}
        </span>
      ))}
    </dt>
  );
}

/**
 * Every key and gesture, in a window over the page. It is a native modal
 * `<dialog>`: Esc closes it, the page behind cannot be reached, and the focus
 * goes back to where it was.
 */
export function HelpDialog({ context, onClose }: HelpDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const mod = modifierName();

  return (
    <dialog
      ref={ref}
      className="help"
      aria-labelledby="help-title"
      onClose={onClose}
      // Esc and a click on the backdrop both close it (VS Code 1.101+ has the
      // Chromium that supports closedby).
      closedby="any"
      onKeyDown={(event) => {
        // "?" opened it and closes it; the page's own handler is not reached.
        if (event.key === "?") {
          event.preventDefault();
          event.currentTarget.close();
        }
      }}
    >
      <div className="help-header">
        <h2 id="help-title">Keyboard shortcuts and gestures</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => ref.current?.close()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3.5 3.5l9 9m0-9l-9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        </button>
      </div>
      <div className="help-body">
        {helpGroups(context).map((group) => (
          <section key={group.title} className="help-group">
            <h3>
              {group.title}
              {group.context === context && (
                <span className="help-here">Current view</span>
              )}
            </h3>
            {group.intro && <p>{group.intro}</p>}
            <dl>
              {group.shortcuts.map((shortcut) => (
                <div className="help-row" key={shortcut.action}>
                  <Keys shortcut={shortcut} mod={mod} />
                  <dd>{shortcut.action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
