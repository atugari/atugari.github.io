# Exhibitions, solving replays and the home layout

This branch is an unpublished implementation for visual review. Do not merge or
deploy it until the user has reviewed the home and museum screenshots. No live
site, live D1 data, event announcement or scheduled task was changed.

## Experience

- `/nanpure/exhibitions/` is the event hall. The prepared first theme is cats,
  November 3–23, 2026 in Japan time. The dates and first theme remain reviewable.
  Dates are checked by the API. Closed events remain browsable without a cron job.
- A browser identity can submit up to three saved, publicly visible gallery
  puzzle slots. A submission keeps a snapshot. Gallery edits do not silently
  replace a submitted work. Unpublishing the source gallery hides its entries;
  withdrawing an entry also hides replays attached to that entry.
- Three reversible reactions use the existing random gallery identity. This
  deduplicates a browser token, not individual people. There is no popularity
  ranking and no free-form comment system.
- The event wall and personal gallery show one central work, with horizontal
  swipe, wheel, keyboard and explicit previous/next controls. Repeated renders
  keep the selected personal gallery position. Inactive gallery slots are inert.
- The desktop home groups play/create on the left and the event/gallery/replay
  entrances on the right. Mobile uses Play, Create, Exhibit tabs. Existing theme,
  title, help, ranking and support paths remain reachable; short screens use the
  existing menu for theme/title/support. The static search directory remains in
  the HTML fallback and is hidden while the interactive home is running.
- The new home shortcuts wait for the real notebook bridge to finish loading
  before opening pattern drawing or the existing create flow.

## Replays

`recorder.js` wraps the existing game hooks without replacing gameplay, hints,
save IDs, timer logic or ranking. It records numeric grid changes, erases and
undo results. Candidate notes and inferred thought processes are not recorded.
Recorded input order is not a claim that the solve was logical or unassisted.
Automatic/revealed completions are excluded. Daily answers are attached only
after a successful clear. An unfinished run can resume its existing journal
after a reload. Old play histories are never reconstructed.

The journal is separate from the cloud backup feature that ends November 9.
It keeps the latest 30 runs in `np-replay-journal-v1`. Embedded collection
players deliberately use their same-origin parent's journal, while puzzle saves
retain their existing independent storage scope. Partial recordings are labelled.
The publish screen lists completed, nontruncated recordings, supports seeking,
single steps, three playback speeds and up to 32 plain-text annotations.

Publishing explicitly confirms the puzzle, answer, input steps, annotations and
display name. The API checks givens, bounds, timestamps and the final grid; this
remains a device record, never a certified leaderboard result. Each replay is at
most 512 KiB and 16,000 steps. An identity can publish up to 50 active replays and
8 MiB total; database capacity writes stop at the existing 400 MiB guard. Removing
publication clears the server replay payload. Public URLs contain no edit key.
Published replays can also be attached to matching personal gallery works.

## Source and validation

The existing stable gallery entry loads the new feature modules. Published
immutable release files are not edited. `install-nanpure-gallery.mjs` refreshes
the stable entry cache version and its manifest hashes. Migration 0008 and API
1.9.0 are prepared, including the existing Oracle-compatible adapter; no Oracle
instance or automatic migration was provisioned.

Validation includes all 62 API tests, `check-community-recorder.cjs`, and manual
cloud-browser checks against the real Worker/SQLite in an isolated preview:
submission/readback, one-reaction toggles, single-step replay, annotation and
explicit publication/readback, gallery replay attachment and event badge,
actual one-cell clear -> saved one-step journal, and the direct pattern shortcut.
At 320×568, the home play and exhibit panels had no document overflow. The
390-pixel mobile and desktop layouts are captured for user review. This is not a
claim that all existing whole-site browser CI has run on this draft.

All preview works, names and timings are labelled samples. Preview fixtures,
database and HTTP-only compatibility shims are outside the production repository.
