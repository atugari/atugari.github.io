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

## Cloud storage retirement

Cloud storage ends for **all users at 2026-11-09 00:00 Asia/Tokyo**
(2026-11-08 15:00 UTC). Saves and restores remain available until then;
re-saving never extends this shared date. The public cloud screen and guide
instruct users to restore needed backups and export a transfer file beforehand.
Local puzzles, progress, files, daily puzzles, rankings and inquiries remain.

At the deadline the server rejects every cloud operation with HTTP 410 and the
client removes the cloud controls. A native daily 15:00 UTC Cron Trigger deletes
all cloud saves, uploaded chunks, upload reservations and cloud rate-limit keys.
The same transactional deletion runs on any post-deadline cloud request; the
existing twice-daily refill job is an independent cleanup fallback. All cleanup
paths check the shared server deadline and are safe to rerun. Empty legacy tables
remain for schema compatibility. No cloud data is deleted before the deadline.

## Identity and private data

Cross-origin API calls use random 256-bit device credentials in headers, not
third-party cookies. Only their SHA-256-derived identifiers are stored in D1.
Cloud backups use a separate transferable sync key, 128 KiB chunks, a 5 MiB
per-save limit, a 200 MiB aggregate reservation limit and optimistic revisions.
Each save ID can complete three saves per Japanese calendar day. The same
transfer code shares its allowance across devices; unrelated codes on a shared
school or household IP are independent. Active uploads reserve daily slots
atomically, successful commits consume them once, and cancellation or expiry
releases the reservation. Rejected size, capacity and revision checks do not
consume an allowance. The initial upload's Japan date determines its daily slot,
including a completion just after midnight. Existing larger backups remain
readable. GET metadata includes the limit, completed/reserved/remaining counts
and the next Japanese midnight. Daily counts reuse the existing bounded,
expiring rate-limit table, so no new database migration is needed.
Question generation, local storage, printing and transfer-file export remain
client-side and are not counted against this cloud allowance.
No R2 activation or paid plan is required. Incomplete uploads expire after an hour
and the twice-daily job removes them. Receipt keys and owner credentials are never
included in public bundles. Only a hash of the random owner key is configured.
The owner-only import endpoint accepts bounded records, never arbitrary SQL.

Keep the private owner access file outside this public repository. Neither
Cloudflare's deployment token nor the owner key belongs in browser source.

## Author app and monitoring

`GET /api/owner/overview` uses the existing owner bearer key. It returns site/API
versions, 30 days of visit totals, inquiry status counts, contiguous daily-puzzle
inventory, backup reservations, and provider usage. It does not return inquiry
messages, visitor identifiers, future puzzle answers, or backup contents. The
unchanged owner-only `GET /api/admin` supplies inquiry details for the app. Owner
responses and public health checks use `Cache-Control: no-store`.

`POST /api/visits` accepts exactly `{visitor, session}`, each a random 64-character
lowercase hex token. The site rotates the browser token daily, sends one session
visit at startup, and respects Do Not Track / Global Privacy Control. Japan time
defines a visit day. The API hashes both tokens with that day, deduplicates each
session transactionally, and limits new visits to 120 per IP-derived hash per
hour. It stores no IP address, referrer, player identity, or device details in
the visit tables. Browser counts are approximate, not a count of people; data
only exists after collection begins. A scheduled job deletes pseudonym records
whose Japan date is more than 35 days old. Daily totals remain; scheduled-job
delays can postpone deletion. Existing rate-limit expiry cleanup runs with the
twice-daily refill job.

The separate `nanpure-owner-metrics.yml` workflow attempts a private usage
snapshot every 30 minutes without generating puzzles. GitHub schedules can be
delayed. Only sanitized numeric results enter D1. Unavailable readings stay
`null`, never zero; retained old values are explicitly marked stale. Values
older than two hours or from the previous UTC quota day are also stale.

The snapshot tries the existing deployment token. GraphQL analytics requires
**Account / Account Analytics / Read**, which is not part of the usual deployment
permissions. To enable those readings, add an optional repository secret
`CLOUDFLARE_ANALYTICS_TOKEN` containing an account-scoped read-only analytics
token. No broader deployment access or app-bundled Cloudflare credential is
needed. If that secret is absent or access fails, the author app provides the
Cloudflare dashboard link and labels the missing measurements. D1 capacity uses
the existing D1 permission and the Worker can read its own current database size
from D1 query metadata.

Free-plan reference limits (checked 2026-10-22):

| Metric ID | Scope | Reference allowance |
| --- | --- | --- |
| `workersRequests` | All Workers in this account | 100,000 requests per UTC day |
| `d1RowsRead` | All D1 databases in this account | 5,000,000 rows per UTC day |
| `d1RowsWritten` | All D1 databases in this account | 100,000 rows per UTC day |
| `d1StorageBytes` | All D1 databases in this account | 5 GB |
| `d1DatabaseBytes` | This database only | 500 MB |

Daily provider allowances reset at 00:00 UTC (09:00 Japan time), independently
of visitor-day totals. Limits are references, not an assertion about the current
subscription. An incomplete account database listing is not shown as a full
account total. See the official [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/), and
[analytics token permissions](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/).

