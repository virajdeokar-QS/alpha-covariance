import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../desk/worker/index.js';
const url='https://desk.alphacovariance.com',team='https://studiotest.cloudflareaccess.com',aud='studio-audience';
const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_strategy_registry.sql',import.meta.url),'utf8'));
class Prepared{constructor(sql){this.sql=sql;this.args=[]}bind(...args){this.args=args;return this}run(){const r=db.prepare(this.sql).run(...this.args);return {meta:{changes:r.changes}}}all(){return {results:db.prepare(this.sql).all(...this.args)}}first(){return db.prepare(this.sql).get(...this.args)}}
const D1={prepare:sql=>new Prepared(sql),batch:async queries=>{db.exec('BEGIN');try{const results=queries.map(q=>q.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}};
const env={ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:aud,FEED_OWNER_EMAIL:'owner@example.com',RESEARCH_DB:D1};
let token;
const b64=x=>Buffer.from(x).toString('base64url');
before(async()=>{
 const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await webcrypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='studio-key';
 const now=Math.floor(Date.now()/1000),h=b64(JSON.stringify({alg:'RS256',kid:jwk.kid})),p=b64(JSON.stringify({iss:team,aud,iat:now-1,exp:now+1000,email:'owner@example.com'}));
 const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(h+'.'+p));token=h+'.'+p+'.'+b64(new Uint8Array(signature));
 globalThis.fetch=async input=>String(input).includes('/certs')?Response.json({keys:[jwk]}):new Response('not found',{status:404});
});
const request=(path,method='GET',body)=>new Request(url+path,{method,headers:{'cf-access-jwt-assertion':token,...(body?{'content-type':'application/json','origin':url}:{})},...(body?{body:JSON.stringify(body)}:{})});
const spec={name:'BTC USD short-horizon study',hypothesis:'Reversion after an observed short-horizon deviation may exceed costs.',universe:'BTC-USD / Coinbase Exchange',signal_family:'custom_research',entry_logic:'Enter when z-score below -2 on past closed candles.',exit_logic:'Exit after z-score crosses zero.',risk_controls:'Cap notional; test fees and slippage.',parameters:{window:30,z:-2},references:['https://doi.org/10.0000/example']};
let id;
test('create draft persists registry version and audit atomically',async()=>{
 const r=await worker.fetch(request('/api/strategies','POST',spec),env);const body=await r.json();assert.equal(r.status,201,JSON.stringify(body));id=body.id;
 assert.equal(body.version,1);assert.equal(db.prepare('select count(*) as n from strategy_registry').get().n,1);
 assert.equal(db.prepare('select count(*) as n from strategy_versions').get().n,1);
 assert.equal(db.prepare('select count(*) as n from strategy_events').get().n,1);
});
test('list returns saved strategy without synthetic records',async()=>{const r=await worker.fetch(request('/api/strategies'),env);const data=await r.json();assert.equal(r.status,200);assert.equal(data.strategies.length,1);assert.equal(data.strategies[0].parameters.window,30)});
test('reading strategy exposes version and audit history',async()=>{const r=await worker.fetch(request('/api/strategies/'+id),env),data=await r.json();assert.equal(r.status,200);assert.equal(data.versions.length,1);assert.equal(data.events.length,1)});
test('revision preserves old specification',async()=>{
 const r=await worker.fetch(request(`/api/strategies/${id}/versions`,'POST',{...spec,name:'BTC USD revised hypothesis',expected_version:1}),env);
 assert.equal(r.status,200,await r.text());
 assert.equal(db.prepare('select count(*) as n from strategy_versions').get().n,2);
 assert.equal(db.prepare('select version as v from strategy_registry where id=?').get(id).v,2);
});
test('stale version conflict cannot overwrite a newer version',async()=>{const r=await worker.fetch(request(`/api/strategies/${id}/versions`,'POST',{...spec,expected_version:1}),env);assert.equal(r.status,409);assert.equal(db.prepare('select count(*) as n from strategy_versions').get().n,2)});
test('cannot register malformed research or executable JSON arrays',async()=>{const r=await worker.fetch(request('/api/strategies','POST',{...spec,parameters:[]}),env);assert.equal(r.status,400)});
test('archive requires rationale; final archived draft cannot be revised',async()=>{
 const bad=await worker.fetch(request(`/api/strategies/${id}/archive`,'POST',{reason:'x'}),env);assert.equal(bad.status,400);
 const r=await worker.fetch(request(`/api/strategies/${id}/archive`,'POST',{reason:'Fails initial research acceptance criteria.'}),env);
 assert.equal(r.status,200,await r.text());
 assert.equal(db.prepare('select status from strategy_registry where id=?').get(id).status,'archived');
 const edit=await worker.fetch(request(`/api/strategies/${id}/versions`,'POST',{...spec,expected_version:2}),env);assert.equal(edit.status,409);
});
