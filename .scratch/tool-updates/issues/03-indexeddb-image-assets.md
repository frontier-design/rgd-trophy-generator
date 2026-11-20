# 03: Import, reopen and port 5000 px image assets using IndexedDB

**What to build:** Upload a larger pattern image, reload it durably, and save/open a portable project without depending on localStorage image capacity.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [ ] Imported images retain at most 5000 px on the longest edge, preserve proportions and are never upscaled.
- [ ] Assets use IndexedDB; lightweight workspace storage may remain in localStorage.
- [ ] Previously embedded images and localStorage asset references still open and migrate without deleting their only durable copy prematurely.
- [ ] Asset hydration, autosave ordering and manual save/open await required work; no successful save is reported with unresolved/missing assets.
- [ ] Portable project exports embed their image content and open in a clean browser store.
- [ ] Storage failures/missing assets are surfaced; cross-tab conflict protection remains intact.
- [ ] Pattern processing stays bounded rather than blindly processing every source at full 5000 px resolution.
- [ ] Persistence tests cover migration, async ordering, failure, round-trip portability and shared asset use. Include a real-browser storage lifecycle check.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

