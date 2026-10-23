# Nanpure client overrides

These public client files preserve the reviewed fixes applied after source commit `1222640c9a34beb3f57d065e7504b11bcae1e994`. `scripts/export-nanpure.mjs` overlays them before bundling the shell and patching the notebook translations. They contain no server routes, credentials, or saved user data.

The exporter records a SHA-256 of this directory in the release metadata. Keep these files in sync when changing the notebook renderer, settings, board input, hints, or shell loading and backup lifecycle. The maintained translation runtime and dictionaries are in `scripts/i18n`.

Regression gates: `check-nanpure-input.cjs`, `check-nanpure-ui.cjs`, `check-nanpure-i18n.cjs`, `check-nanpure-pages.cjs`, `check-nanpure-shell-lifecycle.cjs`, `check-nanpure-special-keyboard.cjs`, `check-nanpure-keyboard-browser.cjs`, and the Chromium mobile checks.

`public/keyboard-access.js` supplies keyboard help, dialog containment, focus visibility and focus recovery to the shell and each notebook document. Game-specific arrow movement belongs to the game renderer so focus changes never act as puzzle input. Keep browser shortcuts, editable fields and IME composition outside puzzle key handlers.

`public/key-bindings.js` is bundled before `keyboard-access.js` in the same public runtime. It stores key assignments under `np-key-bindings-v1`, including backup/restore, and routes custom keys through the existing focused-board input paths. Tab, Escape, browser shortcuts, text editing and IME remain outside gameplay bindings. Keep `check-nanpure-keybindings.cjs` and `check-nanpure-keybindings-browser.cjs` in the publication checks.

`lib/board-appearance.ts` owns the shared, validated `np-board-appearance-v1` preferences for region borders, cell lines, number weight and highlight strength. The exporter also bundles it as the notebook runtime before `appearance-controls.js`. Keep visual rules in `public/board-appearance.css` scoped to screen play and previews, so printed geometry and puzzle annotations remain unchanged. Highlight on/off still uses each game’s existing persistence and edit rendering. Verify native jigsaw boundaries, persistence, storage errors, shared frames and translations with `check-nanpure-appearance-browser.cjs`.
