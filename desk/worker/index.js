/** Alpha Covariance Research Desk · Stage 2 gateway.
 * Every page, asset and API response requires a verified Cloudflare Access JWT.
 * Coinbase market data is server-restricted to FEED_OWNER_EMAIL pending rights review.
 * Strategy metadata lives in D1; an optional external engine handles licensed historical backtests and simulated replay.
 * No brokerage connection or live algorithmic data consumption is permitted.
 */
const HOST = 'desk.alphacovariance.com';
const SOURCE = 'Coinbase Exchange';
const COINBASE = 'https://api.exchange.coinbase.com';
const SYMBOLS = Object.freeze(['BTC-USD', 'ETH-USD', 'SOL-USD']);
const INTERVALS = Object.freeze({ '1m':60, '5m':300, '15m':900, '1h':3600 });
let certsCache = { at: 0, data: null };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers:{
    'content-type':'application/json; charset=utf-8', 'cache-control':'private, no-store',
    'x-content-type-options':'nosniff', 'x-robots-tag':'noindex, nofollow, noarchive', 'x-ac-surface':'private-research-desk', 'vary':'Cookie, CF-Access-Jwt-Assertion'
  }});
}
function fail(status, code, message) { return json({error:code, message},status); }
function base64url(part) {
  const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(normalized+'='.repeat((4-normalized.length%4)%4)),c=>c.charCodeAt(0));
}
function parsePart(part) { return JSON.parse(new TextDecoder().decode(base64url(part))); }
async function validateAccessJwt(request,env) {
  const team=String(env.ACCESS_TEAM_DOMAIN||'').replace(/\/$/,'');
  const aud=String(env.ACCESS_AUD||'');
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)||!aud)throw Error('Access not configured');
  const token=request.headers.get('cf-access-jwt-assertion');
  if(!token||token.length>10000)throw Error('Access assertion missing');
  const parts=token.split('.');if(parts.length!==3)throw Error('Invalid JWT');
  const header=parsePart(parts[0]),payload=parsePart(parts[1]),now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||!header.kid||payload.iss!==team||
      !(Array.isArray(payload.aud)?payload.aud.includes(aud):payload.aud===aud)||
      !Number.isFinite(payload.exp)||payload.exp<=now||
      !Number.isFinite(payload.iat)||payload.iat>now+60||
      (payload.nbf!==undefined&&payload.nbf>now+60)||
      typeof payload.email!=='string'||!payload.email.includes('@'))throw Error('Invalid claims');
  const getCerts=async()=>{
    const response=await fetch(`${team}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error('Key discovery failure');
    const data=await response.json();if(!Array.isArray(data.keys))throw Error('Invalid JWKS');
    certsCache={data:data.keys,at:Date.now()};
  };
  if(!certsCache.data||Date.now()-certsCache.at>300000)await getCerts();
  let jwk=certsCache.data.find(k=>k.kid===header.kid&&k.kty==='RSA');
  if(!jwk){await getCerts();jwk=certsCache.data.find(k=>k.kid===header.kid&&k.kty==='RSA');}
  if(!jwk)throw Error('Unrecognized signing key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!valid)throw Error('Bad signature');
  const email=payload.email.trim().toLowerCase();
  const owner=String(env.FEED_OWNER_EMAIL||'').trim().toLowerCase();
  return {email, owner:owner.length>3&&email===owner};
}
async function upstream(path) {
  const response=await fetch(`${COINBASE}${path}`,{
    headers:{accept:'application/json'},signal:AbortSignal.timeout(7500)
  });
  if(!response.ok)throw Error('Market data provider unavailable');
  const type=response.headers.get('content-type')||'';
  if(!type.includes('json'))throw Error('Unexpected provider response type');
  return response.json();
}
const positive=v=>Number.isFinite(Number(v))&&Number(v)>0;
export function normalizeCandles(rows,seconds,now=Date.now()) {
  if(!Array.isArray(rows)||rows.length<1||rows.length>1000)throw Error('Invalid OHLC response size');
  const candles=[],seen=new Map();
  for(const r of rows){
    if(!Array.isArray(r)||r.length<6)throw Error('Malformed OHLC row');
    const [rawTs,rawLow,rawHigh,rawOpen,rawClose,rawVolume]=r;
    const [t,l,h,o,c,v]=[Number(rawTs)*1000,Number(rawLow),Number(rawHigh),Number(rawOpen),Number(rawClose),Number(rawVolume)];
    if(!Number.isInteger(t)||t<1_600_000_000_000||t>now+seconds*1000||
       ![l,h,o,c].every(positive)||!Number.isFinite(v)||v<0||
       l>Math.min(o,c)||h<Math.max(o,c)||l>h)throw Error('Unverified OHLC row');
    const prior=seen.get(t),row={t,o,h,l,c,v,closed:t+seconds*1000<=now};
    if(prior){if(JSON.stringify({...prior,closed:false})!==JSON.stringify({...row,closed:false}))throw Error('Conflicting duplicate OHLC timestamp');continue;}
    seen.set(t,row);candles.push(row);
  }
  candles.sort((a,b)=>a.t-b.t);
  const selected=candles.slice(-240),latest=selected.at(-1);
  if(!latest||now-latest.t>seconds*1000*6)throw Error('Stale OHLC data');
  let missingIntervals=0;
  for(let i=1;i<selected.length;i++){
    const diff=selected[i].t-selected[i-1].t;
    if(diff<seconds*1000||diff%(seconds*1000)!==0)throw Error('Unexpected candle spacing');
    missingIntervals+=diff/(seconds*1000)-1;
  }
  return {candles:selected,missingIntervals,lastCandleAt:new Date(latest.t).toISOString()};
}
async function marketAPI(url) {
  if(url.pathname==='/api/markets'){
    const tickers=await Promise.all(SYMBOLS.map(async symbol=>{
      const raw=await upstream(`/products/${symbol}/ticker`);
      if(!positive(raw.price))throw Error('Unverified ticker price');
      const quoteTime=typeof raw.time==='string'?Date.parse(raw.time):NaN;
      if(!Number.isFinite(quoteTime)||quoteTime>Date.now()+60000||Date.now()-quoteTime>180000)throw Error('Stale ticker');
      return {symbol,price:Number(raw.price),change24h:null,quoteTime:new Date(quoteTime).toISOString()};
    }));
    return json({source:SOURCE,quoteCurrency:'USD',receivedAt:new Date().toISOString(),tickers});
  }
  if(url.pathname==='/api/candles'){
    const symbol=url.searchParams.get('symbol'),interval=url.searchParams.get('interval')||'1m';
    if(!SYMBOLS.includes(symbol)||!Object.hasOwn(INTERVALS,interval))return fail(400,'INVALID_INSTRUMENT','Unsupported symbol or interval');
    const seconds=INTERVALS[interval],end=new Date(),start=new Date(end.getTime()-230*seconds*1000);
    const path=`/products/${symbol}/candles?granularity=${seconds}&start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const raw=await upstream(path);
    const normalized=normalizeCandles(raw,seconds);
    return json({source:SOURCE,quoteCurrency:'USD',symbol,interval,receivedAt:new Date().toISOString(),...normalized});
  }
  return fail(404,'NOT_FOUND','Unknown market route');
}
function validateStrategy(body) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid strategy');
  const keys=['name','hypothesis','universe','signal_family','entry_logic','exit_logic','risk_controls','parameters','references'];
  const data={};
  for(const k of keys)data[k]=body[k];
  for(const k of ['name','hypothesis','universe','signal_family','entry_logic','exit_logic','risk_controls']){
    if(typeof data[k]!=='string'||data[k].trim().length<3||data[k].length>(k==='name'?100:2500))throw Error(`Invalid ${k}`);
    data[k]=data[k].trim();
  }
  if(!['moving_average_cross','mean_reversion','momentum','custom_research'].includes(data.signal_family))throw Error('Unsupported strategy family');
  if(!data.parameters||typeof data.parameters!=='object'||Array.isArray(data.parameters)||
      JSON.stringify(data.parameters).length>6000||Object.keys(data.parameters).length>40)throw Error('Invalid parameters');
  if(!Array.isArray(data.references)||data.references.length>12||data.references.some(x=>typeof x!=='string'||x.length>350||!/^https:\/\//.test(x)))throw Error('Invalid references');
  return data;
}
async function readJson(request) {
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))throw Error('Content type must be application/json');
  const raw=await request.text();if(raw.length>14000)throw Error('Request too large');
  return JSON.parse(raw);
}
const snapshot=row=>({name:row.name,hypothesis:row.hypothesis,universe:row.universe,signal_family:row.signal_family,entry_logic:row.entry_logic,exit_logic:row.exit_logic,risk_controls:row.risk_controls,parameters:row.parameters,references:row.references});
function unpack(row){return {...row,parameters:JSON.parse(row.parameters_json),references:JSON.parse(row.references_json)};}
async function strategyAPI(request,url,env,user){
  if(!user.owner && user.role!=='reviewer')return fail(403,'RESTRICTED','Reviewer membership required');
  if(!user.owner && request.method!=='GET')return fail(403,'READ_ONLY','Reviewers cannot change research specifications');
  if(!env.RESEARCH_DB)return fail(503,'STORAGE_NOT_CONFIGURED','Research database is not configured');
  const db=env.RESEARCH_DB,parts=url.pathname.split('/').filter(Boolean);
  const ownerEmail=user.owner?user.email:String(env.FEED_OWNER_EMAIL||'').trim().toLowerCase();
  try{
    if(parts.length===2&&request.method==='GET'){
      const rs=await db.prepare('SELECT * FROM strategy_registry WHERE owner_email = ? ORDER BY updated_at DESC LIMIT 100').bind(ownerEmail).all();
      return json({strategies:(rs.results||[]).map(unpack),storage:'D1',trading:'disabled'});
    }
    if(parts.length===2&&request.method==='POST'){
      const data=validateStrategy(await readJson(request)),id=crypto.randomUUID(),now=new Date().toISOString();
      await db.batch([
        db.prepare(`INSERT INTO strategy_registry (id,owner_email,name,hypothesis,universe,signal_family,entry_logic,exit_logic,risk_controls,parameters_json,references_json,status,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'draft',1,?,?)`).bind(id,user.email,data.name,data.hypothesis,data.universe,data.signal_family,data.entry_logic,data.exit_logic,data.risk_controls,JSON.stringify(data.parameters),JSON.stringify(data.references),now,now),
        db.prepare('INSERT INTO strategy_versions (id,strategy_id,version,snapshot_json,created_at) VALUES (?,?,1,?,?)').bind(crypto.randomUUID(),id,JSON.stringify(snapshot(data)),now),
        db.prepare('INSERT INTO strategy_events (id,strategy_id,actor,event_type,created_at,details_json) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),id,user.email,'created',now,'{}')
      ]);
      return json({id,version:1,status:'draft'},201);
    }
    const id=parts[2];
    if(parts.length===3&&request.method==='GET'){
      const row=await db.prepare('SELECT * FROM strategy_registry WHERE id=? AND owner_email=?').bind(id,ownerEmail).first();
      if(!row)return fail(404,'NOT_FOUND','No strategy found');
      const versions=await db.prepare('SELECT version, snapshot_json, created_at FROM strategy_versions WHERE strategy_id=? ORDER BY version DESC').bind(id).all();
      const events=await db.prepare('SELECT event_type, created_at, details_json FROM strategy_events WHERE strategy_id=? ORDER BY created_at DESC').bind(id).all();
      let runLinks=[],reviewNotes=[];
      try{const rs=await db.prepare('SELECT run_type,engine_job_id,dataset_id,strategy_version,created_at FROM research_run_links WHERE strategy_id=? ORDER BY created_at DESC LIMIT 25').bind(id).all();runLinks=rs.results||[];}catch{ /* pre-R1.2 database: no index yet */ }
      try{const rs=user.owner?
        await db.prepare('SELECT reviewer_email,strategy_version,recommendation,note,created_at FROM review_feedback WHERE strategy_id=? ORDER BY created_at DESC LIMIT 40').bind(id).all():
        await db.prepare('SELECT reviewer_email,strategy_version,recommendation,note,created_at FROM review_feedback WHERE strategy_id=? AND reviewer_email=? ORDER BY created_at DESC LIMIT 40').bind(id,user.email).all();
        reviewNotes=rs.results||[];}catch{ /* older D1 migration */ }
      return json({strategy:unpack(row),versions:versions.results||[],events:events.results||[],runs:runLinks,reviews:reviewNotes});
    }
    if(parts.length===4&&parts[3]==='versions'&&request.method==='POST'){
      const body=await readJson(request),data=validateStrategy(body),expected=Number(body.expected_version);
      if(!Number.isInteger(expected)||expected<1)return fail(400,'INVALID_VERSION','Expected version required');
      const now=new Date().toISOString(),v=expected+1,vid=crypto.randomUUID();
      const results=await db.batch([
        db.prepare(`UPDATE strategy_registry SET name=?,hypothesis=?,universe=?,signal_family=?,entry_logic=?,exit_logic=?,risk_controls=?,parameters_json=?,references_json=?,version=?,updated_at=? WHERE id=? AND owner_email=? AND version=? AND status='draft'`).bind(data.name,data.hypothesis,data.universe,data.signal_family,data.entry_logic,data.exit_logic,data.risk_controls,JSON.stringify(data.parameters),JSON.stringify(data.references),v,now,id,user.email,expected),
        db.prepare('INSERT INTO strategy_versions (id,strategy_id,version,snapshot_json,created_at) SELECT ?,id,?,?,? FROM strategy_registry WHERE id=? AND owner_email=? AND version=? AND changes()>0').bind(vid,v,JSON.stringify(snapshot(data)),now,id,user.email,v),
        db.prepare('INSERT INTO strategy_events (id,strategy_id,actor,event_type,created_at,details_json) SELECT ?,id,?,?,?,? FROM strategy_registry WHERE id=? AND owner_email=? AND version=? AND EXISTS(SELECT 1 FROM strategy_versions WHERE id=?)').bind(crypto.randomUUID(),user.email,'revised',now,JSON.stringify({version:v}),id,user.email,v,vid)
      ]);
      if(!results[0]?.meta?.changes)return fail(409,'VERSION_CONFLICT','Strategy is changed, archived or unavailable');
      return json({id,version:v,status:'draft'});
    }
    if(parts.length===4&&parts[3]==='archive'&&request.method==='POST'){
      const body=await readJson(request),reason=body?.reason;
      if(typeof reason!=='string'||reason.trim().length<4||reason.length>1000)return fail(400,'INVALID_REASON','Archive rationale required');
      const now=new Date().toISOString(),eventId=crypto.randomUUID();
      const results=await db.batch([
        db.prepare(`UPDATE strategy_registry SET status='archived',archived_at=?,updated_at=? WHERE id=? AND owner_email=? AND status='draft'`).bind(now,now,id,user.email),
        db.prepare(`INSERT INTO strategy_events (id,strategy_id,actor,event_type,created_at,details_json) SELECT ?,id,?,?,?,? FROM strategy_registry WHERE id=? AND owner_email=? AND status='archived' AND changes()>0`).bind(eventId,user.email,'archived',now,JSON.stringify({reason:reason.trim()}),id,user.email)
      ]);
      if(!results[0]?.meta?.changes)return fail(409,'CANNOT_ARCHIVE','Draft strategy unavailable');
      return json({id,status:'archived'});
    }
    return fail(404,'NOT_FOUND','Unknown strategy route');
  }catch(e){
    if(e instanceof SyntaxError||/^Invalid |^Unsupported |^Content type |^Request too large/.test(e.message))return fail(400,'INVALID_RESEARCH_SPEC',e.message);
    return fail(503,'RESEARCH_STORAGE_ERROR','Research storage is unavailable');
  }
}

// Only Cloudflare Access-authenticated emails explicitly assigned to a non-expired
// reviewer slot can read research. No password or login secret is stored in D1.
async function grantRole(user,env){
  if(user.owner)return {...user,role:'owner',reviewerSlot:null};
  if(!env.RESEARCH_DB)return {...user,role:'restricted',reviewerSlot:null};
  try{
    const slot=await env.RESEARCH_DB.prepare('SELECT slot FROM reviewer_slots WHERE reviewer_email=? AND expires_at>?')
      .bind(user.email,new Date().toISOString()).first();
    if(slot)return {...user,role:'reviewer',reviewerSlot:slot.slot};
  }catch{ /* migration absent: deny by default */ }
  return {...user,role:'restricted',reviewerSlot:null};
}
async function reviewerAPI(request,url,env,user){
  if(!env.RESEARCH_DB)return fail(503,'STORAGE_NOT_CONFIGURED','Review registry unavailable');
  const db=env.RESEARCH_DB,now=new Date().toISOString();
  if(url.pathname==='/api/reviewers'){
    if(!user.owner)return fail(403,'OWNER_ONLY','Reviewer administration restricted');
    if(request.method==='GET'){
      try{const r=await db.prepare('SELECT slot, reviewer_email, expires_at, assigned_at FROM reviewer_slots ORDER BY slot').all();
        return json({slots:r.results||[],login:'Cloudflare Access OTP',passwords_stored:false});}
      catch{return fail(503,'STORAGE_ERROR','Reviewer registry unavailable');}
    }
    if(request.method==='POST'){
      try{
        const body=await readJson(request),slot=Number(body.slot),email=body.email===null?null:String(body.email||'').trim().toLowerCase();
        if(!Number.isInteger(slot)||slot<1||slot>5)return fail(400,'INVALID_SLOT','Slot must be between 1 and 5');
        if(email!==null&&(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)||email.length>254||email===user.email))return fail(400,'INVALID_EMAIL','Provide a real reviewer email inbox');
        const hours=Number(body.hours??24);
        if(email!==null&&(!Number.isInteger(hours)||hours<1||hours>168))return fail(400,'INVALID_EXPIRY','Expiry must be 1 to 168 hours');
        const expires=email?new Date(Date.now()+hours*3600000).toISOString():null;
        await db.prepare('UPDATE reviewer_slots SET reviewer_email=?,expires_at=?,assigned_at=? WHERE slot=?')
          .bind(email,expires,email?now:null,slot).run();
        return json({slot,reviewer_email:email,expires_at:expires,requires_cloudflare_access_allowlist:true});
      }catch(e){if(e instanceof SyntaxError)return fail(400,'INVALID_JSON','Invalid input');
        return fail(409,'REVIEWER_ASSIGNMENT_FAILED','Slot or email conflict');}
    }
    return fail(405,'METHOD_NOT_ALLOWED','GET and POST only');
  }
  if(url.pathname==='/api/reviews'){
    if(request.method==='GET'){
      if(!user.owner)return fail(403,'OWNER_ONLY','Review history reserved for the owner');
      try{const r=await db.prepare('SELECT id,slot,reviewer_email,strategy_id,strategy_version,recommendation,note,created_at FROM review_feedback ORDER BY created_at DESC LIMIT 200').all();
        return json({reviews:r.results||[]});}
      catch{return fail(503,'STORAGE_ERROR','Review history unavailable');}
    }
    if(request.method==='POST'){
      if(user.role!=='reviewer')return fail(403,'REVIEWER_ONLY','Valid reviewer appointment required');
      try{
        const body=await readJson(request),id=String(body.strategy_id||''),recommendation=String(body.recommendation||''),note=String(body.note||'').trim();
        if(!/^[a-f0-9-]{36}$/i.test(id)||!['evaluate','revise','reject'].includes(recommendation)||note.length<12||note.length>2000)
          return fail(400,'INVALID_REVIEW','Strategy, recommendation and a 12-2000 character note required');
        const owner=String(env.FEED_OWNER_EMAIL||'').trim().toLowerCase();
        const strategy=await db.prepare('SELECT version FROM strategy_registry WHERE id=? AND owner_email=?').bind(id,owner).first();
        if(!strategy)return fail(404,'NOT_FOUND','Strategy unavailable');
        // Re-check expiry immediately before mutation (not only during authentication).
        const active=await db.prepare('SELECT slot FROM reviewer_slots WHERE slot=? AND reviewer_email=? AND expires_at>?').bind(user.reviewerSlot,user.email,now).first();
        if(!active)return fail(403,'REVIEW_EXPIRED','Reviewer appointment expired');
        await db.prepare('INSERT INTO review_feedback(id,slot,reviewer_email,strategy_id,strategy_version,recommendation,note,created_at) VALUES (?,?,?,?,?,?,?,?)')
          .bind(crypto.randomUUID(),active.slot,user.email,id,strategy.version,recommendation,note,now).run();
        return json({saved:true,strategy_id:id,version:strategy.version},201);
      }catch(e){return fail(503,'REVIEW_STORAGE_ERROR','Review submission unavailable');}
    }
    return fail(405,'METHOD_NOT_ALLOWED','GET and POST only');
  }
  return fail(404,'NOT_FOUND','Unknown reviewer route');
}
async function runLinksAPI(request,env,user){
  if(!user.owner)return fail(403,'OWNER_ONLY','Run history restricted to owner');
  if(!env.RESEARCH_DB)return fail(503,'STORAGE_NOT_CONFIGURED','Research storage unavailable');
  if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Read-only index');
  try{const r=await env.RESEARCH_DB.prepare('SELECT * FROM research_run_links ORDER BY created_at DESC LIMIT 200').all();
    return json({runs:r.results||[],detail_source:'local_historical_engine'});}
  catch{return fail(503,'STORAGE_ERROR','Run index unavailable');}
}

