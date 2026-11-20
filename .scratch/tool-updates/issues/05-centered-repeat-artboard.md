# 05: Create a centered single-text repeat artboard

**What to build:** Insert an independent artboard with a basic regular repeat of centered text gaps and symmetric trophies, connect text and export the default composition.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [ ] Artboard generates its own artwork with the existing measurement/profile/symmetric renderer, not an existing scene screenshot or asymmetric geometry.
- [ ] One effective text input; last connected eligible text wins. Existing mute/disconnect behavior and precedence persist through undo/redo and save/open.
- [ ] Font, size, line height and column width belong to the artboard. Identical centered text occupies each trophy gap.
- [ ] Basic fixed/default aligned-grid layout fills and clips to the resizable frame, using common baseline/trophy extent.
- [ ] Independent white-by-default background and basic PNG export are functional; saved documents round-trip the artboard and its connections.
- [ ] Workspace insertion, selection, move, delete, duplicate/copy-paste and undo/redo behave consistently with existing artboards.
- [ ] Reuse rendered trophy artwork rather than creating a 3D context per copy; visually verify centered text gaps against the reference.
- [ ] Automated UI/graph/persistence tests and a real-render visual check demonstrate the complete default path.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

