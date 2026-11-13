import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker,{normalizeCandles} from '../desk/worker/index.js';
const TEAM='https://alpha-quant-demo.cloudflareaccess.com',AUD='test-desk-audience';
const ENV={ACCESS_TEAM_DOMAIN:TEAM,ACCESS_AUD:AUD,FEED_OWNER_EMAIL:'approved@example.com',MARKET_DATA_OWNER_DISPLAY:'enabled',ASSETS:{fetch:async()=>new Response('<html>private</html>',{headers:{'content-type':'text/html'}})}};
const base='https://desk.alphacovariance.com';
let signed,other;
const b64=x=>Buffer.from(x).toString('base64url');
const enc=x=>b64(JSON.stringify(x));
before(async()=>{
  const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const publicKey=await webcrypto.subtle.exportKey('jwk',keys.publicKey);publicKey.kid='stg2-test-key';
  const issue=async email=>{const now=Math.floor(Date.now()/1000),header=enc({alg:'RS256',kid:publicKey.kid}),payload=enc({iss:TEAM,aud:AUD,iat:now-2,exp:now+1000,email});const sig=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(`${header}.${payload}`));return `${header}.${payload}.${b64(new Uint8Array(sig))}`;};
  signed=await issue('approved@example.com');other=await issue('friend@example.com');
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url===TEAM+'/cdn-cgi/access/certs')return Response.json({keys:[publicKey]});
    if(url.includes('/ticker'))return Response.json({price:url.includes('BTC-USD')?'72000':url.includes('ETH-USD')?'3000':'150',time:new Date().toISOString()});
    if(url.includes('/candles')){
      const now=Math.floor(Date.now()/60_000)*60;
      return Response.json([[now,100,105,101,103,19],[now-60,99,104,100,102,15]]);
    }
    return new Response('not found',{status:404});
  };
});
const req=(path='/',token=signed,options={})=>new Request(base+path,{...options,headers:{...(token?{'cf-access-jwt-assertion':token}:{}),...(options.headers||{})}});
test('alternate hostname rejected before authentication',async()=>assert.equal((await worker.fetch(new Request('https://alpha-covariance-desk.any.workers.dev/'),ENV)).status,404));
test('unconfigured Access fails closed',async()=>assert.equal((await worker.fetch(req('/'),{ASSETS:ENV.ASSETS})).status,403));
test('anonymous asset and API denied',async()=>{for(const path of ['/','/studio.html','/assets/studio.js','/api/markets','/api/strategies'])assert.equal((await worker.fetch(req(path,null),ENV)).status,403)});
test('invalid signed identity denied',async()=>assert.equal((await worker.fetch(req('/','invalid.token'),ENV)).status,403));
test('signed owner authenticated',async()=>{const r=await worker.fetch(req('/api/whoami'),ENV);assert.equal(r.status,200);assert.equal((await r.json()).role,'owner')});
test('static assets have no-store and CSP',async()=>{const r=await worker.fetch(req('/studio.html'),ENV);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/)});
test('non-owner cannot access market data',async()=>{for(const path of ['/api/markets','/api/candles?symbol=BTC-USD&interval=1m'])assert.equal((await worker.fetch(req(path,other),ENV)).status,403)});
test('authenticated owner receives Coinbase USD quotes',async()=>{const r=await worker.fetch(req('/api/markets'),ENV);const x=await r.json();assert.equal(r.status,200);assert.equal(x.source,'Coinbase Exchange');assert.equal(x.quoteCurrency,'USD');assert.equal(x.tickers.length,3);assert.equal(x.tickers[0].price,72000);assert.equal(x.tickers[0].change24h,null)});
test('Coinbase reverse chronological seconds normalized to ascending milliseconds',async()=>{const r=await worker.fetch(req('/api/candles?symbol=BTC-USD&interval=1m'),ENV);const x=await r.json();assert.equal(r.status,200);assert.equal(x.candles.length,2);assert.ok(x.candles[0].t<x.candles[1].t);assert.equal(x.candles[0].o,100);assert.equal(x.candles[0].h,104);assert.equal(x.missingIntervals,0)});
test('invalid symbol and interval rejected',async()=>{for(const path of ['/api/candles?symbol=BTCUSDT&interval=1m','/api/candles?symbol=BTC-USD&interval=5s'])assert.equal((await worker.fetch(req(path),ENV)).status,400)});
test('normalizer flags gaps, does not invent bars',()=>{const now=Date.now(),t=Math.floor(now/60000)*60,got=normalizeCandles([[t,9,12,10,11,20],[t-120,9,12,10,11,20]],60,now);assert.equal(got.missingIntervals,1);assert.equal(got.candles.length,2)});
test('normalizer rejects invalid data and stale observations',()=>{assert.throws(()=>normalizeCandles([[1000000,9,12,10,11,20]],60));assert.throws(()=>normalizeCandles([[Math.floor(Date.now()/1000)-4000,9,12,10,11,20]],60))});
test('storage unconfigured returns 503, not fake zero rows',async()=>assert.equal((await worker.fetch(req('/api/strategies'),ENV)).status,503));
test('same-origin enforcement for mutation',async()=>{const r=await worker.fetch(req('/api/strategies',signed,{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'}),ENV);assert.equal(r.status,403)});
test('research account may not write strategies',async()=>{const r=await worker.fetch(req('/api/strategies',other,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'}),ENV);assert.equal(r.status,403)});

test('Coinbase data is blocked by default without an explicit rights gate',async()=>{const r=await worker.fetch(req('/api/markets'),{...ENV,MARKET_DATA_OWNER_DISPLAY:undefined});assert.equal(r.status,403);assert.equal((await r.json()).error,'FEED_NOT_APPROVED')});
test('all private API JSON responses carry noindex header',async()=>{const r=await worker.fetch(req('/api/whoami'),ENV);assert.match(r.headers.get('x-robots-tag'),/noindex/)});
test('no market-data writes accepted',async()=>{const r=await worker.fetch(req('/api/markets',signed,{method:'POST',headers:{origin:base}}),ENV);assert.equal(r.status,405)});
