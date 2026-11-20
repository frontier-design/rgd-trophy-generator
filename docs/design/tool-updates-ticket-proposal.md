# Tool updates — proposed tracer-bullet tickets

**Status:** Approved and published as seven separate local Markdown issues under `.scratch/tool-updates/issues/`. This document is the historical proposal, not the issue tracker. Use the canonical spec and issue files in `.scratch/tool-updates/`; the approval questions below are retained as proposal history.

Each slice includes the saved-data, UI, rendering and tests needed to demonstrate its own behavior. No standalone schema-only or helper-only tickets are proposed. Small prefactors belong inside the slice that first needs them; no wide refactor has been shown necessary.

## 1. Edit scene profiles through shape nodes

**Blocked by:** None.

**What it delivers:** Insert/connect a shape node, change a scene's profile and restore its saved fallback when disconnected; material editing also leaves the inspector.

### Acceptance criteria

- Shape controls cover top rounding/radius/taper, line boxes, join smoothing/radius and overshoot.
- Top-radius maximum is 400 px; current defaults and geometric safety caps remain unchanged.
- Shape and material editing are absent from the scene inspector; existing material nodes remain usable.
- Connected node overrides do not overwrite saved per-scene fallbacks. Disconnecting restores them; old documents do not gain automatic nodes.
- Reconcile overlapping master controls so the new shape node actually controls the advertised fields without silently changing default/legacy output.
- Node insertion/linking/muting, deletion, undo/redo, duplication and save/open follow existing workspace behavior.
- Workspace/graph and document round-trip tests cover overrides, fallback restoration and unchanged defaults.

## 2. Simplify all patterns to repeat + raised

**Blocked by:** None.

**What it delivers:** A simpler pattern panel with no generation or style selection, including for reopened old work.

### Acceptance criteria

- New and loaded patterns use repeat mode and raised relief.
- Remove mode/style selectors, seed actions and generation-only controls; keep repeat-relevant controls.
- Old generate/image and non-raised settings silently normalize while preserving image content and other valid settings.
- No legacy notice or conversion button appears.
- Existing valid projects still load and round-trip; tests cover normalization and retained controls.

## 3. Import, reopen and port 5000 px image assets using IndexedDB

**Blocked by:** None.

**What it delivers:** Upload a larger pattern image, reload it durably, and save/open a portable project without depending on localStorage image capacity.

### Acceptance criteria

- Imported images retain at most 5000 px on the longest edge, preserve proportions and are never upscaled.
- Assets use IndexedDB; lightweight workspace storage may remain in localStorage.
- Previously embedded images and localStorage asset references still open and migrate without deleting their only durable copy prematurely.
- Asset hydration, autosave ordering and manual save/open await required work; no successful save is reported with unresolved/missing assets.
- Portable project exports embed their image content and open in a clean browser store.
- Storage failures/missing assets are surfaced; cross-tab conflict protection remains intact.
- Pattern processing stays bounded rather than blindly processing every source at full 5000 px resolution.
- Persistence tests cover migration, async ordering, failure, round-trip portability and shared asset use. Include a real-browser storage lifecycle check.

## 4. Crop pattern sources in a bounded image viewer

**Blocked by:** 3 — durable source assets and async image lifecycle.

**What it delivers:** Inspect an imported image, select a reversible crop and see only that region used for the trophy pattern.

### Acceptance criteria

- Viewer shows the source and full-image default crop, with freely resizable corner/edge handles and drag-to-move.
- Crop is nonzero, constrained inside the image and stored as normalized coordinates separately from the source.
- Zoom spans fit through 8× fit; zoom controls, fit reset and panning work without moving the workspace.
- Zoom/pan do not alter the crop or rebuild the pattern; crop changes do rebuild it, with latest-result protection.
- Replacing the source resets the crop. Undo/redo, autosave and portable save/open preserve crop edits and source content.
- Tests cover crop bounds, interaction at different zoom levels, map invalidation, stale jobs and round trips.

## 5. Create a centered single-text repeat artboard

**Blocked by:** None.

**What it delivers:** Insert an independent artboard with a basic regular repeat of centered text gaps and symmetric trophies, connect text and export the default composition.

### Acceptance criteria

- Artboard generates its own artwork with the existing measurement/profile/symmetric renderer, not an existing scene screenshot or asymmetric geometry.
- One effective text input; last connected eligible text wins. Existing mute/disconnect behavior and precedence persist through undo/redo and save/open.
- Font, size, line height and column width belong to the artboard. Identical centered text occupies each trophy gap.
- Basic fixed/default aligned-grid layout fills and clips to the resizable frame, using common baseline/trophy extent.
- Independent white-by-default background and basic PNG export are functional; saved documents round-trip the artboard and its connections.
- Workspace insertion, selection, move, delete, duplicate/copy-paste and undo/redo behave consistently with existing artboards.
- Reuse rendered trophy artwork rather than creating a 3D context per copy; visually verify centered text gaps against the reference.
- Automated UI/graph/persistence tests and a real-render visual check demonstrate the complete default path.

## 6. Control repeat spacing, offset and transparent export

**Blocked by:** 5 — working repeat artboard.

**What it delivers:** Adjust repeat density and framing interactively and export exactly that composition.

### Acceptance criteria

- Tile scale preserves proportions; independent X/Y spacing and X/Y offsets update the composition.
- Negative spacing permits overlap but repeat pitch stays positive, including malformed loaded values.
- Dragging artwork adjusts overall offset correctly at workspace zoom levels.
- Aligned rows use the same one-text layout; copies cover the visible frame and clip at all edges without unbounded instance generation.
- Background color control and transparent PNG export match the preview's artwork placement and frame size.
- Settings survive undo/redo, resize and project round trips.
- Geometry/UI tests cover fractional scale, overlap, large offsets and edge clipping; real-render checks establish preview/export parity and transparency.

## 7. Apply shared modifier nodes to repeat artboards

**Blocked by:** 1 — shape node contract; 5 — working repeat artboard.

**What it delivers:** Shape, material, lighting, pattern, twist, etch and texture nodes change every repeated trophy consistently.

### Acceptance criteria

- Repeat artboard accepts the shared modifier inputs supported by ordinary scenes, including the new shape node.
- All repeated trophies use the same resolved settings and existing modifier precedence/mute behavior; no per-copy overrides.
- Input edits, disconnect, deletion and undo update the repeated artwork and exports without changing the source node's values.
- Graph resolution and persistence handle repeat targets, including pending/failed pattern maps, without stale output.
- Existing scenes and composition artboards retain their behavior.
- UI/graph/round-trip tests cover shared settings; real-render checks cover metallic lighting and representative surface modifiers across repeated copies.

## Dependency frontier

- Can start immediately: **1, 2, 3, 5**.
- **4** follows **3**.
- **6** follows **5**.
- **7** follows **1 and 5**.

Tickets 2 and 4 may edit the same panel; coordinate implementation, but this is not a logical blocking edge. Ticket 7 must support the current pattern contract without waiting on cropping. Once all slices land, run the full suite/typecheck/lint/build and combined browser scenarios, including cropped pattern → repeated trophies → portable save/open → transparent PNG export.

## Approval requested

- Are the proposed test seams appropriate: workspace UI integration and project persistence, focused map/geometry checks, plus real-render visual validation?
- Is the ticket granularity right, or should any slices be merged/split?
- Are the blocking edges correct and minimal?
- Which tracker should receive the approved spec and tickets? Configure via `/setup-matt-pocock-skills`.
