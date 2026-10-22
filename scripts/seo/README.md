# Search-readable Nanpure pages

`export-nanpure.mjs` renders the actual Japanese home component into the initial HTML before packaging the client. `SiteIntro` stays in the interactive home, so readers and crawlers receive the same public explanation. It does not load the puzzle notebook on the home screen.

`content.json` owns public titles, descriptions and four Japanese guides. Keep claims consistent with the shipped game. Update `updated` only when the guide text or its meaningful links change; rebuilding another release must not pretend every guide was revised. User-interface labels and the home title are translated in `i18n/catalog-seo-34.json`.

`build-seo.mjs` writes stable guide URLs, metadata, factual structured data, the root sitemap and robots file. Canonical and internal URLs use `https://atugari.github.io/nanpure/`. The existing `nanpure.html` redirect remains compatible with old links. Versioned iframe HTML is `noindex, follow`; versioned scripts and styles must remain crawlable.

The Pages gate checks public content before any JavaScript runs, independent guide documents and links back to the playable app. Google Search Console submission and indexing are separate external operations; producing a sitemap does not mean a submission occurred or guarantee a search position. Keep the existing Google ownership verification file.
