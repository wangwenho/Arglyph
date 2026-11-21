import type { EmptyState } from "../lib/empty-state.ts";

/** The reason the grid is empty, in the middle of it (see describeEmpty). */
export function GridEmptyState({
  state,
  onAction,
}: {
  state: EmptyState;
  onAction(kind: NonNullable<EmptyState["action"]>["kind"]): void;
}) {
  const { title, detail, action } = state;
  return (
    <div className="grid-empty">
      <p className="grid-empty-title">{title}</p>
      {detail && <p className="grid-empty-detail">{detail}</p>}
      {action && (
        <button
          type="button"
          className="button"
          onClick={() => onAction(action.kind)}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
