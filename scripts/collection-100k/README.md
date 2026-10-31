Prepared numeric puzzles in a separate collection, with immutable public IDs.

The public data excludes backup meta/local settings and batch tokens. Original imports are retained separately. The supplied validation checks solution/rule consistency; it does not independently re-solve uniqueness or regrade every puzzle. Configuration labels retain the source assessments. Ten duplicate fingerprints were skipped and 1,104 entries were trimmed from the largest configuration groups to preserve all 225 configurations.

The catalog is loaded first. Configuration indexes and checksummed compressed packs are loaded on demand; only three decoded packs remain in memory. Player storage reads the selected puzzle by uid without loading the complete played library. Progress is isolated from normal play and the 46-puzzle test.

Gesture handling listens for pointer endings outside the board and clears stale contacts at a fresh primary touch. Native phone touch delivery still requires device verification.

Initial build in an empty directory only:

    node scripts/collection-100k/build.cjs OUTPUT BACKUP1 BACKUP2 BACKUP3

Never run the initial builder over a published catalog. It refuses an existing catalog.
Append supplied normal boards without regenerating previous packs:

    python3 scripts/collection-100k/verify-backups.py --proof /private/proof.json BACKUP1 BACKUP2 BACKUP3
    node scripts/collection-100k/append.cjs --collection nanpure/collection --proof /private/proof.json --audit /private/aliases.json BACKUP1 BACKUP2 BACKUP3
    node scripts/prepare-pareasobi-move.mjs
    node scripts/collection-100k/check-append.cjs
    node --experimental-vm-modules scripts/collection-100k/check-filters.cjs

The independent C++17 verifier checks givens and solutions, reduces candidates by Sudoku constraints, then counts exact-cover solutions up to two. It does not search using the supplied answer or regrade difficulty. A search limit or any ambiguous/invalid board blocks importing the supplied batch. The proof binds the exact input bytes and verifier source. CI checks it against exhaustive 4×4 results and independently verifies every board in the latest appended segment.

Append scans and checksums every previous record, compares geometric board identities (including swapped rectangular blocks after rotation), and removes duplicates. New configuration segments receive new CIDs and ID ranges after the current total. Existing pack files, IDs, player UIDs, IndexedDB names and record formats remain intact. A logical configuration can have several immutable segments; filters and Next include all of them. Repeating the same import adds nothing. Original recovery metadata, local settings and batch tokens are not published. The private alias audit retains every original UID/ID, including duplicates, mapped to its public problem ID.

The 2026-10-31 append receives 4,620 boards from backups (11)–(13), keeps 4,619 after one duplicate, and adds 77 segments for 15 sizes. The old 100,000 records remain untouched. Total: 104,619, comprising 98,279 Sudoku boards and the unchanged 6,340 cross-balance boards. Source level labels are retained.

Metadata fallback copy and home search copy derive their counts from the catalog; UI sources remain in nanpure/collection. Large boards use the existing player, including its 100×100 block navigation, without copying the game engine.
