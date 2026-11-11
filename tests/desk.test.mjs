import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker from '../desk/worker/index.js';
const TEAM='https://alpha-quant-demo.cloudflareaccess.com';
const AUD='expected-private-desk-audience';
const ENV={ ACCESS_TEAM_DOMAIN:TEAM, ACCESS_AUD:AUD, ASSETS:{fetch:async()=>new Response('<!doctype html><title>private</title>',{headers:{'Content-Type':'text/html'}})} };
let signed;
const base='https://desk.alphacovariance.com';
const b64=data=>Buffer.from(data).toString('base64url');
const encJSON=x=>b64(JSON.stringify(x));

before(async()=>{
  const keyPair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await webcrypto.subtle.exportKey('jwk',keyPair.publicKey);jwk.kid='test-key';
  const now=Math.floor(Date.now()/1000);
  const h=encJSON({alg:'RS256',kid:jwk.kid,typ:'JWT'});
  const p=encJSON({iss:TEAM,aud:[AUD],exp:now+600,iat:now-10,email:'approved@example.com'});
  const sig=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(h+'.'+p));
  signed=h+'.'+p+'.'+b64(new Uint8Array(sig));
  globalThis.fetch=async (url)=>{
    const u=String(url);
    if(u===TEAM+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});
    if(u.includes('ticker/24hr'))return Response.json(['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'].map((symbol,i)=>({symbol,lastPrice:String([101,22,3,1][i]),priceChangePercent:'1.2',closeTime:Date.now()})));
    if(u.includes('klines'))return Response.json([[Date.now()-60_000,'101','105','99','103','10',Date.now()-1]]);
    return new Response('unmocked',{status:404});
  };
});
const authReq=(path='/api/whoami',token=signed,host=base)=>new Request(host+path,{headers:token?{'cf-access-jwt-assertion':token}:undefined});
test('no alternate workers.dev hostname route',async()=>{const res=await worker.fetch(new Request('https://alpha-covariance-desk.any.workers.dev/'),ENV);assert.equal(res.status,404)});
test('fail-closed when Access is unconfigured',async()=>{const res=await worker.fetch(authReq(),{ASSETS:ENV.ASSETS});assert.equal(res.status,403)});
test('missing Access JWT denied for assets and API',async()=>{
  for(const path of ['/','/assets/desk.js','/api/markets'])assert.equal((await worker.fetch(authReq(path,null),ENV)).status,403);
});
test('invalid Access JWT denied',async()=>assert.equal((await worker.fetch(authReq('/api/whoami','not.a.jwt'),ENV)).status,403));
test('valid signed Access JWT passes; identity is server verified',async()=>{const res=await worker.fetch(authReq(),ENV);assert.equal(res.status,200);assert.equal((await res.json()).email,'approved@example.com')});
test('valid private asset request is served with private headers',async()=>{const res=await worker.fetch(authReq('/index.html'),ENV);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.ok((await res.text()).includes('private'))});
test('feed snapshot is passed through from exchange, not calculated prices',async()=>{const res=await worker.fetch(authReq('/api/markets'),ENV);const data=await res.json();assert.equal(res.status,200);assert.equal(data.source,'Binance Spot');assert.equal(data.tickers[0].price,101)});
test('OHLC source and interval allowlist',async()=>{assert.equal((await worker.fetch(authReq('/api/candles?symbol=BAD&interval=1m'),ENV)).status,400);const res=await worker.fetch(authReq('/api/candles?symbol=BTCUSDT&interval=1m'),ENV);assert.equal(res.status,200);assert.equal((await res.json()).candles.length,1)});
