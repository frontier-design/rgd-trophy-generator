# 04: Crop pattern sources in a bounded image viewer

**What to build:** Inspect an imported image, select a reversible crop and see only that region used for the trophy pattern.

**Blocked by:** 03 — Import, reopen and port 5000 px image assets using IndexedDB.

**Status:** ready-for-agent

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [ ] Viewer shows the source and full-image default crop, with freely resizable corner/edge handles and drag-to-move.
- [ ] Crop is nonzero, constrained inside the image and stored as normalized coordinates separately from the source.
- [ ] Zoom spans fit through 8× fit; zoom controls, fit reset and panning work without moving the workspace.
- [ ] Zoom/pan do not alter the crop or rebuild the pattern; crop changes do rebuild it, with latest-result protection.
- [ ] Replacing the source resets the crop. Undo/redo, autosave and portable save/open preserve crop edits and source content.
- [ ] Tests cover crop bounds, interaction at different zoom levels, map invalidation, stale jobs and round trips.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

