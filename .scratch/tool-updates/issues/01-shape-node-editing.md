# 01: Edit scene profiles through shape nodes

**What to build:** Insert/connect a shape node, change a scene's profile and restore its saved fallback when disconnected; material editing also leaves the inspector.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [ ] Shape controls cover top rounding/radius/taper, line boxes, join smoothing/radius and overshoot.
- [ ] Top-radius maximum is 400 px; current defaults and geometric safety caps remain unchanged.
- [ ] Shape and material editing are absent from the scene inspector; existing material nodes remain usable.
- [ ] Connected node overrides do not overwrite saved per-scene fallbacks. Disconnecting restores them; old documents do not gain automatic nodes.
- [ ] Reconcile overlapping master controls so the new shape node actually controls the advertised fields without silently changing default/legacy output.
- [ ] Node insertion/linking/muting, deletion, undo/redo, duplication and save/open follow existing workspace behavior.
- [ ] Workspace/graph and document round-trip tests cover overrides, fallback restoration and unchanged defaults.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

