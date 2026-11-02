# Gallery backend on Oracle Cloud Always Free

The live default remains the existing Workers/D1 API. No OCI VM or paid resource
is provisioned by this change. Use an available **Always Free eligible** VM only.
The OCI account, free capacity, DNS and TLS still need to be prepared by the owner.

The gallery format and API are identical on Workers and this Node/SQLite adapter.
Install Node 22.16+ (24 LTS recommended). Run from the repository root:

```
GALLERY_DB=/var/lib/nanpure/gallery.sqlite node nanpure-api/oracle/server.mjs
```

Use a process supervisor and an HTTPS reverse proxy to 127.0.0.1:8787. The server
does not listen on public interfaces and only serves `/api/gallery` and
`/api/health`; the game remains on GitHub Pages. Do not expose SQLite, backups or
the repository as web files. Keep the trusted site origin in `src/http.js`.

Before changing `nanpure/gallery/config.js`:

1. Measure actual account request/row quotas and this D1 database's size. At 80%
   prepare the OCI target. The Workers gallery refuses *growing* saves from
   400 MiB of database use, while preserving reads and smaller/unpublishing edits.
   This guard does not automatically migrate anything.
2. Back up D1 and export the `galleries` table with the installed Wrangler:
   `npx wrangler d1 export puzzle-db --remote --table galleries --output gallery.sql`.
   Temporarily freeze gallery edits during the final export/cutover; do not use
   two writable authorities. Keep the source data and backup until verified.
3. Import the export into a new SQLite database before first adapter startup
   (`sqlite3 /var/lib/nanpure/gallery.sqlite < gallery.sql`). The additive
   migrations create the remaining API tables. Restrict file permissions.
4. Verify owner authentication, public/private rooms, revision conflicts, an
   old public URL and recovery-file ownership on the HTTPS target. Gallery IDs,
   owner **hashes** and revisions must be preserved. Do not rotate/translate keys.
5. Change only `NPGalleryConfig.apiOrigin` to the verified HTTPS target and publish
   the client. Existing share links and recovery files stay valid. Do not change
   the API origin used by daily puzzles, rankings or retiring cloud backups.
6. Keep routine encrypted/off-host backups. Always Free capacity and idle VM
   reclamation are provider constraints; a free VM is not a permanent backup.

Rollback while edits are frozen: restore the previous `config.js`. If OCI has
accepted edits, export and reconcile those newer revisions **before** rollback.
Never silently overwrite newer rooms with an older D1 snapshot. Rate-limit rows
are transient; a supervisor may prune expired `rate_limits` separately.

The viewer never chooses a backend from query strings or browser storage. In
particular, never send `X-Gallery-Key` to a user-supplied URL.
