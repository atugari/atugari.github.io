# Kanji fill-in (Wado Kaichin)

The Japanese-only generator is entered through Free play → Prototypes → Create kanji puzzles, or Tools. It generates and saves print-ready questions; this is not a timed game.

- Ten difficulty presets vary vocabulary and aids. Levels 1–4 use 2/3/4/6 choices and readings; 5 requires recall with all readings; 6 has one reading; 7 has familiar words without aids; 8–10 broaden vocabulary. These are descriptive presets, not clinically validated ratings. Individual familiarity varies.
- Independently choose 2, 3, or 4 two-kanji compounds. Top and left read toward the center; right and bottom read away. Two-word questions use top and right. Three-word questions add left or bottom. Four use all sides.
- Candidates come from manually selected vocabulary. Alternative answers are checked against **all 58,373 two-kanji spellings** in the pinned JMdict snapshot, including spellings outside the generation pool. Uniqueness is relative to this corpus, not every possible Japanese usage.
- Canonical fingerprints treat swapped incoming/outgoing words as the same question. Saved questions and settings use `np-wado-v1`, included in website backup/transfer; generation re-reads storage under a Web Lock before each save. Corrupt data and failed writes never reset existing data. Limit: 500 puzzles.
- The real Worker prevents search from blocking input. Stop terminates pending generation and ignores late worker messages. Only the current library page enters the DOM.
- Printing builds separate question/answer sheets at the user's request. A4: 1/2/4/6 puzzles, with 2 per page as the larger default. Screen-open answers cannot leak into question sheets.

## Dictionary attribution and updates

JMdict copyright James William BREEN and the Electronic Dictionary Research and Development Group. JSON conversion by scriptin/jmdict-simplified. Dictionary extracts and generated vocabulary data are distributed under **CC BY-SA 4.0**, separately from application code. Source links and a downloadable extract are available through the page's Sources disclosure.

- https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project
- https://www.edrdg.org/edrdg/licence.html
- https://creativecommons.org/licenses/by-sa/4.0/
- https://github.com/scriptin/jmdict-simplified

Pinned snapshot: `3.6.2+20261019180022`, dictionary date 2026-10-19. The extract records the full source JSON SHA-256. No dictionary network call is needed while generating questions.

**Refresh at least monthly** and whenever vocabulary changes: download the current `jmdict-eng-*.json.zip` from the upstream releases, run `python3 scripts/wado/build-dictionary.py /absolute/path/to/download.zip`, review omitted vocabulary and the resulting word/reading changes, run `node scripts/check-nanpure-wado.cjs`, export the site, and run the browser checks in Pages CI. Check existing saved questions remain valid before publishing a dictionary change; preserve older dictionary versions or migrate explicitly if upstream removes entries. No automatic dictionary update is performed at runtime.
