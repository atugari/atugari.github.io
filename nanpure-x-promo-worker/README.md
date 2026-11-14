# Pareasobi promotional publisher — isolated queue schema

This folder is reserved for the independent promotional publishing service.
It must use its own Cloudflare D1 database and R2 bucket. Do not point it at
the existing puzzle-db database and do not change nanpure-x-worker/.

## Database model

- promo_posts: separate scheduled queue and permanent posting history.
- promo_settings: posting switch; defaults to OFF.
- promo_oauth: encrypted OAuth 2.0 access/refresh tokens and verified account.
- promo_oauth_states: short-lived PKCE state/verifier records.
- promo_events: append-only audit trail for queue transitions.

## Media

Video and image bytes belong in a dedicated R2 bucket, not D1 rows.
The queue stores only an R2 key, media type, byte count and SHA-256 digest.
Use a unique R2 key per prepared post. Never overwrite media for an existing
queued or sent post.

## X account authorization

The current X media-upload guide uses a user access token (Bearer) and a
chunked INIT / APPEND / FINALIZE / STATUS flow for video. The separate worker
must use OAuth 2.0 user context with the scopes needed for media upload,
posting and account verification. Do not reuse the existing worker's
OAuth 1.0a media path for this service.

The intended authorization flow is OAuth 2.0 PKCE with a registered callback
URL, encrypted token storage, refresh-token rotation, and a /2/users/me
check that confirms parade166 before enabling the queue.

## Safety requirements

- Queue switch starts OFF.
- Only the promo worker can read or mutate these tables.
- Only the promo worker can access the promo R2 bucket.
- A post moves to needs_review if X's response is uncertain; it is never
  blindly retried, preventing duplicate promotional posts.
- Existing "今日の4問" queue, database tables, schedule, and workflow remain
  unchanged.
- No public site files are changed by this service.
