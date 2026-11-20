# 03: Import, reopen and port 5000 px image assets using IndexedDB

**What to build:** Upload a larger pattern image, reload it durably, and save/open a portable project without depending on localStorage image capacity.

**Blocked by:** None (can start immediately).

**Status:** done

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [x] Imported images retain at most 5000 px on the longest edge, preserve proportions and are never upscaled.
- [x] Assets use IndexedDB; lightweight workspace storage may remain in localStorage.
- [x] Previously embedded images and localStorage asset references still open and migrate without deleting their only durable copy prematurely.
- [x] Asset hydration, autosave ordering and manual save/open await required work; no successful save is reported with unresolved/missing assets.
- [x] Portable project exports embed their image content and open in a clean browser store.
- [x] Storage failures/missing assets are surfaced; cross-tab conflict protection remains intact.
- [x] Pattern processing stays bounded rather than blindly processing every source at full 5000 px resolution.
- [x] Persistence tests cover migration, async ordering, failure, round-trip portability and shared asset use. Include a real-browser storage lifecycle check.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Verification

- `npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.test.json` — passed.
- `npm test -- --run` — 77 files, 478 tests passed.
- `npm run lint` — passed.
- Automated persistence coverage (`tests/state/persist.test.ts`, `tests/app/autosave.test.tsx`, `tests/hooks/useAutosave.test.tsx`, `tests/hooks/usePatternMapsStale.test.tsx`) exercises a browser-compatible asynchronous IndexedDB adapter: 5000 px import fitting, IndexedDB write/read after cache reset, shared content, pruning, legacy `rgd-blob:` and embedded data-URL migration (legacy copy retained), async autosave ordering, portable export embedding and clean-store restore, missing-asset failure reporting, and latest-result protection.
- Import fitting and working-resolution bounds are pure functions (`fittedSize`) with focused tests; pattern decoding is capped at 2048 px on the long side while the stored source remains up to 5000 px.
- Production uses real IndexedDB with a legacy-localStorage fallback when it is unavailable. A manual real-browser lifecycle check (import a 5000 px image, reload, export, open in a fresh profile) remains recommended because jsdom has no native IndexedDB.

## Comments

