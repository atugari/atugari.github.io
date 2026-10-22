# Nanpure client overrides

These public client files preserve the reviewed fixes applied after source commit `1222640c9a34beb3f57d065e7504b11bcae1e994`. `scripts/export-nanpure.mjs` overlays them before bundling the shell and patching the notebook translations. They contain no server routes, credentials, or saved user data.

The exporter records a SHA-256 of this directory in the release metadata. Keep these files in sync when changing the notebook renderer, settings, board input, hints, or shell loading and backup lifecycle. The maintained translation runtime and dictionaries are in `scripts/i18n`.

Regression gates: `check-nanpure-input.cjs`, `check-nanpure-ui.cjs`, `check-nanpure-i18n.cjs`, `check-nanpure-pages.cjs`, `check-nanpure-shell-lifecycle.cjs`, and the Chromium mobile checks.
