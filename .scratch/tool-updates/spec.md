# Node-driven shapes, cropped patterns and repeat artboards

**Status:** ready-for-agent

Published to the configured local Markdown tracker. The user approved writing the proposed tickets; this spec and its testing approach accompany those tickets.

## Problem Statement

Shape and material controls are split between inspector and node workflows. The top-radius limit restricts profile editing. Pattern controls expose unnecessary generation modes and styles, while uploaded images cannot be cropped or inspected effectively and are constrained by localStorage capacity. Users also need a repeat composition with centered text between symmetric trophies, rather than a tiled screenshot of the current scene layout.

## Solution

Move profile editing into a shape node and use the existing material node for material overrides, preserving current defaults and saved fallback appearances. Simplify patterns to repeat mode and raised relief, provide a reversible crop viewer, and store larger imported images in IndexedDB. Add an independent repeat artboard driven by text and shared modifier nodes, with centered text gaps, symmetric trophies, adjustable grid layout and PNG export.

## User Stories

1. As a designer, I want current default trophies to retain their appearance, so that the update does not change my starting point.
2. As a designer, I want to insert and connect a shape node, so that profile editing follows the node workflow.
3. As a designer, I want shape and material editing removed from the scene inspector, so that there is one clear place for those overrides.
4. As a designer, I want a top-radius maximum of 400 px, so that I can make larger curves without invalid geometry.
5. As a designer, I want profile controls for top rounding/taper, line boxes, joins and bottom overshoot, so that I can control the complete profile.
6. As a returning user, I want saved scene shape/material values retained as disconnected fallbacks, so that existing artwork is preserved except for the explicitly requested pattern conversion.
7. As a designer, I want disconnecting a shape/material node to restore the scene fallback, so that overrides remain reversible.
8. As a designer, I want patterns to use repeat mode and raised relief without mode/style selectors, so that the panel is simpler.
9. As a returning user, I want old projects to open with patterns silently converted to repeat + raised, so that I do not manage obsolete modes.
10. As a designer, I want to inspect the uploaded source image, so that I can choose the ornament region I need.
11. As a designer, I want a freely resizable rectangular crop with edge and corner handles, so that I can isolate any aspect ratio.
12. As a designer, I want to drag the crop inside the image, so that I can reposition it without resizing.
13. As a designer, I want zoom and pan independent of the workspace, so that inspecting an image does not move my canvas.
14. As a designer, I want zoom from fit-to-view through 8× fit and a reset action, so that navigation stays bounded and recoverable.
15. As a designer, I want crop changes to affect the actual pattern, so that the viewer selection matches the trophy ornament.
16. As a designer, I want the imported source preserved separately from the crop, so that cropping is reversible.
17. As a designer, I want undo/redo and save/open to preserve crop edits, so that work survives normal editing and reloads.
18. As a designer, I want loading another image to reset the crop, so that old coordinates do not unexpectedly cut the new image.
19. As a designer, I want imports up to 5000 px on their longest edge, so that I retain more source detail.
20. As a designer, I want image assets stored in IndexedDB, so that large images do not consume the small localStorage image budget.
21. As a returning user, I want old embedded images and localStorage image references to remain usable, so that the storage migration does not lose artwork.
22. As a designer, I want project files to contain their images, so that another browser can open the complete project.
23. As a designer, I want storage/export failures reported honestly, so that I do not mistake an incomplete project for a successful save.
24. As a designer, I want an independent repeat artboard accepting node inputs, so that I can compose trophies without creating a source scene.
25. As a designer, I want the last connected text node to supply the wording, so that multiple connections have predictable precedence.
26. As a designer, I want typography controls on the repeat artboard, so that font, size, line height and column width are consistent throughout the repeat.
27. As a designer, I want centered copies of the text between symmetric trophies, so that the layout differs from the existing scene composition while retaining the current renderer.
28. As a designer, I want shared shape, material, lighting and surface modifiers, so that every repeated trophy has the same look.
29. As a designer, I want tile scale, X/Y spacing and X/Y offset, so that I can control density and framing.
30. As a designer, I want negative spacing and drag-to-offset, so that I can overlap artwork and reposition the grid directly.
31. As a designer, I want copies to fill a resizable frame and clip at its edges, so that the composition is ready for the required output size.
32. As a designer, I want aligned rows without staggering, so that the repeated composition remains regular.
33. As a designer, I want a white-by-default independent background and transparent PNG export, so that I can use the result on different surfaces.
34. As a designer, I want PNG export to match the visible frame, so that cropping, offsets, modifiers and typography remain consistent.
35. As a designer, I want repeat artboards and their connections included in workspace editing and persistence, so that undo/redo, duplication and project transfers behave like existing nodes.

## Implementation Decisions

