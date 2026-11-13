import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker from '../desk/worker/index.js';
const host='https://desk.alphacovariance.com',team='https://engine-gateway-test.cloudflareaccess.com',aud='engine-test';
let signedOwner,signedResearcher;
const b64=x=>Buffer.from(x).toString('base64url');
const secret='T'.repeat(60);
let engineCalls=0,tokenHeaders=[];
before(async()=>{
 const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await webcrypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='key-engine-test';
 const sign=async email=>{
   const n=Math.floor(Date.now()/1000),h=b64(JSON.stringify({alg:'RS256',kid:jwk.kid})),p=b64(JSON.stringify({iss:team,aud,email,iat:n-3,exp:n+1800}));
   const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+b64(new Uint8Array(signature));
 };
 signedOwner=await sign('owner@example.com');signedResearcher=await sign('invited@example.com');
 globalThis.fetch=async(input,options)=>{
   const url=String(input);
   if(url.includes('/certs'))return Response.json({keys:[jwk]});
   if(url.startsWith('https://engine.alphacovariance.com/api/engine/')){
     engineCalls++;tokenHeaders.push(options?.headers?.['X-Alpha-Engine-Token']);
     return Response.json({mode:'HISTORICAL_REPLAY_ONLY',live_trading:false,token_exposed:false});
   }
   return new Response('not found',{status:404});
 };
});
const env={ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:aud,FEED_OWNER_EMAIL:'owner@example.com',
  RESEARCH_ENGINE_ORIGIN:'https://engine.alphacovariance.com',RESEARCH_ENGINE_TOKEN:secret,
  ASSETS:{fetch:()=>new Response('private asset')}};
const request=(p,t=signedOwner,method='GET',data)=>new Request(host+p,{method,
  headers:{...(t?{'cf-access-jwt-assertion':t}:{}),...(data?{'origin':host,'content-type':'application/json'}:{})},
  ...(data?{body:JSON.stringify(data)}:{})});
test('anonymous private gateway rejects research API and its frontend assets',async()=>{
 for(const p of ['/api/engine/status','/laboratory.html','/assets/laboratory.js']){
   assert.equal((await worker.fetch(request(p,null),env)).status,403);
 }
});
test('valid but non-owner Access identity cannot access engine endpoints',async()=>{
 assert.equal((await worker.fetch(request('/api/engine/status',signedResearcher),env)).status,403);
});
test('owner request proxies with backend-only secret and private response headers',async()=>{
 const r=await worker.fetch(request('/api/engine/status'),env);const j=await r.json();
 assert.equal(r.status,200);assert.equal(j.live_trading,false);
 assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 assert.equal(tokenHeaders.at(-1),secret);assert.ok(!JSON.stringify(j).includes(secret));
});
test('failed engine configuration returns 503 not a browser-facing secret',async()=>{
 const r=await worker.fetch(request('/api/engine/status'),{...env,RESEARCH_ENGINE_TOKEN:undefined});
 assert.equal(r.status,503);assert.equal((await r.json()).error,'ENGINE_NOT_CONFIGURED');
});
test('write requests need matching origin and cannot redirect',async()=>{
 const req=new Request(host+'/api/engine/backtests',{method:'POST',headers:{'cf-access-jwt-assertion':signedOwner,'content-type':'application/json'},body:'{}'});
 assert.equal((await worker.fetch(req,env)).status,403);
 const good=await worker.fetch(request('/api/engine/backtests',signedOwner,'POST',{dataset_id:'id',strategy:{}}),env);
 assert.equal(good.status,200);
});
test('workers.dev hostname fails before any data route',async()=>{
 assert.equal((await worker.fetch(new Request('https://alpha-covariance-desk.test.workers.dev/api/engine/status'),env)).status,404);
});
