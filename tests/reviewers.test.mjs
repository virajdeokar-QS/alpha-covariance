import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../desk/worker/index.js';
const root='https://desk.alphacovariance.com',team='https://r12review.cloudflareaccess.com',aud='r12review';
const db=new DatabaseSync(':memory:');
for(const file of ['0001_strategy_registry.sql','0002_review_and_run_links.sql'])
 db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
class Statement{constructor(sql){this.sql=sql;this.args=[]}bind(...a){this.args=a;return this}
 run(){const r=db.prepare(this.sql).run(...this.args);return {meta:{changes:r.changes}}}
 all(){return {results:db.prepare(this.sql).all(...this.args)}}
 first(){return db.prepare(this.sql).get(...this.args)}}
const d1={prepare:sql=>new Statement(sql),batch:async q=>{db.exec('BEGIN');try{const res=q.map(x=>x.run());db.exec('COMMIT');return res}catch(e){db.exec('ROLLBACK');throw e}}};
const env={ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:aud,FEED_OWNER_EMAIL:'owner@example.com',RESEARCH_DB:d1,RESEARCH_ENGINE_ORIGIN:'https://engine.alphacovariance.com',RESEARCH_ENGINE_TOKEN:'X'.repeat(48)};
let tokens={};const b64=x=>Buffer.from(x).toString('base64url');
before(async()=>{
 const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await webcrypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='reviewer-signing-key';
 for(const email of ['owner@example.com','reviewer@example.com','stranger@example.com']){
  const now=Math.floor(Date.now()/1000),h=b64(JSON.stringify({alg:'RS256',kid:jwk.kid})),p=b64(JSON.stringify({iss:team,aud,iat:now-1,exp:now+1000,email}));
  const sig=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(h+'.'+p));
  tokens[email]=h+'.'+p+'.'+b64(new Uint8Array(sig));
 }
 globalThis.fetch=async input=>String(input).includes('/certs')?Response.json({keys:[jwk]}):String(input).startsWith('https://engine.alphacovariance.com/api/engine/')?Response.json({id:webcrypto.randomUUID(),status:'queued'},{status:202}):new Response('not found',{status:404});
});
const req=(who,path,method='GET',body)=>new Request(root+path,{method,headers:{'cf-access-jwt-assertion':tokens[who],...(body?{'content-type':'application/json','origin':root}:{})},...(body?{body:JSON.stringify(body)}:{})});
const spec={name:'Owner strategy for review',hypothesis:'Research price persistence after costs and report limitations.',universe:'Test instruments',signal_family:'moving_average_cross',entry_logic:'Cross above the slow MA.',exit_logic:'Cross below the slow MA.',risk_controls:'Long only, capped exposure.',parameters:{fast:5,slow:15},references:[]};
let strategyId;
test('five reviewer slots exist but no reviewer is trusted initially',async()=>{
 assert.equal(db.prepare('SELECT count(*) AS n FROM reviewer_slots').get().n,5);
 const denial=await worker.fetch(req('reviewer@example.com','/api/strategies'),env);
 assert.equal(denial.status,403);
 const who=await worker.fetch(req('reviewer@example.com','/api/whoami'),env);
 assert.equal((await who.json()).role,'restricted');
});
test('owner registers strategy and appoints reviewer with bounded expiry',async()=>{
 const saved=await worker.fetch(req('owner@example.com','/api/strategies','POST',spec),env);
 assert.equal(saved.status,201);strategyId=(await saved.json()).id;
 const r=await worker.fetch(req('owner@example.com','/api/reviewers','POST',{slot:1,email:'reviewer@example.com',hours:24}),env);
 assert.equal(r.status,200,await r.text());
 const roster=await worker.fetch(req('owner@example.com','/api/reviewers'),env);
 assert.equal((await roster.json()).slots[0].reviewer_email,'reviewer@example.com');
});
test('reviewer sees owner strategy across logins but cannot edit or run',async()=>{
 const who=await worker.fetch(req('reviewer@example.com','/api/whoami'),env);
 assert.equal((await who.json()).role,'reviewer');
 const listing=await worker.fetch(req('reviewer@example.com','/api/strategies'),env);
 assert.equal((await listing.json()).strategies[0].id,strategyId);
 assert.equal((await worker.fetch(req('reviewer@example.com','/api/strategies','POST',spec),env)).status,403);
 assert.equal((await worker.fetch(req('reviewer@example.com','/api/markets'),env)).status,403);
 assert.equal((await worker.fetch(req('reviewer@example.com','/api/engine/status'),env)).status,403);
 assert.equal((await worker.fetch(req('stranger@example.com','/api/strategies'),env)).status,403);
});
test('backtest proxy records strategy version and local job link in D1',async()=>{
 const r=await worker.fetch(req('owner@example.com','/api/engine/backtests','POST',{
   strategy:{id:strategyId,version:1,name:'Research example'},dataset_id:'licensed-demo-export',settings:{initial_cash:10000}
 }),env);
 assert.equal(r.status,202,await r.text());
 const links=await worker.fetch(req('owner@example.com','/api/runs'),env),payload=await links.json();
 assert.equal(payload.runs.length,1);assert.equal(payload.runs[0].strategy_id,strategyId);
 assert.equal(payload.runs[0].run_type,'backtest');
 const detail=await worker.fetch(req('owner@example.com','/api/strategies/'+strategyId),env);
 assert.equal((await detail.json()).runs.length,1);
 assert.equal((await worker.fetch(req('reviewer@example.com','/api/runs'),env)).status,403);
});
test('review is persisted and expires with assigned slot',async()=>{
 const response=await worker.fetch(req('reviewer@example.com','/api/reviews','POST',{strategy_id:strategyId,recommendation:'revise',note:'Review sensitivity to fees and out-of-sample periods.'}),env);
 assert.equal(response.status,201,await response.text());
 const feedback=await worker.fetch(req('owner@example.com','/api/reviews'),env);
 assert.equal((await feedback.json()).reviews.length,1);
 db.prepare('UPDATE reviewer_slots SET expires_at=? WHERE slot=1').run('2020-01-01T00:00:00Z');
 const denied=await worker.fetch(req('reviewer@example.com','/api/strategies'),env);
 assert.equal(denied.status,403);
 assert.equal((await worker.fetch(req('reviewer@example.com','/api/reviews','POST',{strategy_id:strategyId,recommendation:'revise',note:'Should no longer be permitted to review.'}),env)).status,403);
});