async function researchEngineAPI(request, url, env, user) {
  if (!user.owner) return fail(403,'OWNER_ONLY','Historical research engine restricted to the owner');
  const origin=String(env.RESEARCH_ENGINE_ORIGIN || '');
  const secret=String(env.RESEARCH_ENGINE_TOKEN || '');
  if (origin !== 'https://engine.alphacovariance.com' || secret.length < 40) {
    return fail(503,'ENGINE_NOT_CONFIGURED','Local research engine not connected');
  }
  if (request.method !== 'GET' && request.method !== 'POST') return fail(405,'METHOD_NOT_ALLOWED','Engine accepts GET and POST only');
  if (url.pathname.length > 300 || url.search.length > 500) return fail(400,'INVALID_ROUTE','Request path too long');
  let body;
  if (request.method === 'POST') {
    const type=request.headers.get('content-type')||'';
    if (!type.toLowerCase().startsWith('application/json'))return fail(415,'JSON_REQUIRED','Engine requires JSON content');
    const declared=Number(request.headers.get('content-length')||0);
    if (declared>5*1024*1024)return fail(413,'PAYLOAD_TOO_LARGE','Research payload exceeds 5 MB');
    body=await request.text();
    if (body.length > 5*1024*1024)return fail(413,'PAYLOAD_TOO_LARGE','Research payload exceeds 5 MB');
  }
  // The browser never receives the internal token. Reject redirects and unexpected responses.
  const upstreamUrl=origin+url.pathname+url.search;
  try {
    const response=await fetch(upstreamUrl,{
      method:request.method,redirect:'manual',
      headers:{'X-Alpha-Engine-Token':secret,'Accept':'application/json','Content-Type':'application/json'},
      ...(body!==undefined?{body}:{}),signal:AbortSignal.timeout(25000),
      cf:{cacheTtl:0,cacheEverything:false}
    });
    if (response.status>=300 && response.status<400)return fail(502,'ENGINE_REDIRECT_BLOCKED','Unexpected research-engine redirect');
    if (!(response.headers.get('content-type')||'').includes('application/json'))return fail(502,'ENGINE_RESPONSE_INVALID','Research engine unavailable');
    if(response.ok&&request.method==='POST'&&['/api/engine/backtests','/api/engine/paper'].includes(url.pathname)&&env.RESEARCH_DB){
      // The engine commits the authoritative results, orders and fills to SQLite WAL.
      // This secondary D1 index links cloud strategy versions to those durable jobs.
      try{
        const submitted=JSON.parse(body),result=await response.clone().json();
        const strategy=submitted.strategy||{};
        if(typeof result.id==='string'&&typeof strategy.id==='string'&&Number.isInteger(strategy.version)){
          const kind=url.pathname.endsWith('paper')?'paper':'backtest';
          await env.RESEARCH_DB.prepare('INSERT OR IGNORE INTO research_run_links(id,strategy_id,strategy_version,dataset_id,engine_job_id,run_type,created_at) VALUES (?,?,?,?,?,?,?)')
            .bind(crypto.randomUUID(),strategy.id,strategy.version,String(submitted.dataset_id||''),result.id,kind,new Date().toISOString()).run();
        }
      }catch{ /* Engine's durable job remains authoritative if D1 index is temporarily unavailable. */ }
    }
    const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
      'x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','x-ac-surface':'private-research-desk'});
    return new Response(response.body,{status:response.status,headers});
  }catch{return fail(503,'ENGINE_OFFLINE','Local research engine is offline or unreachable');}
}

