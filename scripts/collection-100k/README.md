100,000 prepared numeric puzzles in a separate collection.

The public data excludes backup meta/local settings and batch tokens. Original imports are retained separately. The supplied validation checks solution/rule consistency; it does not independently re-solve uniqueness or regrade every puzzle. Configuration labels retain the source assessments. Ten duplicate fingerprints were skipped and 1,104 entries were trimmed from the largest configuration groups to preserve all 225 configurations.

The catalog is loaded first. Configuration indexes and checksummed compressed packs are loaded on demand; only three decoded packs remain in memory. Player storage reads the selected puzzle by uid without loading the complete played library. Progress is isolated from normal play and the 46-puzzle test.

Gesture handling listens for pointer endings outside the board and clears stale contacts at a fresh primary touch. Native phone touch delivery still requires device verification.

Build data: node scripts/collection-100k/build.cjs OUTPUT BACKUP1 BACKUP2 BACKUP3
The builder regenerates only data and catalog. UI sources are maintained in nanpure/collection.
