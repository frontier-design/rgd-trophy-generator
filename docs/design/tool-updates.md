# Tool updates — agreed design

Design interview decisions, including the submitted Markdown canvas answers. This document describes intended behavior, not completed implementation. Preserve the pre-existing working-tree changes.

## Shape and material nodes

- Keep the current default trophy/profile appearance.
- Remove shape and material editing from the scene inspector. Material already has a modifier node; add a shape node.
- Shape node owns profile geometry: top rounding/radius/taper, line-box padding/radius, join smoothing/radius, and bottom overshoot.
- Keep typography, frame, export and view controls on the artboard.
- Raise the top-radius UI maximum from 200 to **400 px**, not the previously suggested 1000 px. Preserve the default and geometry safety cap.
- Existing saved per-scene shape/material values remain the fallback with no corresponding node connected. Connecting a node overrides those values; disconnecting restores the fallback. New scenes retain current defaults. Do not automatically add nodes to old workspaces.

## Pattern simplification

- Only repeat mode and raised style remain; remove mode/style selectors and generation-only controls.
- Old projects open successfully but **silently convert to repeat + raised**, even if their appearance changes. No legacy notice or explicit conversion action is needed.

## Pattern image viewer and crop

- Show the imported source image with a freely resizable rectangular crop, without a fixed aspect ratio.
- Corner/edge handles resize; dragging moves the crop. Keep the crop inside the image. Default to the whole image.
- Viewer zoom changes magnification only, not the selected image pixels.
- Minimum zoom fits the entire image; maximum zoom is 8× the fit scale. Provide zoom in/out, reset-to-fit, and panning while zoomed.
- Viewer gestures must not pan/zoom the workspace canvas.
- Keep the imported source and normalized crop coordinates separately, so cropping is reversible. Only the crop is used for the pattern.
- Save/open and undo/redo preserve crop edits. Replacing an image resets its crop to the whole new image.
- **Use IndexedDB for image storage and increase the imported-image maximum long edge to 5000 px.** This overrides the unchanged 2048 px limit in the prefilled answer. Do not upscale smaller images.
- Preserve portable project files: image content must travel with the project rather than depending on browser-local image IDs.

## Repeat artboard

### Inputs and rendering

- Generates its own artwork from node inputs; it is not a tiled screenshot of an existing scene.
- **Use the current trophy rendering algorithm. No asymmetric trophy geometry in this implementation.**
- Accept one effective text input. If multiple text nodes are connected, **the last connected text wins**.
- Earlier decisions about alternating multiple texts, reorderable text lists and neighboring texts shaping different sides of a trophy are **superseded**.
- Center text between trophies. No alignment selector initially; other alignments are a future enhancement.
- The repeated identical text shapes symmetric trophy profiles using the current renderer.
- Typography belongs to the repeat artboard: font, size, line height and text-column width. The text node supplies wording only.
- Material, shape and surface modifiers (pattern, twist, etch, texture and lighting) apply uniformly to all repeated trophies.

### Layout and export

- Aligned two-dimensional grid, not staggered rows or horizontal-only repetition.
- Controls: tile scale, X/Y spacing and overall X/Y offset. Copies automatically fill the frame. Negative spacing permits overlap; keep repeat pitch positive.
- Dragging the artwork changes the overall grid offset. Clip copies at the artboard edges.
- Each row repeats the same layout without stagger or sequence shifts.
- Keep a shared top edge/baseline grid and common trophy top/bottom extent; do not vertically stretch text. The earlier different-text-length comparison is no longer relevant with one effective input.
- Render artwork with transparent surroundings so the artboard supplies a single background, rather than opaque tile rectangles obscuring neighboring copies.
- Independent background color, white by default; support transparent PNG export.
- Retain a freely resizable artboard frame and PNG export matching the visible frame. Persist settings and connections in autosave and portable project files.
- No animation/video controls in the initial version.

## Deferred

- Additional repeat-text alignments, including right-aligned text.
- Prototype asymmetric trophies driven by different neighboring texts **in a separate experimental environment**, not as part of this implementation. Multiple text sequences and their ordering UI are out of current scope.

## Implementation investigations (not additional product decisions)

- Determine how the existing symmetric renderer and scene-layout helpers can produce the centered text-gap repeat composition without introducing a new trophy geometry algorithm.
- IndexedDB requires async asset hydration/saving, migration of existing localStorage image references and embedded images, and export that waits for image content. Ensure storage failures are surfaced rather than allowing false save-success or broken portable files.
- Keep 5000 px imported sources separate from bounded pattern-processing resolution; assess memory use and worker cancellation. Larger imported images should not automatically imply full-resolution pattern generation on every interaction.
- Define deterministic connection ordering for last-connected-wins, including disconnect, undo/redo, copy/paste and save/open.
- Test existing-document conversion, shape/material fallback, crop geometry and persistence, storage migration, repeat layout and preview/export parity.

## Current code landmarks

- `src/components/CanvasPage/CanvasPage.tsx`: workspace orchestration, inspector, insert/connect behavior and artboard integration.
- `src/components/CanvasPage/graph.ts`: modifier resolution.
- `src/components/CanvasPage/CanvasComposition.tsx`: existing composition frame, image move/resize and PNG export.
- `src/components/CanvasPage/compositionNode.ts`: composition data and geometry helpers.
- `src/components/CanvasPage/PatternFields.tsx`: pattern controls and upload action.
- `src/components/CanvasPage/patternImage.ts`: currently imports images at a 2048 px maximum long edge as WebP data URLs (PNG fallback).
- `src/components/CanvasPage/canvasDocument.ts` and `src/state/persist.ts`: currently store image content separately in localStorage; project-file export embeds content. This is the existing behavior, not the proposed IndexedDB backend.
- `src/components/ControlPanel/ControlPanel.tsx`: existing profile controls and 200 px top-radius limit.

## Decision history

- Initial interactive wave: transparent whole-scene tiles in an aligned grid.
- Chat clarification: independent repeat generator, centered gap typography, shared typography/modifiers; multiple-text/asymmetric design explored.
- Final Markdown submission: simplify to one effective text (last connected wins), retain current rendering, defer asymmetric rendering to a separate prototype; use IndexedDB and 5000 px imports; silently convert old patterns; set radius maximum to 400 px. Final submission takes precedence over earlier exploratory answers.
