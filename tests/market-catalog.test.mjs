import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../desk/assets/markets.js',import.meta.url),'utf8');
test('eight independent research markets have exactly 25 reference instruments',()=>{
 const sandbox={};vm.runInNewContext(src.replace("document.addEventListener('DOMContentLoaded',init);",'globalThis.__markets=catalogs;'),sandbox);
 const markets=sandbox.__markets;assert.equal(Object.keys(markets).length,8);
 for(const [market,items] of Object.entries(markets)){
  assert.equal(items.length,25,market);
  assert.equal(new Set(items.map(x=>x.id)).size,25,market);
  assert.ok(items.every(x=>x.name&&x.id),market);
 }
});
test('catalog display loads no fabricated quotes and never contains a sample-price generator',()=>{
 assert.ok(!/Math\.random\s*\(/.test(src));
 assert.ok(src.includes("price.textContent=q?num(q.price):ds?'HIST.':'—'"));
 assert.ok(src.includes('/api/engine/datasets/'));
});