## Tests

`npm run build` uses Node 22+ with real SQLite for daily ranking eligibility,
concurrent backup revisions, private receipts, owner authorization, visit
deduplication/privacy, monitoring aggregates, provider failures and CORS.
Provider tests use fake credentials and mock responses. Deployment smoke checks
verify live versions/schema and that owner endpoints reject unauthenticated
requests; they do not retrieve private inquiries or production credentials.
Production smoke tests must use disposable credentials and avoid public rankings.

## Retired network search

The Wado network-search integration was removed in 2026.10.24.51. The former endpoint returns HTTP 410 before any database or provider work. No search provider, key or search budget is used. Current Wado play and print pages use only the bundled dictionaries and hints.

## Automatic enrollment for the private Xperia fleet

The isolated vending pilot can provision a separate worker credential for each
installation of one private APK. Apply the additive
`0015_vending_enrollment.sql` migration to that pilot's existing D1 database
before updating its Worker. Existing devices, pair codes, jobs, orders and stock
are retained. The default `wrangler.jsonc` and main-branch workflow still target
the production API; they are not the pilot deployment configuration.

The owner creates a bounded enrollment capability through
`POST /api/vending/admin`, using the existing owner bearer authentication and
allowed Origin. Generate a fresh random 256-bit `enrollmentKey` and persist it
privately **before** sending this request:

```json
{
  "action": "enrollment_create",
  "enrollmentKey": "<64 lowercase hexadecimal characters>",
  "name": "Xperia fleet",
  "maxDevices": 30,
  "expires": null
}
```

`maxDevices` may be 1–30 and defaults to 30. `expires` is an absolute Unix
timestamp in milliseconds or `null` (the default, until the owner revokes it).
The response contains `ok`, `id`, `name`, `maxDevices`, `activeDevices`,
`created`, `expires`, `revoked` and `revokedAt`. The raw key is never returned
or stored in D1. Retrying the same key and configuration returns the same grant;
changing its configuration returns `409 enrollment_conflict`. A creation retry
does not renew an expired or revoked grant. This avoids creating unrecoverable
keys when a response is lost.

Bundle only this enrollment key and the worker endpoint in the private APK.
Each installation generates and durably stores its own random 256-bit worker
`token` before the first network request. It then sends, without an owner or
existing worker bearer credential, to `POST /api/vending/worker`:

```json
{
  "action": "enroll",
  "enrollmentKey": "<the private enrollment key>",
  "token": "<this installation's persisted 64-character worker token>",
  "name": "Xperia"
}
```

Device names are trimmed and must contain 1–40 characters without control
characters. The unauthenticated request body limit is 1,000 bytes. Success is
`{ "ok": true, "id": "..." }`. Retrying the same grant and token returns the
same device ID; another grant or a legacy manually paired token cannot be
claimed. Keep the same token when retrying a transport failure or HTTP 5xx.

Grant capacity counts only devices whose registration has not been revoked.
Revoking a device frees its slot, but the old token remains revoked and cannot
resurrect. The total active-device limit is 32, allowing the two existing
registrations and 30 new installations. Admission checks both limits inside
the insertion transaction, so parallel callers cannot overbook the fleet.
The device row and membership are committed together using D1 `batch()`;
a failure rolls back both. The job scheduler uses the same total-device bound.

`GET /api/vending/admin` adds an `enrollments` list containing the public grant
fields above, without keys or hashes. The owner can stop new enrollment with
`{ "action": "enrollment_revoke", "id": "..." }`. Grant expiry or revocation
does not revoke existing workers, and retries by an existing active member
still succeed. Individual device revocation continues to use the existing
`{ "action": "revoke", "id": "..." }` operation.

Enrollment failures return `{ "code": "...", "error": "..." }`:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `enrollment_invalid_request` | Malformed settings or credential reuse |
| 403 | `enrollment_invalid` | Unknown enrollment key |
| 403 | `enrollment_revoked` | New enrollment stopped by the owner |
| 403 | `enrollment_expired` | Deadline passed for new devices |
| 403 | `device_revoked` | This device was revoked; its token stays revoked |
| 409 | `enrollment_full` | This grant's active-device slots are full |
| 409 | `device_limit` | The global active-device limit is full |
| 409 | `token_conflict` | The token belongs to a manual registration or another grant |
| 503 | `enrollment_unavailable` | Retry later with the same persisted token |

The app must not generate a new token to evade one of the 4xx responses. APK
updates from the shared 0.3.0 credential enroll each installation separately;
the backend does not revoke the shared legacy device or transfer its leases.
The Android migration must preserve local inventory and settle or retain
pending work under its original credential before switching identities.

Targeted checks use the actual Worker request handler and real SQLite through
the D1 test binding. They cover parallel capacity, idempotency, grant/device
revocation, expiry, authorization, rollback and preservation of old data:

```sh
node scripts/prepare-vending-proof.mjs
node --test test/vending-enrollment.test.mjs
node --test --test-name-pattern='pilot flag, scoped phone registration|oldest reservations receive checked puzzles' test/vending.test.mjs
```

These checks use synthetic credentials and do not call a deployed service.
