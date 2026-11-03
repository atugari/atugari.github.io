# Exhibition guidance preview — November 3, 2026

This follow-up is a private preview for the user's requested review before publication. The production home, API and immutable release assets are unchanged.

The submission dialog previews the selected saved puzzle, title and caption. Selecting a different work resets the publication confirmation checkbox. Loading, unpublished-gallery and empty-gallery states hide the submission fields and leave a clear route to prepare the gallery.

An empty replay library now explains play, annotation and optional publication. Its main action leads to the normal home when no exhibition work is selected, so an empty exhibition is not the only starting point. When opened for a particular exhibition work, the action returns to that exact work.

Validation: Node syntax check and git whitespace check; cloud-browser checks against the real Worker/SQLite with isolated sample data; selected-work preview changes and confirmation reset; a test submission and readback; generic and work-specific replay empty states; 360×740 and 320×568 layouts without horizontal overflow. No production records or sample works were created. Full regression CI runs separately on the draft PR.
