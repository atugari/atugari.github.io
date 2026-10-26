# Private playtest deployment

This directory contains a generic deployment helper and, when present, an authenticated encrypted package. It is excluded from GitHub Pages by the existing site workflow.

Readable game source, images, sound, invitation values, session secrets, and the recipient private key are never committed here. The existing trusted Cloudflare deployment credential derives a separate, domain-scoped X25519 recipient key inside GitHub Actions. Only its public key is printed. A local sender uses a fresh ephemeral X25519 key, HKDF-SHA256, and AES-256-GCM to seal the package. The runner verifies and opens it temporarily, deploys to the existing Cloudflare account, then removes the temporary files.

The playtest uses an isolated Worker named `private-playtest`; it does not replace `puzzle-api`, its database, or the public game plaza. Anonymous requests cannot read protected static assets. A missing invitation configuration fails closed.

If the Cloudflare deployment credential is rotated, run the workflow to obtain its new public key and reseal the package. Do not print or upload the credential itself. Do not add decrypted files or invitation values to logs, artifacts, or the public site.
