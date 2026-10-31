# Mixed-size multi Sudoku

Release 2026.11.01.66 adds per-board size selection after the existing shape selector. The free layout accepts 2–8 boards; each board chooses a size, an earlier parent board and one of the parent's four corners. Free connections share one physical cell. Layouts with unintended intersections are rejected before generation. Preset pairs share the common corner rectangle of their block dimensions; heterogeneous relays and samurai layouts use one shared corner cell.

The available sizes are 4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24 and 25. A board uses 1 through its own size. Shared cells use the intersection of the participating boards' number ranges. Each board records its size and rectangular block geometry. `p.n` is the maximum board size, and `multiVersion: 2` distinguishes this schema from existing version 1 saves.

The new engine is in `scripts/client-overrides/public/notebook/mixed-multi.js`. It keeps the original engine's version 1 APIs and validation. Version 2 uses variable-size units and per-cell domains for solution construction, logical grading, exact uniqueness verification, SVG rendering, progress sanitization and generation identity. The five grades retain the original deduction caps; all-4×4 combinations expose only the two basic grades. Generation never substitutes a lower grade. Every accepted puzzle must require shared information for at least one board.

`core-mixed-multi` is included after `generator-source` in the notebook and both worker loaders. The print document loads the same engine after `common.js`. The exporter preserves these entry points. Candidate memos, hints, video/completion groups, resume queues, backup/restore and print rendering use the version 2 geometry.

Run `node scripts/prepare-mixed-multi-release.mjs` to rebuild this release from the retained base. It preserves prior versioned directories. Run `node scripts/check-nanpure-mixed-multi.cjs` to verify all 15 sizes, all grades, preset and free layouts, direct per-board solution checks, exact uniqueness, no-guess solving, shared dependency, candidates, compressed backup/restore, A4 puzzle/answer output, resume identity and version 1 compatibility. The check is also part of the Pages workflow.

![Free layout size and connection controls](mixed-multi-preview.jpg)
