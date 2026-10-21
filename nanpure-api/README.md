# Nanpure Cloudflare API

GitHub Pages client: https://atugari.github.io/nanpure/
API: https://puzzle-api.puzzle-hub-4826.workers.dev/

## Deployment

The main branch workflow uses the repository secret `CLOUDFLARE_API_TOKEN`
(Workers Scripts Write and D1 Write, scoped to this Cloudflare account).
It runs the tests, applies additive D1 migrations, deploys, generates 21 days
of daily puzzles, and verifies the public menu. Twice-daily Actions runs replenish
inventory and remove expired upload reservations. Generation runs on the runner;
future solutions are sent directly to D1 and never committed, logged or uploaded
as artifacts. Assignments have unique canonical fingerprints and immutable slots.

## Identity and private data

Cross-origin API calls use random 256-bit device credentials in headers, not
third-party cookies. Only their SHA-256-derived identifiers are stored in D1.
Cloud backups use a separate transferable sync key, 128 KiB chunks, a 20 MiB
per-save limit, a 200 MiB aggregate reservation limit and optimistic revisions.
No R2 activation or paid plan is required. Incomplete uploads expire after an hour
and the twice-daily job removes them. Receipt keys and owner credentials are never
included in public bundles. Only a hash of the random owner key is configured.
The owner-only import endpoint accepts bounded records, never arbitrary SQL.

Keep the private owner access file outside this public repository. Neither
Cloudflare's deployment token nor the owner key belongs in browser source.

## Tests

`npm run build` uses Node 22+ with real SQLite for daily ranking eligibility,
concurrent backup revisions, private receipts, owner authorization and CORS.
Production smoke tests must use disposable credentials and avoid public rankings.
