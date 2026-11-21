import { type ReactNode, useId } from "react";

/**
 * A control of the toolbar with its name in front ("Block [dropdown]"). The
 * dropdowns say what they are even when their value does not: `Mapped +
 * Missing (20,992)` means little without "Show" before it. The label is hidden
 * when the panel is narrow (styles/responsive.css); the control keeps its own aria-label,
 * and clicking the label focuses it.
 */
export function Field({
  label,
  children,
}: {
  label: string;
  /** The control, given the id its label points at. */
  children(id: string): ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}
