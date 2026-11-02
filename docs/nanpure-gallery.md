# Personal galleries (Gallery 1)

The stable entry is `/nanpure/gallery/`. The main game home and the ready
collection link to it; `scripts/install-nanpure-gallery.mjs` keeps those entries
after future exports. Translated guides remain static and hand off to the game
with their existing language links. Existing immutable game release files are not changed.

One random gallery identity owns one room. The editor keeps it under
`np-gallery-key-v1`, independently of the cloud-backup service scheduled to end
on 2026-11-09. This is a browser identity, **not proof of one unique human**.
Transfer files carry the key and the draft; importing the same key on another
device opens the same room. Public share URLs contain only the public room ID.
No ChatGPT account, user email, IP or backup contents appear in the public room.

There are seven configurable slots (one featured, six regular), room title/bio,
three wall themes and three frames. Each selected item has a title/caption.
Saved puzzles, marked favorites, completed puzzles and earned titles are picked
from this origin's own browser data. IndexedDB is scanned in pages of 100;
compressed puzzle records use native deflate decoding with an output bound.
Unselected puzzles, videos, notes and transfer keys are never uploaded. Selected
problem geometry **and its solution** are public to enable the offline player;
they are not eligible for a tamper-proof competitive ranking.

Completion hooks record at most the latest 100 distinct puzzles locally. Existing
completed saves can also be selected after checking grid==solution and excluding
revealed/automatically completed games. Historical missing dates/hint counts stay
unknown. Displayed times use milliseconds; notebook elapsed seconds are converted.
All record cards explicitly say device records rather than server-certified ones.

Drafts persist on this browser before network saves. Public/private status only
changes when saved; unpublished rooms immediately return 404 to visitors. An
optimistic revision protects simultaneous editing. Loading a server version over
a changed draft first downloads the old draft; identity import downloads the old
transfer file before replacing the key. A user must retain the transfer file to
recover editing access after browser data is cleared.

`nanpure-api/src/gallery.js` serves the bounded JSON API. Ownership is unique on
a SHA-256 hash; raw keys are never stored in D1. Each room is limited to 256 KiB,
edits are rate-limited, and growing writes stop at 400 MiB database size when D1
provides the live size. Normal daily puzzles, ranking and cloud retirement keep
their existing API and behavior. Endpoint selection is site-owned config only.

Oracle Cloud Always Free is the authorized future migration target. The compatible
Node/SQLite server and cutover procedure are in `nanpure-api/oracle/`. This change
does **not** provision OCI, claim an automatic migration, start a monitoring task,
or enable a paid plan. OCI preparation remains dependent on the owner's account
and available Always Free capacity. The UI contains no provider selection.

Validation: API tests cover ownership isolation, privacy, explicit publication,
unpublication, concurrent saves, input limits, the 100x100 payload, capacity guard
and OCI persistence. Browser coverage is in `scripts/check-nanpure-gallery-browser.cjs`.
