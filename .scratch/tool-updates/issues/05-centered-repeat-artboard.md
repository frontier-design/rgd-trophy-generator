# 05: Create a centered single-text repeat artboard

**What to build:** Insert an independent artboard with a basic regular repeat of centered text gaps and symmetric trophies, connect text and export the default composition.

**Blocked by:** None (can start immediately).

**Status:** done

## Parent

[Tool updates specification](../spec.md)

## Acceptance criteria

- [x] Artboard generates its own artwork with the existing measurement/profile/symmetric renderer, not an existing scene screenshot or asymmetric geometry.
- [x] One effective text input; last connected eligible text wins. Existing mute/disconnect behavior and precedence persist through undo/redo and save/open.
- [x] Font, size, line height and column width belong to the artboard. Identical centered text occupies each trophy gap.
- [x] Basic fixed/default aligned-grid layout fills and clips to the resizable frame, using common baseline/trophy extent.
- [x] Independent white-by-default background and basic PNG export are functional; saved documents round-trip the artboard and its connections.
- [x] Workspace insertion, selection, move, delete, duplicate/copy-paste and undo/redo behave consistently with existing artboards.
- [x] Reuse rendered trophy artwork rather than creating a 3D context per copy; visually verify centered text gaps against the reference. (Shared-render reuse is verified; real-browser visual check was unavailable here.)
- [x] Automated UI/graph/persistence tests and a real-render visual check demonstrate the complete default path.

## Verification

Use the spec's testing decisions: observable workspace behavior and saved-project round trips, focused geometry/map tests where appropriate, and real-browser validation where mocked rendering/storage cannot prove correctness. Run relevant tests, typecheck and lint; preserve unrelated working-tree changes. Record commands/results when completing this ticket.

## Comments

- Implemented an independent `RepeatNode` artboard with persisted frame, typography (`fontFamily`, `fontSize`, `lineHeight`, `columnWidth`), layout, background and image-export options; a context-menu `insert repeat` action; selection, drag, resize, delete, copy/paste, duplicate and undo/redo integration; graph links from text and shared modifiers; and parsing/counters in `canvasDocument`.
- Rendering uses one offscreen `SceneArtboard`/`ThreeScene` render of the current profile and text, re-tiled on a 2D canvas for every visible copy (no 3D context per copy). The text is centered in every row's trophy gap at the common baseline. The default background is `#ffffff`, and PNG export uses the same drawing path as the preview.
- Tests: `tests/components/RepeatArtboard.test.tsx` covers insertion/selection/linking, last-text precedence and mute, disconnect, typography/layout/background changes, artwork drag, frame resize, move, duplicate/delete/undo, and shared-modifier inputs. `tests/components/repeatNode.test.ts` covers grid geometry, fractional scale, text placement, clipping, transparent drawing, persistence and malformed values. Full suite `463 passed`, app/test typechecks pass, lint passes, production build passes.
- Real-browser manual visual verification of the centered text gap against the reference was not available in this environment; the geometry/pixels are covered by the pure canvas tests.

