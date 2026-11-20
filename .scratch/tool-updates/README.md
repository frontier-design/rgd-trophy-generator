# Tool updates — local issue tracker

[Canonical specification](spec.md) · [Tracker conventions](../../docs/agents/issue-tracker.md)

All seven implementation tickets are `ready-for-agent`. This means specified, not implemented; a ticket can start only when its blockers are complete. Initially, **01, 02, 03 and 05** are unblocked.

| Ticket | Delivers | Blocked by |
| --- | --- | --- |
| [01](issues/01-shape-node-editing.md) | Shape-node editing, inspector cleanup and 400 px top radius | None |
| [02](issues/02-repeat-raised-patterns.md) | Repeat + raised patterns and silent legacy conversion | None |
| [03](issues/03-indexeddb-image-assets.md) | IndexedDB image assets, 5000 px imports and portable save/open | None |
| [04](issues/04-pattern-crop-viewer.md) | Reversible crop viewer with bounded zoom/pan | 03 |
| [05](issues/05-centered-repeat-artboard.md) | Independent centered single-text repeat artboard | None |
| [06](issues/06-repeat-layout-export.md) | Repeat spacing/scale/offset and transparent PNG export | 05 |
| [07](issues/07-repeat-shared-modifiers.md) | Shared shape/material/surface modifiers on repeat artboards | 01, 05 |

## Working conventions

- Read the canonical spec and root glossary before starting; preserve unrelated existing changes.
- Claim eligible tickets with `Status: in-progress`; finish with `Status: done` and append a verification summary. Do not change other tickets merely to claim one.
- Keep the issue acceptance checkboxes and status current. Append questions/results under Comments.
- Tickets 02/04 and 05/06/07 may touch common code. Coordinate ownership or use separate worktrees; no blocker is implied solely by shared files.
- Each slice includes tests and persistence for its own demoable behavior. Completion of all slices also requires combined validation: cropped pattern → repeat trophies → save/open in a clean asset store → matching transparent PNG export.
- Run targeted tests per ticket and the full tests, typecheck, lint and build when integrated. Real-browser rendering/storage checks are required where test stubs cannot prove correctness.

## Deferred work

Other text alignments and asymmetric multi-text trophies are excluded. Explore asymmetric rendering only in a separate prototype environment, not in these tickets.
