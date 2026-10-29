# Search-readable Nanpure pages

`export-nanpure.mjs` renders the actual Japanese home component into the initial HTML before packaging the client. `SiteIntro` stays in the interactive home, so readers and crawlers receive the same public explanation. It does not load the puzzle notebook on the home screen.

`content.json` owns public titles, descriptions and five Japanese guides. Keep claims consistent with the shipped game. Update `updated` only when the guide text or its meaningful links change; rebuilding another release must not pretend every guide was revised. User-interface labels and the home title are translated in `i18n/catalog-seo-34.json`.

`build-seo.mjs` writes stable guide URLs, metadata, factual structured data, the root sitemap and robots file. Canonical and internal URLs use `https://atugari.github.io/nanpure/`. The existing `nanpure.html` redirect remains compatible with old links. Versioned iframe HTML is `noindex, follow`; versioned scripts and styles must remain crawlable.

The Pages gate checks public content before any JavaScript runs, independent guide documents and links back to the playable app. Google Search Console submission and indexing are separate external operations; producing a sitemap does not mean a submission occurred or guarantee a search position. Keep the existing Google ownership verification file.

`international.json` owns the 19 translated landing pages. The Japanese home and those pages form one reciprocal 20-language hreflang cluster, with English as x-default. The language pages are fully readable without JavaScript and retain the selected language when opening the game. `build-pages.mjs` rebuilds the stable search pages against the current release manifest; use it for content updates without regenerating game assets. The home directory is visible only on the home screen, including when a visitor opens privacy or management directly.

The playable home links directly to the 100,000-puzzle collection. Stable `collection/entry.js` restores the same link after the React home renders or returns; `decorateHome` retains its initial HTML, stylesheet and loader during future search-page rebuilds. The root game and plaza also identify パレあそび and its kana spelling variants as the same WebSite; keep the root game's own title and content intact.
