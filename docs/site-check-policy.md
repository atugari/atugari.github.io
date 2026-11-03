# Publication checks

Checks follow the semantic scope of each change. A new immutable release that copies the previous release does not by itself trigger every regression suite. Actual asset content is compared with the corresponding previous release; version references and the shell release feed are ignored only for this comparison. Asset hashes are still checked on every build.

Every update runs the site build, release integrity and public release policy checks, check-selection tests, generation-assistance unit tests, API tests, and a browser test using a real Worker and the shipped generator.

Additional checks run for affected areas:

- Notebook interface or shared client changes: notebook unit and browser checks.
- Wado or dictionary changes: Wado client checks, vocabulary review and browser/PDF verification.
- Puzzle collection changes: collection entry/filter checks and puzzle uniqueness verification.
- Learning data changes: learning-data checks.
- Shared theme or language tooling: notebook, Wado and learning checks.
- Unknown changes, missing comparison data or detection failure: the complete suite.

GitHub Actions can also run the complete suite explicitly through **Run workflow → full_check**. A failed required check blocks publication. An unrelated skipped Wado job does not block a successful build.
