// node scripts/check-maru-data-removal.cjs (optional: PLAYWRIGHT_MODULE and CHROME_BIN)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_BIN, args: ['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const origin = 'https://games.test';
    const records = new Map([['rankings', 'this-device'], ['halloffame', 'this-device']]);
    const deletes = [];
    let fault = 'offline';

    // Every request is fulfilled from the checkout or the in-memory fixture.
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin && ['/settings.html', '/maru-storage.js'].includes(url.pathname)) {
        const file = path.join(__dirname, '..', url.pathname.slice(1));
        return route.fulfill({path:file});
      }
      const match = /^\/(rankings|halloffame)\/test-player\.json$/.exec(url.pathname);
      if (!match || !url.hostname.endsWith('.firebasedatabase.app')) return route.abort();
      const group = match[1];
      if (fault === 'offline') return route.abort();
      const owner = records.get(group);
      if (request.method() === 'GET') {
        return route.fulfill({json:owner ? {deviceId:owner} : null,
          headers:{ETag:'"fixture"', 'Access-Control-Expose-Headers':'ETag'}});
      }
      if (request.method() !== 'DELETE') return route.abort();
      deletes.push([group, request.headers()['if-match']]);
      if (group === 'halloffame' && fault) return route.fulfill({status:fault});
      records.delete(group);
      return route.fulfill({json:null});
    });

    await page.goto(origin + '/settings.html');
    await page.evaluate(() => {
      localStorage.setItem('adgame_nick', 'test-player');
      localStorage.setItem('adgame_device_id', 'this-device');
      localStorage.setItem('np_saved_game', 'keep');
      sessionStorage.setItem('adgame_owner_auth', '1');
      sessionStorage.setItem('other_game', 'keep');
    });

    async function checkStorage(deleted) {
      const state = await page.evaluate(() => [
        localStorage.getItem('adgame_nick'), localStorage.getItem('adgame_device_id'),
        sessionStorage.getItem('adgame_owner_auth'),
        localStorage.getItem('np_saved_game'), sessionStorage.getItem('other_game')
      ]);
      assert.deepEqual(state, deleted ? [null,null,null,'keep','keep'] : ['test-player','this-device','1','keep','keep']);
    }
    const message = page.locator('#modal-msg');
    const retry = page.locator('#modal-retry');

    await page.evaluate(() => runDelete());
    await message.filter({hasText:'通信状況'}).waitFor();
    await checkStorage(false);
    assert.equal(records.size, 2);

    fault = 403;
    await retry.click();
    await message.filter({hasText:'HTTP 403'}).waitFor();
    assert.match(await message.innerText(), /確認済みの項目：ランキング/);
    assert.deepEqual([...records.keys()], ['halloffame']);
    await checkStorage(false);

    // Another player now owns this name in rankings. Retries must preserve it.
    records.set('rankings', 'another-device');
    fault = 412;
    await retry.click();
    await message.filter({hasText:'HTTP 412'}).waitFor();
    await checkStorage(false);

    fault = null;
    await retry.click();
    await page.locator('#modal-title').filter({hasText:'消去完了'}).waitFor();
    await checkStorage(true);
    assert.deepEqual([...records.entries()], [['rankings','another-device']]);
    assert.deepEqual(deletes, ['rankings','halloffame','halloffame','halloffame'].map(group => [group, '"fixture"']));
    console.log('PASS Maru removal: network failure, partial deletion, conflict, safe retry and scoped storage');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
