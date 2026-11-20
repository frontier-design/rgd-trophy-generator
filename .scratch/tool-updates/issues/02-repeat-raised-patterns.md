# 02: Simplify all patterns to repeat + raised

**What to build:** A simpler pattern panel with no generation or style selection, including for reopened old work.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [ ] New and loaded patterns use repeat mode and raised relief.
- [ ] Remove mode/style selectors, seed actions and generation-only controls; keep repeat-relevant controls.
- [ ] Old generate/image and non-raised settings silently normalize while preserving image content and other valid settings.
- [ ] No legacy notice or conversion button appears.
- [ ] Existing valid projects still load and round-trip; tests cover normalization and retained controls.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

