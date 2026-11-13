/* Alpha Covariance private education-only research lab. No broker, no synthetic price rows. */
'use strict';
const $=id=>document.getElementById(id);
const state={strategies:[],datasets:[],jobs:[],papers:[],paper:null,job:null,view:'datasets',isOwner:false,engine:false};
const panels=['datasets','backtests','paper','journal','analytics'];
const text=(tag,v,cls)=>{const el=document.createElement(tag);el.textContent=v===null||v===undefined?'—':String(v);if(cls)el.className=cls;return el;};
const clear=node=>node.replaceChildren();
const number=(n,d=2)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const date=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'short',timeStyle:'short'})+' UTC':'—';};
function notice(msg,isError=false){$('notice').textContent=msg;$('notice').classList.toggle('error',isError);}
async function api(path,method='GET',data){
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json',...(data!==undefined?{'Content-Type':'application/json'}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
  const result=await response.json().catch(()=>({error:'BAD_RESPONSE',message:'Unexpected server response'}));
  if(!response.ok)throw Error(result.message||result.error||`Service ${response.status}`);
  return result;
}
const engine=(suffix,method='GET',data)=>api('/api/engine/'+suffix,method,data);
const opt=(value,label)=>{const x=document.createElement('option');x.value=value;x.textContent=label;return x;};
function showView(view){
  state.view=panels.includes(view)?view:'datasets';location.hash='#'+state.view;
  for(const v of panels)$('screen-'+v).classList.toggle('hidden',v!==state.view);
  for(const link of document.querySelectorAll('.view-control'))link.classList.toggle('selected',link.dataset.view===state.view);
  $('breadcrumb').textContent=state.view==='paper'?'PAPER EXECUTION':state.view==='backtests'?'BACKTEST STUDIO':state.view==='journal'?'TRADE JOURNAL':state.view==='analytics'?'RISK & FACTORS':'DATA PROVENANCE';
  if(state.view==='journal')renderJournal();if(state.view==='paper')renderWallet();
}
function renderSelections(){
  const eligible=state.strategies.filter(s=>s.status==='draft');
  for(const el of document.querySelectorAll('.strategies-select')){
    const old=el.value;clear(el);el.append(opt('','Select a documented strategy draft'));
    for(const s of eligible)el.append(opt(s.id,`${s.name} · v${s.version} · ${s.signal_family}`));
    if(eligible.some(s=>s.id===old))el.value=old;
  }
  for(const el of document.querySelectorAll('.dataset-select')){
    const old=el.value;clear(el);el.append(opt('','Select an authorised historical dataset'));
    for(const d of state.datasets)el.append(opt(d.id,`${d.symbol} / ${d.currency} · ${d.provider} · ${d.bar_count} bars`));
    if(state.datasets.some(d=>d.id===old))el.value=old;
  }
  const target=$('portfolio-choices');clear(target);
  if(!state.datasets.length)target.append(text('p','No licensed historical datasets registered.','empty'));
  for(const d of state.datasets){const label=text('label',`${d.symbol} · ${d.currency} · ${d.interval_seconds}s`,'portfolio-choice');const c=document.createElement('input');c.type='checkbox';c.value=d.id;c.name='dataset_ids';label.prepend(c);target.append(label);}
}
function renderDatasets(){
  const host=$('datasets-list');clear(host);
  if(!state.datasets.length){host.append(text('p','No permitted datasets are registered. The engine does not generate demonstration market prices.','empty'));return}
  for(const d of state.datasets){
    const row=text('div','','dataset-item');row.append(text('strong',`${d.symbol} · ${d.currency} / ${d.venue}`));
    row.append(text('small',`${d.provider} · ${d.bar_count} historical bars · ${d.interval_seconds}s · ${date(d.first_at)} → ${date(d.last_at)}`));
    row.append(text('small',`SHA256 ${d.checksum.slice(0,18)}… · Evidence ${d.rights_reference}`));host.append(row);
  }
}
function renderJobs(){
  const host=$('jobs-list');clear(host);
  if(!state.jobs.length){host.append(text('p','No queued or completed backtests.','empty'));return}
  for(const j of state.jobs){const button=text('button','','record-item'+(state.job===j.id?' active':''));
    button.append(text('strong',j.id.slice(0,8)+'… · '+j.status.toUpperCase()));
    button.append(text('small',date(j.updated_at)+(j.error?' · '+j.error:'')));
    button.onclick=()=>selectJob(j.id);host.append(button);
  }
}
function renderPapers(){
  const host=$('paper-list');clear(host);
  if(!state.papers.length){host.append(text('p','No virtual replay sessions.','empty'));return}
  for(const p of state.papers){const btn=text('button','','record-item'+(state.paper?.id===p.id?' active':''));
    btn.append(text('strong',p.id.slice(0,8)+'… · '+p.status.toUpperCase()));
    btn.append(text('small',`${p.currency} virtual wallet · bar index ${p.next_index} · auto ${p.auto_enabled?'ON':'OFF'} · ${date(p.updated_at)}`));
    btn.onclick=()=>selectPaper(p.id);host.append(btn);
  }
}
function settings(form){
  const f=form.elements;return {initial_cash:Number(f.namedItem('initial_cash').value),fee_bps:Number(f.namedItem('fee_bps').value),
    slippage_bps:Number(f.namedItem('slippage_bps').value),max_allocation:f.namedItem('max_allocation')?Number(f.namedItem('max_allocation').value):0.90,
    max_drawdown_stop_pct:Number(f.namedItem('max_drawdown_stop_pct').value)};
}
function selectedStrategy(form){
  const id=form.elements.namedItem('strategy_id').value,s=state.strategies.find(s=>s.id===id);
  if(!s)throw Error('Choose a saved strategy from the Research Studio');
  if(s.signal_family==='custom_research')throw Error('Custom research must receive a reviewed executable implementation before testing');
  if(s.status!=='draft')throw Error('Only current research drafts may be executed');
  return {id:s.id,version:s.version,name:s.name,signal_family:s.signal_family,parameters:s.parameters,universe:s.universe};
}
function metricCard(label,value,extra=''){
  const n=text('div','','metric');n.append(text('span',label),text('strong',value));if(extra)n.append(text('small',extra));return n;
}
function table(host,heads,rows){
  clear(host);if(!rows.length){host.append(text('p','No recorded entries.','empty'));return}
  const t=document.createElement('table'),h=document.createElement('thead'),r=document.createElement('tr');
  for(const x of heads)r.append(text('th',x));h.append(r);t.append(h);
  const body=document.createElement('tbody');for(const values of rows){const tr=document.createElement('tr');for(const v of values)tr.append(text('td',v));body.append(tr)}
  t.append(body);host.append(t);
}
function drawEquity(curve){
  const canvas=$('equity-chart'),rect=canvas.getBoundingClientRect(),w=Math.max(320,rect.width),h=240,dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  ctx.fillStyle='#0c191b';ctx.fillRect(0,0,w,h);
  if(!Array.isArray(curve)||curve.length<2)return;
  const values=curve.map(q=>q.equity),mn=Math.min(...values),mx=Math.max(...values);let gap=mx-mn;if(gap===0)gap=Math.max(1,mx*0.001);
  const sx=i=>25+(w-110)*i/(values.length-1),sy=v=>h-32-(h-65)*(v-mn)/gap;
  ctx.strokeStyle='#2a4141';ctx.lineWidth=1;for(let k=0;k<5;k++){const y=18+k*(h-55)/4;ctx.beginPath();ctx.moveTo(12,y);ctx.lineTo(w-85,y);ctx.stroke()}
  ctx.lineWidth=1.7;ctx.strokeStyle='#d3f36f';ctx.beginPath();values.forEach((v,i)=>{const x=sx(i),y=sy(v);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
  ctx.fillStyle='#a6bab5';ctx.font='10px monospace';ctx.fillText(number(mx,2),w-78,20);ctx.fillText(number(mn,2),w-78,h-35);
}
async function selectJob(id){
  state.job=id;renderJobs();try{
    const job=await engine('backtests/'+encodeURIComponent(id));$('result-job').textContent=job.status.toUpperCase()+' / '+id.slice(0,8);const host=$('backtest-metrics');clear(host);
    if(job.status!=='completed'){host.append(text('p',job.status==='failed'?`Failed: ${job.error}`:'Backtest queued or running on the local engine. It continues independently of your browser.'));drawEquity([]);clear($('backtest-fills'));return}
    const r=job.result;
    for(const [a,b,c] of [['END EQUITY',number(r.ending_equity),r.currency],['IN-SAMPLE RETURN',number(r.return_pct)+'%','Not validated alpha'],
      ['MAX DRAWDOWN',number(r.max_drawdown_pct)+'%','Historical sample'],['COMPLETED TRADES',r.completed_trades,'Closed round-trips'],
      ['WIN / LOSS',`${r.winning_trades} / ${r.losing_trades}`,'Completed trades'],['FEES',number(r.fees),r.currency],
      ['PRICE ONLY COMPARATOR',number(r.buyhold_price_change_pct)+'%','Not risk adjusted'],['PER-BAR SHARPE',number(r.per_bar_sharpe_unannualized,3),'Unannualized']])host.append(metricCard(a,b,c));
    drawEquity(r.equity_curve);table($('backtest-fills'),['HISTORICAL BAR','ACTION','VIRTUAL PRICE','QUANTITY','FEE'],
      r.fills.slice(-150).map(f=>[date(f.at),f.action,number(f.price,5),number(f.quantity,5),number(f.fee,4)]));
  }catch(e){notice(e.message,true)}
}
async function selectPaper(id){
  try{state.paper=await engine('paper/'+encodeURIComponent(id));renderPapers();renderWallet();renderJournal();}
  catch(e){notice(e.message,true)}
}
function renderWallet(){
  const p=state.paper;const host=$('wallet');clear(host);
  for(const id of ['start-replay','stop-replay','auto-enable','auto-disable','manual-buy','manual-sell'])$(id).disabled=!p;
  if(!p){host.append(text('p','No session selected.','empty'));$('replay-id').textContent='NO SESSION';return}
  $('replay-id').textContent=p.id.slice(0,8)+'… · '+p.status.toUpperCase();
  for(const [k,v,extra] of [['VIRTUAL CASH',number(p.cash),p.currency],['MARK-TO-MARKET EQUITY',number(p.equity_mark_to_market),p.currency],
    ['VIRTUAL P&L',number(p.pnl_mark_to_market),p.currency],['POSITION UNITS',number(p.qty,6),p.strategy.signal_family],
    ['REPLAY BAR',p.next_index,'Historic, not live'],['AUTOMATION',p.auto_enabled?'ON':'OFF',p.status.toUpperCase()]])host.append(metricCard(k,v,extra));
  $('start-replay').disabled=p.status!=='stopped';$('stop-replay').disabled=p.status!=='running';
  $('manual-buy').disabled=p.status==='completed';$('manual-sell').disabled=p.status==='completed';
  $('auto-enable').disabled=p.status==='completed'||p.auto_enabled;
  $('auto-disable').disabled=p.status==='completed'||!p.auto_enabled;
}
function renderJournal(){
  const p=state.paper;if(!p){$('journal-list').textContent='Select a paper session to see actual recorded virtual fills.';$('event-log').textContent='No session selected.';return}
  const f=$('journal-filter').value;
  const filtered=p.fills.filter(row=>f==='all'||f==='gain'&&row.side==='SELL'&&row.realised_pnl>0||f==='loss'&&row.side==='SELL'&&row.realised_pnl<0||f==='manual'&&row.origin==='manual'||f==='strategy'&&row.origin==='strategy');
  table($('journal-list'),['HISTORICAL TIME','SIDE','PRICE','QTY','FEE','REALIZED P&L','ORIGIN','OPENED BY','CLOSED BY'],
    filtered.map(x=>[date(x.at),x.side,number(x.price,5),number(x.quantity,5),number(x.fee,4),number(x.realised_pnl),x.origin,x.opening_attribution||'—',x.closing_attribution||'—']));
  const host=$('event-log');clear(host);
  if(!p.events.length)host.append(text('p','No persisted events.','empty'));
  for(const e of p.events){const line=text('div','','log-line');line.append(text('time',date(e.at)),text('span',e.event_type+' / '+JSON.stringify(e.details)));host.append(line)}
}
function analyticsOutput(value){$('analytics-results').textContent=JSON.stringify(value,null,2);}
async function refresh(){
  try{
    const u=await api('/api/whoami');state.isOwner=u.role==='owner';$('identity').textContent=(state.isOwner?'OWNER / ':'RESEARCHER / ')+u.email;
    if(!state.isOwner){notice('Research engine is owner-only. Private reviewer and team access requires separate data rights.',true);return}
  }catch(e){notice('Cloudflare authentication unavailable: '+e.message,true);return}
  try{const status=await engine('status');state.engine=true;$('engine-status').textContent='ENGINE CONNECTED / HISTORICAL ONLY';document.querySelector('.health-dot').classList.add('online');}
  catch(e){state.engine=false;$('engine-status').textContent='ENGINE OFFLINE';document.querySelector('.health-dot').classList.remove('online');notice('Local engine unavailable: '+e.message+'. The Desk remains protected; no fabricated data shown.',true);return}
  try{
    const [d,s,j,p]=await Promise.all([engine('datasets'),api('/api/strategies'),engine('backtests'),engine('paper')]);
    state.datasets=d.datasets;state.strategies=s.strategies;state.jobs=j.jobs;state.papers=p.sessions;
    renderSelections();renderDatasets();renderJobs();renderPapers();notice('Research engine connected · authenticated owner · authorised historical datasets only · no live broker integration.');
    if(state.paper){const fresh=state.papers.find(x=>x.id===state.paper.id);if(fresh)await selectPaper(fresh.id)}
    if(state.job&&state.view==='backtests')await selectJob(state.job);
  }catch(e){notice('Research metadata unavailable: '+e.message,true)}
}
async function submitDataset(e){e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
  try{
    const f=e.currentTarget.elements,file=f.namedItem('dataset_file').files[0];
    if(!file||file.size>4*1024*1024)throw Error('Select a genuine historical CSV file smaller than 4 MB');
    if(!f.namedItem('rights_confirm').checked)throw Error('Data licence permission must be reviewed first');
    notice('Checking bars and dataset rights…');
    const ds=await engine('datasets','POST',{csv_text:await file.text(),symbol:f.namedItem('symbol').value,venue:f.namedItem('venue').value,
      provider:f.namedItem('provider').value,currency:f.namedItem('currency').value,interval_seconds:Number(f.namedItem('interval_seconds').value),
      rights_reference:f.namedItem('rights_reference').value,allowed_uses:{historical_storage:true,algorithmic_backtesting:true,paper_replay:true}});
    e.currentTarget.reset();await refresh();notice('Historical dataset '+ds.symbol+' recorded with SHA-256 provenance. Rights declaration is not independently audited.');
  }catch(err){notice(err.message,true)}finally{btn.disabled=false}
}
async function submitBacktest(e){e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
  try{const form=e.currentTarget,s=selectedStrategy(form),dataset_id=form.elements.namedItem('dataset_id').value;
    const job=await engine('backtests','POST',{strategy:s,dataset_id,settings:settings(form)});
    state.job=job.id;await refresh();notice('Backtest queued. Your local worker will complete it even when the browser is closed.');
  }catch(err){notice(err.message,true)}finally{btn.disabled=false}
}
async function submitPaper(e){e.preventDefault();const btn=e.currentTarget.querySelector('button[type=submit]');btn.disabled=true;
  try{const form=e.currentTarget,s=selectedStrategy(form),dataset_id=form.elements.namedItem('dataset_id').value;
    const p=await engine('paper','POST',{strategy:s,dataset_id,auto_enabled:form.elements.namedItem('auto_enabled').checked,settings:settings(form)});
    state.paper=p;await refresh();notice('Historical replay created in STOPPED state. Select START / RESUME to begin virtual execution.');
  }catch(err){notice(err.message,true)}finally{btn.disabled=false}
}
async function paperAction(action,body){if(!state.paper)return;try{
  state.paper=await engine('paper/'+encodeURIComponent(state.paper.id)+'/'+action,'POST',body||{});
  await refresh();notice('Historical paper session: '+action.toUpperCase()+'. All actions persisted.');
}catch(e){notice(e.message,true)}}
async function manual(side){if(!state.paper)return;const id=crypto.randomUUID();try{
  await engine('paper/'+encodeURIComponent(state.paper.id)+'/orders','POST',{side,client_order_id:id});
  await selectPaper(state.paper.id);notice('Virtual '+side+' order queued. Fill occurs on the next replay bar after explicit START / RESUME.');
}catch(e){notice(e.message,true)}}
async function portfolio(e){e.preventDefault();const ids=[...$('portfolio-choices').querySelectorAll('input:checked')].map(x=>x.value);
  try{analyticsOutput(await engine('analytics/portfolio','POST',{dataset_ids:ids}));notice('Historical covariance computed. No portfolio recommendation is implied.');}catch(err){notice(err.message,true)}
}
async function factors(e){e.preventDefault();try{
  const id=e.currentTarget.elements.namedItem('dataset_id').value;
  analyticsOutput(await engine('analytics/factors?dataset_id='+encodeURIComponent(id)));notice('Historical descriptive factors computed. No trading signal is claimed.');
}catch(err){notice(err.message,true)}}
function init(){
  for(const link of document.querySelectorAll('.view-control'))link.addEventListener('click',e=>{e.preventDefault();showView(link.dataset.view)});
  window.addEventListener('hashchange',()=>showView(location.hash.slice(1)));
  $('dataset-form').addEventListener('submit',submitDataset);$('backtest-form').addEventListener('submit',submitBacktest);
  $('paper-form').addEventListener('submit',submitPaper);$('portfolio-form').addEventListener('submit',portfolio);$('factors-form').addEventListener('submit',factors);
  $('journal-filter').addEventListener('change',renderJournal);
  $('start-replay').addEventListener('click',()=>paperAction('resume'));
  $('stop-replay').addEventListener('click',()=>paperAction('stop'));
  $('auto-enable').addEventListener('click',()=>paperAction('auto',{enabled:true}));
  $('auto-disable').addEventListener('click',()=>paperAction('auto',{enabled:false}));
  $('manual-buy').addEventListener('click',()=>manual('BUY'));
  $('manual-sell').addEventListener('click',()=>manual('SELL'));
  showView(location.hash.slice(1));void refresh();
  setInterval(()=>{if(!document.hidden&&state.isOwner&&state.engine)void refresh()},12000);
}
document.addEventListener('DOMContentLoaded',init);
