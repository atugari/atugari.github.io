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

## Wado network-search review (optional; disabled by default)

`GET /api/wado/web-search` reports readiness without returning credentials.
`POST` accepts only `{arms:{top,left,right,bottom},answer}` (2–4 one-kanji arms;
answer may be null). This feature searches the live Web through the official
Tavily API. It takes **no dictionary candidates** as input: bounded discovery
queries find possible center kanji in search-result text, then exact-word queries
check missing compounds. It returns URLs/titles for human review, never an
assertion of uniqueness. No result, a provider error, or an unsearched candidate
must not become a unique-answer verdict. Finding each compound on the Web also
does not establish that it is a suitable ordinary compound rather than a typo,
name, quotation or unrelated sequence; inspect the sources before printing.

The browser offers ordinary, user-initiated Google search links even while the
automatic API is disabled. It does not scrape Google's results. These links can
search any candidate kanji the user enters, including one absent from the local
dictionaries. Automatic search is a separate integration, not a claim that a
search link has already verified a problem.

Service terms were reviewed on 2026-10-23:

- [Tavily Platform Terms, 2026-05-04](https://www.tavily.com/terms), especially
  sections 1–3 (business/customer application integration and end-user duties)
  and 6 (output verification). Use requires the account holder's agreement,
  applicable plan/Order Form, call allowance and third-party rights compliance.
  No account has been created and no agreement/purchase has been made here.
- [Official Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)
  documents bearer-key requests, Japanese language preference and basic search.
- [Google Terms](https://policies.google.com/terms) govern the external search
  page. The app only opens a search query in the user's browser; it copies no
  Google result pages into a dictionary or this repository.
- Brave was investigated but not selected: its [standard terms](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service)
  include storage/derivative-result restrictions. No assumption of permission to
  build a permanent word database is made from a search API's availability.

Enable only after the owner has obtained a suitable Tavily plan/key and accepted
its terms. Put `TAVILY_API_KEY` into **Cloudflare Worker secrets**, using the
Cloudflare dashboard or interactive `wrangler secret put TAVILY_API_KEY` from
`nanpure-api/`. Never put the key in GitHub Pages files, browser settings, query
URLs, logs, screenshots, a tracked file or chat. Set `WADO_WEB_ENABLED` to the
string `true`, review the daily allowance, and deploy the Worker. These setup
steps have **not** been performed; live provider calls are unverified.

The default quotas allow at most 40 upstream requests per UTC day and 900 per UTC month globally,
with 3 jobs/hour/IP. Each job reserves the worst case (9–17 calls) atomically
before any provider call; completed jobs release unused reservations. Interrupted
handlers may conservatively retain a reservation until its quota period ends. `WADO_WEB_DAILY_QUERIES` may be 1–1000; it must fit the owner's
subscription and budget. `WADO_WEB_MONTHLY_QUERIES` is limited to 1–900. Basic search, no auto-upgrade, no generated answers,
no raw page downloads, at most 5 results/query, at most 3 candidate kanji, and a
45-second search deadline bound the work. Browser cancellation stops displaying
late results; already-issued server/provider calls may finish within the
reserved bound. Failed calls may still count toward provider billing.

Only surrounding/answer kanji go to Tavily; no saved puzzle library, player name,
care-facility participant information or account credentials are included.
Titles/URLs and derived candidates remain in the page's transient memory and API
response. No search text, snippets, results or new vocabulary enter D1, local
storage, backup files or generated print sheets. D1 stores counters only. Results
are never treated as a freely licensed dictionary. Update site privacy/terms
before enabling a public integration if the site's audience or terms require it.

Unit tests use fake keys and fixture search responses. They check discovery
without dictionary input, word boundaries, source URLs, incomplete searches,
response validation, quota enforcement, CORS and key non-disclosure. Passing
these tests is **not** a live Tavily connectivity test.

Free-plan setup checked 2026-10-23: the official [Researcher pricing page](https://www.tavily.com/pricing) offers 1,000 credits/month without a credit card, and says exhausted free credits stop requests unless the owner upgrades. [Basic search pricing](https://docs.tavily.com/documentation/api-credits) uses one credit per call; this integration explicitly selects basic search. The app's 900-call monthly ceiling leaves a margin but does not account for other uses of the same provider account. Use the free Researcher plan, leave paid/automatic-upgrade options disabled, and check the account's actual remaining quota before enabling. No signup, terms acceptance, paid plan, billing setup or live call has been performed in this task.
