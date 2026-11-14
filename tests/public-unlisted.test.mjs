import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const r = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const dirs = ['', 'about/', 'research/', 'systems/', 'lab/', 'notes/', 'contact/', 'privacy/'];
test('all public HTML pages declare noindex and preserve direct-link navigation', () => {
  for (const dir of dirs) {
    const html = r('site/' + dir + 'index.html');
    assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">/);
    assert.match(html, /<a class="brand" href="\/"/);
  }
  assert.match(r('site/404.html'), /noindex/);
});
test('Cloudflare static assets emit noindex headers and public surface fingerprint', () => {
  const h = r('site/_headers');
  assert.match(h, /\/\*\r?\n\s*X-Robots-Tag: noindex, nofollow, noarchive, nosnippet/);
  assert.match(h, /X-AC-Surface: public-unlisted/);
});
test('unlisted site does not publish a sitemap; crawlers may see noindex', () => {
  assert.equal(existsSync(new URL('../site/sitemap.xml', import.meta.url)), false);
  const robots = r('site/robots.txt');
  assert.match(robots, /Allow: \/\s*\n/);
  assert.doesNotMatch(robots, /Disallow: \/|Sitemap:/);
});
test('private server and assets use a separate authenticated application', () => {
  const code = r('desk/worker/index.js');
  assert.match(code, /validateAccessJwt\(request,env\)/);
  assert.match(code, /hostname!==HOST/);
  assert.match(code, /x-ac-surface','private-research-desk/);
  assert.match(r('wrangler.desk.jsonc'), /"run_worker_first": true/);
  assert.match(r('wrangler.desk.jsonc'), /"html_handling": "none"/);
});
test('license gate defaults closed for Coinbase and never enables external feeds', () => {
  const source=r('desk/worker/index.js');
  assert.match(source,/MARKET_DATA_OWNER_DISPLAY!=='enabled'/);
  const manifest = JSON.parse(r('config/market_data_rights.json'));
  assert.equal(manifest.providers[0].external_display,'disabled');
  assert.equal(manifest.providers[0].automated_backtesting,'disabled_pending_written_permission');
});
test('no legacy Binance source or USDT instrument labels exist in current Desk',()=>{
  for(const f of ['desk/index.html','desk/studio.html','desk/assets/desk.js','desk/worker/index.js']){
    assert.doesNotMatch(r(f),/Binance|BTCUSDT|ETHUSDT|BTCUSD|USDT/);
  }
});
