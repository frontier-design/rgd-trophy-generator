# 06: Control repeat spacing, offset and transparent export

**What to build:** Adjust repeat density and framing interactively and export exactly that composition.

**Blocked by:** 05 — Create a centered single-text repeat artboard.

**Status:** ready-for-agent

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [ ] Tile scale preserves proportions; independent X/Y spacing and X/Y offsets update the composition.
- [ ] Negative spacing permits overlap but repeat pitch stays positive, including malformed loaded values.
- [ ] Dragging artwork adjusts overall offset correctly at workspace zoom levels.
- [ ] Aligned rows use the same one-text layout; copies cover the visible frame and clip at all edges without unbounded instance generation.
- [ ] Background color control and transparent PNG export match the preview's artwork placement and frame size.
- [ ] Settings survive undo/redo, resize and project round trips.
- [ ] Geometry/UI tests cover fractional scale, overlap, large offsets and edge clipping; real-render checks establish preview/export parity and transparency.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