- Reuse the current measurement, profile and symmetric trophy rendering pipeline. The repeat artboard generates artwork from its own typography and connected modifiers, not a live scene screenshot. Its centered text-gap composition must be visually verified against the supplied reference.
- Use one effective text input. Existing ordered-link precedence is prior art: the last connected eligible text wins. Maintain deterministic precedence across reconnect, undo/redo and project round trips; respect existing link mute behavior. Multiple-text sequences and asymmetric silhouettes are superseded decisions, not requirements.
- Add a persisted shape modifier with top rounding/radius/taper, line-box padding/radius, join smoothing/radius and bottom overshoot. Connected shape settings override the saved fallback without destroying it. Preserve existing material/lighting precedence and current default appearance. Resolve any overlap with master-owned settings explicitly in favor of the agreed shape-node controls while preserving legacy fallback behavior.
- Raise the top-radius UI maximum to 400 px, keeping the geometric clamp and default unchanged. Keep typography, frame, export and view controls outside the shape node.
- Normalize loaded pattern settings to repeat mode and raised style without confirmation or legacy UI. Retain other valid pattern settings and image content. Remove generation-only fields from the panel; internal cleanup must not break document parsing.
- Store an imported source asset and normalized crop rectangle separately. Missing crops default to the full image. Clamp crop edits to image bounds and ensure nonzero dimensions; replacement resets the crop. Viewer zoom/pan are not destructive image edits.
- Import images without upscaling and with a 5000 px maximum long edge. Preserve the imported source, not an unlimited-resolution original. Encoding format/quality may follow existing behavior unless profiling justifies a change.
- Move image asset persistence to IndexedDB. LocalStorage may continue holding lightweight workspace documents and preferences; this is not a request to move all state to IndexedDB.
- Support migration from embedded data URLs and existing localStorage asset references. Commit durable assets before publishing document references, and do not delete the only legacy copy before migration succeeds. Hydrate referenced assets asynchronously before dependent rendering/export; surface failures.
- Keep portable project files self-contained. Manual save/open must wait for required asset reads/writes and pending state. Preserve cross-tab conflict protection and honest autosave status while introducing asynchronous operations.
- Include the crop in pattern-map invalidation. Viewer-only changes must not rebuild patterns. Preserve debounce/latest-result behavior; prevent stale async results from replacing newer crops or assets. Bound working resolution separately from the 5000 px stored source to avoid unnecessary memory and processing costs.
- Repeat layout uses a regular grid with proportional tile scale, independent X/Y spacing and X/Y offset. Negative gaps are permitted, but repeat pitch must remain positive. Generate only visible copies plus those needed to cover clipped edges; avoid one 3D context per copy.
- Each row repeats the same one-text composition. Use a shared baseline grid and common trophy extent; do not stretch text vertically. Text is centered only; expose no alternate-alignment selector yet.
- Repeat artwork has transparent surroundings. Fill the artboard once with its independent background, white by default, and omit that fill for transparent PNG export.
- Persist repeat frame, typography, layout, background and connections. Fit insertion, selection, movement, resizing, deletion, copy/paste, undo/redo and clusters into existing workspace conventions where applicable.
- No new backend server is required. IndexedDB is browser-local storage, not remote hosting.

## Testing Decisions

**Test seams:**

- Prefer the existing workspace UI integration seam: insert nodes, connect them, edit accessible controls, and observe resolved artwork, undo and project round trips. Extend the existing canvas-page, linked-text, composition-graph and modifier interaction test patterns rather than testing component internals.
- Use the existing project persistence boundary for image migration, reload, portable save/open, pending writes, missing assets and storage failures. Exercise a browser-compatible IndexedDB test adapter and include real-browser verification for actual storage lifecycle; do not treat in-memory mocks as proof of durability.
- Extend the existing pattern-map hook tests to assert crop-dependent output/invalidation, no rebuild on viewer-only changes and rejection of stale results. Add focused pure geometry tests for crop bounds and repeat coverage where UI assertions would be less precise.
- Existing tests stub 3D rendering, so they cannot establish visual correctness. Add real-browser/manual or automated image-based checks for centered text gaps, symmetric silhouettes, modifier consistency and preview/PNG parity, including overlapped copies, edge clipping and transparency. Record the checked scenarios and outputs.
- Good tests assert observable behavior and persistence contracts, not private helper names, component structure or a chosen rendering technique.
- Validate legacy project normalization and migration, default appearance, saved fallback restoration, deterministic last-text precedence and malformed/missing saved fields.
- Run targeted tests during each slice, then the complete test suite, typecheck, lint and production build. Do not overwrite unrelated user changes or regenerate tracked output unnecessarily.

## Out of Scope

- Asymmetric trophies or new geometry algorithms; investigate those only as a separate prototype in a separate environment.
- Multiple effective text inputs, alternating sequences and text reorder lists.
- Right-aligned or other text alignment modes; record them as future enhancements.
- Staggered rows, arbitrary per-copy material/modifier settings and animation/video controls for the repeat artboard.
- Remote image hosting, server-side storage or sync across devices.
- Retaining original files above the agreed 5000 px import limit or automatically upgrading detail lost by older imports.
- Legacy generation/style editing UI or opt-in conversion notices.

## Further Notes

The final submitted Markdown answers override earlier exploratory decisions. In particular, one effective text and the existing symmetric renderer replace the multi-text/asymmetric proposal; 400 px replaces the suggested 1000 px radius; IndexedDB/5000 px replace localStorage/2048 px imports; silent conversion replaces legacy-mode preservation.

The configured tracker is local Markdown. The canonical specification is `.scratch/tool-updates/spec.md`, with implementation issues under that feature's `issues/` directory. Ticket creation does not mean implementation is complete.
