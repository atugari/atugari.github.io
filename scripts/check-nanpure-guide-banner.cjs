// Every request is served from disk or intercepted. The test slot never reaches Google.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.argv[2] || '.');
const production = 'https://atugari.github.io';
const loader = '/nanpure/assets/guide-banner.js';
const source = fs.readFileSync(path.join(root, loader), 'utf8');
const client = 'ca-pub-5560584474086870';
const googleScript = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + client;
const testSlot = '7'.repeat(10);
const adRequests = requests => requests.filter(url => url.startsWith('https://pagead2.googlesyndication.com'));

// Sitemap pages that carry no banner: timer-gauge.html is empty, and
// nanpure.html and move-moove-mooove-online.html only redirect elsewhere.
const excluded = new Set(['timer-gauge.html', 'nanpure.html', 'move-moove-mooove-online.html']);

function walkHtml(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'releases' ? [] : walkHtml(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

async function render(browser, slot, origin, pathname, check) {
  const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  const requests = [];
  const sourceForTest = source.replace(/const slot = '[^']*';/, `const slot = '${slot}';`);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      requests.push(url.href);
      return route.fulfill({contentType:'text/javascript', body:''});
    }
    if (url.pathname === loader) return route.fulfill({contentType:'text/javascript', body:sourceForTest});
    const file = path.join(root, url.pathname, url.pathname.endsWith('/') ? 'index.html' : '');
    if (!fs.existsSync(file)) return route.fulfill({status:404, contentType:'text/plain', body:''});
    return route.fulfill({path:file});
  });
  await page.goto(origin + pathname, {waitUntil:'load'});
  await check(page, page.locator('ins.adsbygoogle'), requests, sourceForTest, slot, origin);
  await page.close();
}

async function assertDisabled(page, unit, requests) {
  assert.equal(await page.locator('.guide-banner').count(), 0);
  assert.equal(await unit.count(), 0);
  assert.equal(await page.evaluate(() => window.adsbygoogle), undefined);
  assert.deepEqual(adRequests(requests), []);
}

async function assertActive(page, unit, requests, sourceForTest) {
  await page.locator('.guide-banner').first().waitFor({timeout:10000});
  assert.equal(await page.locator('.guide-banner').count(), 1);
  assert.equal(await page.locator('aside.guide-banner small').innerText(), '広告');
  assert.equal(await unit.count(), 1);
  assert.equal(await unit.getAttribute('data-ad-slot'), testSlot);
  assert.equal(await unit.getAttribute('data-ad-client'), client);
  assert.equal(await unit.getAttribute('data-ad-format'), 'horizontal');
  assert.equal(await page.evaluate(() => window.adsbygoogle.length), 1);
  assert.deepEqual(adRequests(requests), [googleScript]);
  // Repeat execution must not duplicate the banner or the ad request.
  await page.addScriptTag({content:sourceForTest});
  assert.equal(await page.locator('.guide-banner').count(), 1);
  assert.equal(await unit.count(), 1);
  assert.deepEqual(adRequests(requests), [googleScript]);
  await unit.evaluate(el => { el.style.height = '90px'; el.dataset.adStatus = 'unfilled'; });
  assert.equal(await page.locator('aside.guide-banner').isVisible(), false);
  await unit.evaluate(el => { el.dataset.adStatus = 'filled'; });
  assert.equal(await page.locator('aside.guide-banner').isVisible(), true);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('aside.guide-banner').isVisible(), false);
}

async function checkGuide(page, unit, requests, sourceForTest, slot, origin) {
  const gap = () => page.evaluate(() => document.querySelector('#section-4').getBoundingClientRect().top - document.querySelector('#section-3').getBoundingClientRect().bottom);
  if (!slot || origin !== production) {
    assert.equal(await gap(), 0);
    await assertDisabled(page, unit, requests);
    return;
  }
  await assertActive(page, unit, requests, sourceForTest);
  assert.equal(await page.locator('#section-3 + aside.guide-banner + #section-4').count(), 1);
  assert.equal(await gap(), 0);
}

function checkPlaced(placement) {
  return async (page, unit, requests, sourceForTest, slot) => {
    if (!slot) {
      await assertDisabled(page, unit, requests);
      return;
    }
    await assertActive(page, unit, requests, sourceForTest);
    assert.equal(await page.locator(placement).count(), 1);
  };
}

// A fixed full-screen game has no scrollable flow, so a banner appended
// to <body> would land above the game. The loader removes it there, so
// no banner and no ad request must appear on such a page.
async function checkNoBanner(page, unit, requests) {
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.guide-banner').count(), 0);
  assert.equal(await unit.count(), 0);
  assert.deepEqual(adRequests(requests), []);
}

(async () => {
  // Static scope: every Nanpure page and every public Pareasobi page (sitemap) loads the banner.
  for (const file of walkHtml(path.join(root, 'nanpure'))) {
    assert.ok(fs.readFileSync(file, 'utf8').includes(loader), file);
  }
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const pathname = new URL(url).pathname;
    if (pathname.startsWith('/nanpure/')) continue;
    const file = path.join(root, pathname, pathname.endsWith('/') ? 'index.html' : '');
    const rel = path.relative(root, file);
    if (excluded.has(rel)) {
      assert.ok(!fs.readFileSync(file, 'utf8').includes(loader), rel);
      continue;
    }
    assert.ok(fs.readFileSync(file, 'utf8').includes(loader), rel);
  }
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try {
    await render(browser, '', production, '/nanpure/guide/', checkGuide);
    await render(browser, testSlot, 'https://nanpure.test', '/nanpure/guide/', checkGuide);
    await render(browser, testSlot, production, '/nanpure/guide/', checkGuide);
    await render(browser, '', production, '/nanpure/', checkPlaced('aside.guide-banner + footer.nanpure-site-footer'));
    await render(browser, testSlot, production, '/nanpure/', checkPlaced('aside.guide-banner + footer.nanpure-site-footer'));
    await render(browser, testSlot, production, '/nanpure/share.html', checkPlaced('main > aside.guide-banner:last-child'));
    await render(browser, testSlot, production, '/plaza.html', checkPlaced('aside.guide-banner + footer'));
    await render(browser, testSlot, production, '/dungeon.html', checkNoBanner);
    console.log('Banner passed: disabled, simulated active, origin guard, repeat execution, unfilled, print and page scope (guide, home, share, plaza, dungeon has no banner).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
