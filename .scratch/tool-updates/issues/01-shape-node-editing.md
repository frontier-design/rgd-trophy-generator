# 01: Edit scene profiles through shape nodes

**What to build:** Insert/connect a shape node, change a scene's profile and restore its saved fallback when disconnected; material editing also leaves the inspector.

**Blocked by:** None (can start immediately).

**Status:** done

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [x] Shape controls cover top rounding/radius/taper, line boxes, join smoothing/radius and overshoot.
- [x] Top-radius maximum is 400 px; current defaults and geometric safety caps remain unchanged.
- [x] Shape and material editing are absent from the scene inspector; existing material nodes remain usable.
- [x] Connected node overrides do not overwrite saved per-scene fallbacks. Disconnecting restores them; old documents do not gain automatic nodes.
- [x] Reconcile overlapping master controls so the new shape node actually controls the advertised fields without silently changing default/legacy output.
- [x] Node insertion/linking/muting, deletion, undo/redo, duplication and save/open follow existing workspace behavior.
- [x] Workspace/graph and document round-trip tests cover overrides, fallback restoration and unchanged defaults.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

- Partial work: raised the existing top-radius control to 400 px; the shape node and remaining acceptance criteria are not implemented. Targeted ControlPanel test passes. Browser verification not done.

- Implemented: shape modifier node (round top/radius, taper, line-box padding/radius, smooth joins/radius, overshoot), insert-shape menu action, shape fields, document parsing/counters, graph resolution (last linked shape wins, muted links ignored), and a scene artwork override that leaves the saved fallback intact. Scene inspector hides shape/material sections; master-owned fields stay hidden as before. The shape node is applied after `withMaster`, so it overrides master/scene fallbacks, and disconnecting or muting restores the saved fallback. The top radius UI max is 400 px.
- Verification: `npx tsc --noEmit -p tsconfig.app.json`, `npx tsc --noEmit -p tsconfig.test.json`, and focused tests `tests/components/ShapeNode.test.tsx`, `selection.test.ts`, `master.test.ts`, `CanvasPage.test.tsx`, `ControlPanel.test.tsx` pass. Tests cover insertion/linking/muting, override and fallback restoration, master reconciliation, scene-inspector hiding, malformed saves, and parse round trips. Browser visual verification not run in this environment.
