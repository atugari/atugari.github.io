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

async function render(browser, slot, origin = production) {
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
    return route.fulfill({path:file});
  });
  await page.goto(origin + '/nanpure/guide/');
  const gap = () => page.evaluate(() => document.querySelector('#section-4').getBoundingClientRect().top - document.querySelector('#section-3').getBoundingClientRect().bottom);
  const unit = page.locator('ins.adsbygoogle');
  if (!slot || origin !== production) {
    assert.equal(await gap(), 0);
    assert.equal(await page.locator('.guide-banner').count(), 0);
    assert.equal(await unit.count(), 0);
    assert.equal(await page.evaluate(() => window.adsbygoogle), undefined);
    assert.deepEqual(requests, []);
  } else {
    await page.addScriptTag({content:sourceForTest});
    assert.equal(await page.locator('#section-3 + aside.guide-banner + #section-4').count(), 1);
    assert.equal(await page.locator('aside.guide-banner small').innerText(), '広告');
    assert.equal(await unit.count(), 1);
    assert.equal(await unit.getAttribute('data-ad-slot'), testSlot);
    assert.equal(await unit.getAttribute('data-ad-client'), client);
    assert.equal(await unit.getAttribute('data-ad-format'), 'horizontal');
    assert.equal(await page.evaluate(() => window.adsbygoogle.length), 1);
    assert.deepEqual(requests, [googleScript]);
    await unit.evaluate(el => { el.style.height = '90px'; el.dataset.adStatus = 'unfilled'; });
    assert.equal(await page.locator('aside.guide-banner').isVisible(), false);
    assert.equal(await gap(), 0);
    await unit.evaluate(el => { el.dataset.adStatus = 'filled'; });
    assert.equal(await page.locator('aside.guide-banner').isVisible(), true);
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('aside.guide-banner').isVisible(), false);
    assert.equal(await gap(), 0);
  }
  await page.close();
}

(async () => {
  // The guide is the only static entrypoint that can activate this placement.
  for (const entry of fs.readdirSync(path.join(root, 'nanpure'), {withFileTypes:true})) {
    const index = path.join(root, 'nanpure', entry.name, 'index.html');
    if (entry.isDirectory() && fs.existsSync(index)) {
      assert.equal(fs.readFileSync(index, 'utf8').includes(loader), entry.name === 'guide', index);
    }
  }
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try {
    await render(browser, '');
    await render(browser, testSlot, 'https://nanpure.test');
    await render(browser, testSlot);
    console.log('Guide banner passed: disabled, simulated active, origin guard, repeat execution, unfilled, print and page scope.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
