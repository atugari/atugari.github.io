var NPWadoWeb = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // nanpure-api/src/shared/wado-web.js
  var wado_web_exports = {};
  __export(wado_web_exports, {
    MAX_CANDIDATES: () => MAX_CANDIDATES,
    candidateQuery: () => candidateQuery,
    discover: () => discover,
    discoveryQueries: () => discoveryQueries,
    evidence: () => evidence,
    inspectNetwork: () => inspectNetwork,
    positions: () => positions,
    problem: () => problem,
    safeResult: () => safeResult,
    searchLinks: () => searchLinks,
    searchUrl: () => searchUrl,
    words: () => words
  });
  var positions = ["top", "left", "right", "bottom"];
  var MAX_CANDIDATES = 3;
  var han = /^[\u3400-\u9fff]$/;
  function problem(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || !input.arms || typeof input.arms !== "object" || Array.isArray(input.arms) || Object.keys(input).some((k) => !["arms", "answer"].includes(k))) throw Error("\u554F\u984C\u306E\u6F22\u5B57\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    const keys = Object.keys(input.arms);
    if (keys.length < 2 || keys.length > 4 || keys.some((k) => !positions.includes(k) || !han.test(input.arms[k])) || input.answer != null && !han.test(input.answer)) throw Error("\u5468\u308A\u306E\u6F22\u5B57\u30922\u301C4\u304B\u6240\u30011\u6587\u5B57\u305A\u3064\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    return { arms: Object.fromEntries(positions.filter((k) => input.arms[k]).map((k) => [k, input.arms[k]])), answer: input.answer ?? null };
  }
  function words(p, answer) {
    if (!han.test(answer)) throw Error("\u5019\u88DC\u306E\u6F22\u5B57\u30921\u6587\u5B57\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    return positions.filter((position) => p.arms[position]).map((position) => {
      const char = p.arms[position];
      return { position, text: ["top", "left"].includes(position) ? char + answer : answer + char };
    });
  }
  function discoveryQueries(input) {
    const p = problem(input), shape = Object.entries(p.arms).map(([k, c]) => ["top", "left"].includes(k) ? c + "\u25A1" : "\u25A1" + c).join(" ");
    return [shape + " \u5171\u901A \u6F22\u5B57 \u4E8C\u5B57\u719F\u8A9E", ...Object.values(p.arms).map((c) => '"' + c + '" \u4E8C\u5B57\u719F\u8A9E \u4E00\u89A7')];
  }
  function candidateQuery(input, answer) {
    return words(problem(input), answer).map((w) => '"' + w.text + '"').join(" ");
  }
  function searchUrl(query) {
    return "https://www.google.com/search?" + new URLSearchParams({ q: query, hl: "ja" });
  }
  function searchLinks(input, answer = null) {
    const p = problem(input), queries = [{ label: "\u3053\u306E\u554F\u984C\u306E\u5225\u89E3\u5019\u88DC\u3092\u30CD\u30C3\u30C8\u3067\u63A2\u3059", query: discoveryQueries(p)[0] }];
    if (answer) queries.push({ label: "\u5019\u88DC\u300C" + answer + "\u300D\u306E\u719F\u8A9E\u3092\u307E\u3068\u3081\u3066\u691C\u7D22", query: candidateQuery(p, answer) }, ...words(p, answer).map((w) => ({ label: w.text + "\u306E\u7528\u4F8B\u3092\u691C\u7D22", query: '"' + w.text + '" \u610F\u5473 \u7528\u4F8B' })));
    return queries.map((item) => ({ ...item, url: searchUrl(item.query) }));
  }
  function safeResult(result) {
    if (!result || typeof result.url !== "string" || typeof result.content !== "string") return null;
    let url;
    try {
      url = new URL(result.url);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2e3) return null;
    return { title: String(result.title || url.hostname).replace(/<[^>]*>/g, "").slice(0, 160), url: url.href, content: result.content.slice(0, 12e3) };
  }
  function plain(text) {
    return text.replace(/https?:\/\/\S+/g, " ").replace(/<[^>]*>/g, " ");
  }
  function tokens(text) {
    return [...plain(text).matchAll(/(?<!\p{Script=Han})[\u3400-\u9fff]{2}(?!\p{Script=Han})/gu)].map((m) => m[0]);
  }
  function evidence(text, results) {
    return results.filter((r) => tokens(r.title + " " + r.content).includes(text)).map(({ title, url }) => ({ title, url }));
  }
  function discover(input, results) {
    const p = problem(input), candidates = /* @__PURE__ */ new Map();
    for (const result of results) for (const text of new Set(tokens(result.title + " " + result.content))) for (const [position, char] of Object.entries(p.arms)) {
      const incoming = ["top", "left"].includes(position), answer = incoming ? text[1] : text[0];
      if ((incoming ? text[0] : text[1]) !== char || answer === p.answer) continue;
      if (!candidates.has(answer)) candidates.set(answer, /* @__PURE__ */ new Set());
      candidates.get(answer).add(position);
    }
    return [...candidates].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], "ja")).map(([answer]) => answer);
  }
  async function inspectNetwork(input, search) {
    const p = problem(input), queries = [], discovered = [];
    let failed = 0;
    async function run(query) {
      try {
        const raw = await search(query), results = raw.map(safeResult).filter(Boolean);
        queries.push({ query, ok: true, results: results.map(({ title, url }) => ({ title, url })) });
        return results;
      } catch {
        failed++;
        queries.push({ query, ok: false, results: [] });
        return [];
      }
    }
    for (const query of discoveryQueries(p)) discovered.push(...await run(query));
    const found = discover(p, discovered), answers = found.slice(0, MAX_CANDIDATES), candidates = [];
    for (const answer of answers) {
      const entries = [];
      for (const item of words(p, answer)) {
        let sources = evidence(item.text, discovered);
        if (!sources.length) sources = evidence(item.text, await run('"' + item.text + '" \u610F\u5473 \u7528\u4F8B'));
        sources = [...new Map(sources.map((s) => [s.url, s])).values()].slice(0, 3);
        entries.push({ ...item, sources });
      }
      candidates.push({ answer, words: entries, allWordsFound: entries.every((w) => w.sources.length > 0) });
    }
    return { version: 1, provider: "Tavily", checkedAt: Date.now(), status: failed ? "incomplete" : candidates.some((c) => c.allWordsFound) ? "candidates-found" : "no-candidates-found", candidates, discoveredCandidates: found.length, truncated: found.length > MAX_CANDIDATES, failedQueries: failed, queries, exhaustive: false };
  }
  return __toCommonJS(wado_web_exports);
})();
