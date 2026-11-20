# 06: Control repeat spacing, offset and transparent export

**What to build:** Adjust repeat density and framing interactively and export exactly that composition.

**Blocked by:** 05 — Create a centered single-text repeat artboard.

**Status:** done

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [x] Tile scale preserves proportions; independent X/Y spacing and X/Y offsets update the composition.
- [x] Negative spacing permits overlap but repeat pitch stays positive, including malformed loaded values.
- [x] Dragging artwork adjusts overall offset correctly at workspace zoom levels.
- [x] Aligned rows use the same one-text layout; copies cover the visible frame and clip at all edges without unbounded instance generation.
- [x] Background color control and transparent PNG export match the preview's artwork placement and frame size.
- [x] Settings survive undo/redo, resize and project round trips.
- [x] Geometry/UI tests cover fractional scale, overlap, large offsets and edge clipping; real-render checks establish preview/export parity and transparency.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

- Implemented proportional `tile scale`, independent X/Y spacing (negative values overlap), independent X/Y offsets, positive pitch clamping for malformed saves, and a bounded visible-copy range. Dragging inside the artboard changes `offsetX`/`offsetY` in artboard px using the current workspace zoom.
- The artboard frame is resizable; copies are clipped to it. A background color control fills the artboard once behind the repeated artwork. PNG export renders the same drawing function at 1–5× and omits the background for transparent PNG, so placement and frame match the preview.
- Tests in `tests/components/repeatNode.test.ts` cover fractional scale, negative spacing/positive pitch, large offsets with bounded coverage, centered text placement, clipping, background/transparent pixel checks at 1× and 2×, and persistence. UI tests cover scale/spacing/offset/background updates, drag offset, resize and undo/redo. Full suite `463 passed`; typechecks, lint and production build pass.

