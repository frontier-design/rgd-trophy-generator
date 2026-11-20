# 04: Crop pattern sources in a bounded image viewer

**What to build:** Inspect an imported image, select a reversible crop and see only that region used for the trophy pattern.

**Blocked by:** 03 — Import, reopen and port 5000 px image assets using IndexedDB.

**Status:** done

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [x] Viewer shows the source and full-image default crop, with freely resizable corner/edge handles and drag-to-move.
- [x] Crop is nonzero, constrained inside the image and stored as normalized coordinates separately from the source.
- [x] Zoom spans fit through 8× fit; zoom controls, fit reset and panning work without moving the workspace.
- [x] Zoom/pan do not alter the crop or rebuild the pattern; crop changes do rebuild it, with latest-result protection.
- [x] Replacing the source resets the crop. Undo/redo, autosave and portable save/open preserve crop edits and source content.
- [x] Tests cover crop bounds, interaction at different zoom levels, map invalidation, stale jobs and round trips.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Verification

- `npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.test.json` — passed.
- `npm test -- --run` — 77 files, 478 tests passed.
- `npm run lint` — passed.
- Pure geometry tests (`tests/pattern/crop.test.ts`) cover clamping, move and every corner/edge resize; `tests/pattern/map.test.ts` proves the selected crop feeds the map without automatic margin trimming defeating it.
- `tests/components/PatternCropViewer.test.tsx` covers fit/8× zoom, corner/edge resize, move, clamping and zoom/pan isolation (no crop change); `tests/components/PatternFieldsCrop.test.tsx` covers crop editing and source replacement resetting to full.
- `tests/hooks/usePatternMaps.test.tsx` and `usePatternMapsStale.test.tsx` cover crop-driven rebuilds and rejecting an older job that finishes after a newer one. `tests/components/PatternCropCanvas.test.tsx` covers undo/redo, autosave and reopen; `tests/state/persist.test.ts` covers crop document round-trips.

## Comments