function privateHeaders(response){
  const h=new Headers(response.headers);
  h.set('cache-control','private, no-store');h.set('x-content-type-options','nosniff');
  h.set('referrer-policy','no-referrer');h.set('x-frame-options','DENY');
  h.set('x-robots-tag','noindex, nofollow, noarchive');h.set('x-ac-surface','private-research-desk');
  h.set('content-security-policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return new Response(response.body,{status:response.status,headers:h});
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.hostname!==HOST)return new Response('Not found',{status:404});
  let user;
  try{user=await validateAccessJwt(request,env);}catch{
    return new Response('Research Desk access denied',{status:403,headers:{'cache-control':'no-store','content-type':'text/plain'}});
  }
  user=await grantRole(user,env);
  if(request.method!=='GET'&&request.method!=='HEAD'&&request.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED','Request method not supported');
  if(request.method==='POST'){
    if(request.headers.get('origin')!==url.origin)return fail(403,'ORIGIN_DENIED','Cross-origin write denied');
  }
  if(url.pathname==='/api/whoami'&&request.method==='GET')return json({email:user.email,role:user.role});
  if(url.pathname==='/api/status'&&request.method==='GET')return json({service:'alpha-covariance-desk',source:SOURCE,market_feed:user.owner&&env.MARKET_DATA_OWNER_DISPLAY==='enabled'?'owner-display-enabled':'restricted',data_rights:'display-only-owner-review; not licensed for algorithms or external display',storage_configured:!!env.RESEARCH_DB,execution:env.RESEARCH_ENGINE_ORIGIN==='https://engine.alphacovariance.com'?'historical-replay-configured':'disabled'});
  if(url.pathname==='/api/reviewers'||url.pathname==='/api/reviews')return reviewerAPI(request,url,env,user);
  if(url.pathname==='/api/runs')return runLinksAPI(request,env,user);
  if(url.pathname.startsWith('/api/strategies'))return strategyAPI(request,url,env,user);
  if(url.pathname.startsWith('/api/engine/'))return researchEngineAPI(request,url,env,user);
  if(url.pathname.startsWith('/api/')){
    if(!user.owner)return fail(403,'OWNER_ONLY','Market-data access restricted pending provider rights review');
    if(env.MARKET_DATA_OWNER_DISPLAY!=='enabled')return fail(403,'FEED_NOT_APPROVED','Market display requires a documented provider-rights check');
    if(request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Market data is read-only');
    try{return await marketAPI(url);}catch{return fail(502,'MARKET_FEED_UNAVAILABLE','Verified market data unavailable');}
  }
  if(request.method!=='GET'&&request.method!=='HEAD')return fail(405,'METHOD_NOT_ALLOWED','Only API write routes accept POST');
  const path=url.pathname==='/'?'/index.html':url.pathname;
  try{const file=await env.ASSETS.fetch(new Request(new URL(path,url.origin),request));return privateHeaders(file);}
  catch{return new Response('Private asset unavailable',{status:503,headers:{'cache-control':'no-store'}});}
}};
