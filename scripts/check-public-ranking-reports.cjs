// Run locally with PLAYWRIGHT_MODULE and CHROME_BIN, or with an installed Playwright browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_BIN, args: ['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width:320, height:568}});
    const origin = 'https://games.test';
    const name = '<b>猫&雪</b>';
    const date = '<i>今日</i>';
    const now = Date.now();
    const bodies = [];
    const data = {
      '/rankings.json': {maru: {name, score: 45000, updatedAt: now, hallOfFame:true}, tobifly_test: {name, best: 17}},
      '/dungeon/ranking.json': {test: {nick: name, count: 5, updatedAt: now}},
      '/dungeon/halloffame.json': {test: {nick: name, date, ts: now}},
    };
    // No request leaves the test browser, including the simulated contact submission.
    await page.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin === origin && /^\/[\w-]+\.html$/.test(url.pathname)) {
        return route.fulfill({contentType:'text/html; charset=utf-8', body:fs.readFileSync(path.join(__dirname, '..', url.pathname.slice(1)))});
      }
      if (url.hostname.endsWith('.firebasedatabase.app')) {
        if (req.method() === 'PUT' && url.pathname.startsWith('/contacts/')) bodies.push(req.postDataJSON());
        return route.fulfill({json:data[url.pathname] || {}, headers:{'access-control-allow-origin':'*'}});
      }
      return route.abort();
    });
    await page.goto(origin + '/index.html');
    await page.evaluate(async () => {
      await loadBannerRanking('all');
      await loadRanking('all');
      Math.random = () => 0;
      await loadNewsBanner();
    });
    for (const [list, text] of [['#banner-rank-list', name], ['#rank-list-result', name+'殿堂']]) {
      const row = page.locator(list+' .rank-name').first();
      assert.equal(await row.textContent(), text);
      assert.equal(await row.locator('b').count(), 0);
    }
    assert.match(await page.locator('#news-content').textContent(), /<b>猫&雪<\/b>/);
    assert.equal(await page.locator('#news-content b').count(), 0);
    await page.locator('#banner-rank-list').getByRole('link', {name:name+'の名前を報告'}).click();
    assert.equal(await page.locator('#contact-type').inputValue(), 'name-report');
    assert((await page.locator('#contact-body').inputValue()).includes(name));
    assert.equal(bodies.length, 0);
    await page.locator('#contact-body').fill('合成データでの報告');
    await page.locator('#contact-email').fill('test@example.invalid');
    await page.locator('#submit-btn').click();
    await page.locator('#success-msg').waitFor();
    assert.equal(bodies.length, 1);
    assert.deepEqual(Object.keys(bodies[0]).sort(), ['body', 'email', 'sentAt', 'type']);
    assert.equal(bodies[0].body, '合成データでの報告');
    assert.equal(bodies[0].email, 'test@example.invalid');
    assert.equal(bodies[0].type, 'name-report');
    await page.goto(origin + '/tobi-ranking.html');
    assert.equal(await page.locator('.rank-row .rank-name').first().textContent(), name);
    await page.goto(origin + '/dungeon-ranking.html');
    assert.equal(await page.locator('.rank-row .rank-name').first().textContent(), name);
    assert.equal(await page.locator('.hof-name').first().textContent(), name);
    assert.equal(await page.locator('.hof-date').first().textContent(), date);
    await page.goto(origin + '/shikaku-dungeon.html');
    await page.evaluate(() => showHof());
    assert.equal(await page.locator('.hof-name').first().textContent(), name);
    assert.equal(await page.locator('.hof-date').first().textContent(), date);
    await page.evaluate(value => localStorage.setItem('adgame_nick', value), name);
    await page.goto(origin + '/share.html');
    assert.equal(await page.locator('.score-card-nick').textContent(), name);
    console.log('PASS public ranking text, news, sharing, dungeon honors, and user-confirmed nickname reporting');
  } finally {
    await browser.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
