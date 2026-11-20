# 02: Simplify all patterns to repeat + raised

**What to build:** A simpler pattern panel with no generation or style selection, including for reopened old work.

**Blocked by:** None (can start immediately).

**Status:** done

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [x] New and loaded patterns use repeat mode and raised relief.
- [x] Remove mode/style selectors, seed actions and generation-only controls; keep repeat-relevant controls.
- [x] Old generate/image and non-raised settings silently normalize while preserving image content and other valid settings.
- [x] No legacy notice or conversion button appears.
- [x] Existing valid projects still load and round-trip; tests cover normalization and retained controls.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

Verification: `npx vitest run tests/components/patternDocument.test.ts tests/components/CanvasPage.test.tsx` (19 passed), `npx tsc --noEmit`, and `npm run lint` passed. Full suite: `npm test -- --run` (447 passed); `npm run build` passed with a chunk-size warning. Browser visual checks not performed. The build wrote ignored `dist/` output despite the instruction not to touch it.

