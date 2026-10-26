# Private playtest deployment

This directory contains generic deployment helpers and non-secret transfer metadata. It is excluded from GitHub Pages by the existing site workflow. The encrypted game package is transferred directly to an authenticated, write-only Cloudflare inbox instead of being committed to this public repository.

Readable game source, images, sound, invitation values, session secrets, and the recipient private key are never committed here. The existing trusted Cloudflare deployment credential derives a separate, domain-scoped X25519 recipient key inside GitHub Actions. Only its public key is printed. A local sender uses a fresh ephemeral X25519 key, HKDF-SHA256, and AES-256-GCM to seal the package. An independent 256-bit upload key authorizes the direct HTTPS transfer; only its SHA-256 hash is public. The encrypted parts temporarily occupy dedicated rows in the existing D1 database. The runner verifies and opens them privately, masks application secrets, deploys, and removes the transfer rows and temporary files. The inbox exposes no read operation and is replaced by the finished invitation-gated application.

The playtest uses an isolated Worker named `private-playtest`; it does not replace `puzzle-api`, its database, or the public game plaza. Anonymous requests cannot read protected static assets. A missing invitation configuration fails closed.

If the Cloudflare deployment credential is rotated, run the workflow to obtain its new public key and reseal the package. Do not print or upload the credential itself. Do not add decrypted files or invitation values to logs, artifacts, or the public site.
