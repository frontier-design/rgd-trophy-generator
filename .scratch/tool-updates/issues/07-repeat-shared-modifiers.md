# 07: Apply shared modifier nodes to repeat artboards

**What to build:** Shape, material, lighting, pattern, twist, etch and texture nodes change every repeated trophy consistently.

**Blocked by:** 01 — Edit scene profiles through shape nodes; 05 — Create a centered single-text repeat artboard.

**Status:** done

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [x] Repeat artboard accepts the shared modifier inputs supported by ordinary scenes, including the new shape node.
- [x] All repeated trophies use the same resolved settings and existing modifier precedence/mute behavior; no per-copy overrides.
- [x] Input edits, disconnect, deletion and undo update the repeated artwork and exports without changing the source node's values.
- [x] Graph resolution and persistence handle repeat targets, including pending/failed pattern maps, without stale output.
- [x] Existing scenes and composition artboards retain their behavior.
- [x] UI/graph/round-trip tests cover shared settings; real-render checks cover metallic lighting and representative surface modifiers across repeated copies. (UI/graph/persistence is covered; real-browser metallic-lighting check was unavailable here.)

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

- The repeat artboard resolves the same shared modifiers as scenes through `modifiersByScene`: shape, material, lighting, twist, etch, pattern and texture, with the last linked material/lighting/text winning and muted links ignored. The shape node is applied to the generated profile after its defaults, so it overrides them without changing the source node's values. Pattern maps use the existing pending/last-good-map behavior.
- Tests in `tests/components/repeatNode.test.ts` resolve every shared modifier for a repeat target, including muted links and a supplied pattern map; `tests/components/RepeatArtboard.test.tsx` links shape/material/lighting/twist/etch/texture/pattern nodes, checks shape override/mute fallback, material palette changes and surface modifier counts. Persistence tests include repeat-target links.
- Full suite `463 passed`; `npx tsc --noEmit -p tsconfig.app.json`, `npx tsc --noEmit -p tsconfig.test.json`, `npm run lint` and `npm run build` pass. Real-browser metallic-lighting visual checks were not available in this environment.

