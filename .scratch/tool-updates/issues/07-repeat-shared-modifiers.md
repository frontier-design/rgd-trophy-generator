# 07: Apply shared modifier nodes to repeat artboards

**What to build:** Shape, material, lighting, pattern, twist, etch and texture nodes change every repeated trophy consistently.

**Blocked by:** 01 — Edit scene profiles through shape nodes; 05 — Create a centered single-text repeat artboard.

**Status:** ready-for-agent

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [ ] Repeat artboard accepts the shared modifier inputs supported by ordinary scenes, including the new shape node.
- [ ] All repeated trophies use the same resolved settings and existing modifier precedence/mute behavior; no per-copy overrides.
- [ ] Input edits, disconnect, deletion and undo update the repeated artwork and exports without changing the source node's values.
- [ ] Graph resolution and persistence handle repeat targets, including pending/failed pattern maps, without stale output.
- [ ] Existing scenes and composition artboards retain their behavior.
- [ ] UI/graph/round-trip tests cover shared settings; real-render checks cover metallic lighting and representative surface modifiers across repeated copies.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

