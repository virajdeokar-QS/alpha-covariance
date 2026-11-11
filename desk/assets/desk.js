/* Alpha Covariance Desk 0.1 — no mock prices, orders, or strategies. */
'use strict';
const $ = id => document.getElementById(id);
const TICKERS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT'];
const LABELS = {BTCUSDT:'Bitcoin',ETHUSDT:'Ethereum',SOLUSDT:'Solana',BNBUSDT:'BNB'};
const state = { market: 'crypto', view: 'overview', symbol: 'BTCUSDT', interval: '1m', quotes: null, candles: [], candleFetched: null, mouseX: null, busy: false, live: false };
const routeTitles = { overview:'GLOBAL MARKETS',terminal:'MARKET TERMINAL',strategies:'STRATEGY REGISTRY',backtests:'BACKTEST STUDIO',execution:'PAPER EXECUTION',history:'TRADE JOURNAL',research:'RESEARCH LIBRARY' };
const formatPrice = x => Number.isFinite(x) ? x.toLocaleString('en-US',{minimumFractionDigits:x>=100?2:4,maximumFractionDigits:x>=100?2:4}) : '—';
const escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const timeOf = ms => new Date(ms).toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'});
const timeoutFetch = async (endpoint) => {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 9000);
  try {
    const response = await fetch(endpoint,{signal:controller.signal,cache:'no-store',credentials:'same-origin'});
    if(!response.ok) throw new Error(`Feed ${response.status}`);
    const data = await response.json();
    return data;
  } finally { clearTimeout(timeout); }
};
function setFeed(available, reason='') {
  state.live=available;
  $('feed-pulse').textContent=available?'CONNECTED':'UNAVAILABLE';
  $('feed-headline').textContent=available?'Live spot feed connected':'Exchange connection unavailable';
  $('feed-description').textContent=available?'Real market prices · no simulation':(reason||'Quotes will remain blank until feed recovers.');
  $('crypto-live-state').textContent=available?'Live quotes received':'Feed unavailable';
  document.querySelector('.pulse-ring span').style.background=available?'#d0f778':'#f2aa7b';
}
function sessionWindow(timeZone, openMin, closeMin) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const value = k => parts.find(p=>p.type===k)?.value||'';
  const mins = Number(value('hour'))*60+Number(value('minute'));
  return !['Sat','Sun'].includes(value('weekday')) && mins>=openMin && mins<closeMin;
}
function updateSessions(){
  $('utc-clock').textContent=new Date().toLocaleTimeString('en-GB',{timeZone:'UTC',hour12:false})+' UTC';
  $('session-clock').textContent=new Date().toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC';
  $('nse-state').textContent=sessionWindow('Asia/Kolkata',9*60+15,15*60+30)?'WITHIN SESSION WINDOW*':'OUTSIDE SESSION WINDOW';
  $('nyse-state').textContent=sessionWindow('America/New_York',9*60+30,16*60)?'WITHIN SESSION WINDOW*':'OUTSIDE SESSION WINDOW';
}
function renderQuotes(){
  if(state.market!=='crypto'){
    const sector={india:'Indian equities',us:'US equities',fx:'Foreign exchange'}[state.market]||'Unconnected instruments';
    $('instrument-rows').innerHTML=`<tr><td colspan="6" class="loading-row">${sector}: a licensed verified price feed is not connected. No prices are displayed.</td></tr>`;
    return;
  }
  if(!state.quotes){$('instrument-rows').innerHTML='<tr><td colspan="6" class="loading-row">Verified quotes unavailable. No estimates or cached market prices are displayed.</td></tr>';return}
  const bySym=new Map(state.quotes.map(q=>[q.symbol,q]));
  $('instrument-rows').innerHTML=TICKERS.map(sym=>{
    const q=bySym.get(sym); if(!q)return '';
    const delta=q.change24h;
    return `<tr data-symbol="${sym}" tabindex="0" role="link" aria-label="Open ${LABELS[sym]} terminal"><td class="symbol-cell"><strong>${sym.slice(0,-4)}/USDT</strong><small>${LABELS[sym]}</small></td><td class="tiny-source">BINANCE SPOT</td><td>${formatPrice(q.price)}</td><td class="${delta===null?'':delta>=0?'pos':'neg'}">${delta===null?'—':`${delta>=0?'+':''}${delta.toFixed(2)}%`}</td><td><span class="tiny-source">LIVE FEED</span></td><td class="row-end">↗</td></tr>`;
  }).join('');
  document.querySelectorAll('tr[data-symbol]').forEach(row=>{
    const activate=()=>{state.symbol=row.dataset.symbol;$('symbol-select').value=state.symbol;location.hash='#terminal';};
    row.addEventListener('click',activate);
    row.addEventListener('keydown',e=>{if(e.key==='Enter')activate()});
  });
}
async function refreshQuotes(){
  try {
    const data=await timeoutFetch('/api/markets');
    if(data.source!=='Binance Spot' || !Array.isArray(data.tickers) || data.tickers.length!==TICKERS.length || !data.tickers.every(q=>TICKERS.includes(q.symbol)&&Number.isFinite(q.price)&&q.price>0)) throw new Error('Invalid source snapshot');
    state.quotes=data.tickers;setFeed(true);
    $('market-updated').textContent=`SNAPSHOT RECEIVED ${new Date(data.receivedAt).toLocaleTimeString('en-GB',{timeZone:'UTC',hour12:false})} UTC`;
  } catch(e) {
    state.quotes=null;setFeed(false,'No verified quote snapshot received.');$('market-updated').textContent='LIVE FEED UNAVAILABLE';
  }
  renderQuotes();
  if(state.view==='terminal')renderPrice();
}
function renderPrice(){
  const quote=state.quotes?.find(q=>q.symbol===state.symbol);
  $('chart-price').textContent=quote?`${formatPrice(quote.price)} USDT`:'—';
  $('chart-change').textContent=quote&&quote.change24h!==null?`${quote.change24h>=0?'+':''}${quote.change24h.toFixed(2)}% / 24H`:'No verified price available';
  $('chart-change').className=quote&&quote.change24h!==null?(quote.change24h>=0?'pos':'neg'):'';
}
function currentView(){return (location.hash||'#overview').slice(1).split('?')[0]}
function navigate(){
  const key=routeTitles[currentView()]?currentView():'overview';state.view=key;
  $('page-label').textContent=routeTitles[key];
  document.querySelectorAll('.nav-choice').forEach(a=>{const on=a.dataset.route===key;a.classList.toggle('selected',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  $('intro-grid').classList.toggle('hidden',key!=='overview');
  $('overview-view').classList.toggle('hidden',key!=='overview');
  $('terminal-view').classList.toggle('hidden',key!=='terminal');
  $('future-view').classList.toggle('hidden',['overview','terminal'].includes(key));
  $('rail').classList.remove('open');
  if(key==='terminal'){
    $('terminal-title').textContent=state.symbol.slice(0,-4)+' / USDT';
    $('terminal-subtitle').textContent=`Binance Spot · Public market data · ${state.interval} candles`;
    renderPrice();refreshCandles(true);
  } else if(!['overview','terminal'].includes(key))renderFuture(key);
}
const futureInfo={
  strategies:['STRATEGY REGISTRY','Registration, versions and lifecycle','Research proposals will enter evaluation with provenance, author, description, parameter schema and version. Advancement to validated alpha will require recorded out-of-sample evidence.'],
  backtests:['BACKTEST STUDIO','Experiment orchestration','A future queued backtest worker will run independently of the browser, save immutable runs and compute costs, drawdowns, turnover and validation statistics. No backtest engine is connected yet.'],
  execution:['PAPER EXECUTION','Simulation without a broker','Paper orders, fill events, stop controls, idempotency and risk limits will be added as a separate always-on service. No simulated or real orders execute in this release.'],
  history:['TRADE JOURNAL','Auditable order and fill history','Manual and automated orders, P&L attribution, fees, profitable/losing filters and reconciliation will derive only from recorded events. There is no recorded history yet.'],
  research:['RESEARCH LIBRARY','Paper-driven research registry','Hypotheses, linked publications, code revisions, datasets, data rights and experiment lineage will be added when the first validated research artifact is ready.']
};
function renderFuture(key){
  const [title,desc,detail]=futureInfo[key]||futureInfo.strategies;
  $('future-index').textContent=`RESEARCH OPERATIONS / ${key.toUpperCase()}`;
  $('future-title').textContent=title;$('future-desc').textContent=desc;$('future-explain').textContent=detail;
}
async function refreshCandles(reset=false){
  if(state.view!=='terminal'||state.busy||document.hidden)return;
  state.busy=true;
  const requestedSymbol=state.symbol,requestedInterval=state.interval;
  if(reset){state.candles=[];$('chart-empty').classList.remove('hidden');$('chart-empty').innerHTML='Requesting verified OHLC candles…<small>Binance Spot · Data feed only</small>';drawChart()}
  try{
    const data=await timeoutFetch(`/api/candles?symbol=${encodeURIComponent(requestedSymbol)}&interval=${encodeURIComponent(requestedInterval)}`);
    if(data.symbol!==requestedSymbol||data.interval!==requestedInterval||data.source!=='Binance Spot'||!Array.isArray(data.candles)||!data.candles.length)throw new Error('Unexpected candle response');
    if(state.symbol!==requestedSymbol||state.interval!==requestedInterval)return;
    state.candles=data.candles;state.candleFetched=data.receivedAt;
    $('chart-empty').classList.add('hidden');
    $('chart-received').textContent=`RECEIVED ${new Date(data.receivedAt).toLocaleTimeString('en-GB',{timeZone:'UTC',hour12:false})} UTC`;
    const last=state.candles.at(-1);$('chart-last-candle').textContent=`LAST BAR ${timeOf(last.t)} UTC · ${last.closed?'CLOSED':'FORMING'}`;
    drawChart();
  }catch(e){
    if(state.symbol!==requestedSymbol||state.interval!==requestedInterval)return;
    // Fail visibly rather than retain old candles and imply freshness.
    state.candles=[];drawChart();
    $('chart-empty').classList.remove('hidden');$('chart-empty').innerHTML='Live candle feed unavailable.<small>Exchange data could not be verified. Nothing is simulated.</small>';
    $('chart-received').textContent='PROVIDER UNAVAILABLE';$('chart-last-candle').textContent='NO VERIFIED CANDLES';
  }finally{state.busy=false}
}
function drawChart(){
  const canvas=$('candlestick-chart');if(!canvas)return;
  const width=canvas.clientWidth,height=canvas.clientHeight;
  if(width<20||height<20)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
  const margin={l:16,r:90,t:16,b:30},plotW=width-margin.l-margin.r,chartH=height-margin.t-margin.b;
  const volH=chartH*.18,priceH=chartH-volH-20;
  ctx.strokeStyle='#2a383b';ctx.lineWidth=1;ctx.font='10px ui-monospace,monospace';
  for(let i=0;i<=5;i++){const y=margin.t+i*priceH/5;ctx.beginPath();ctx.moveTo(margin.l,y+.5);ctx.lineTo(width-margin.r,y+.5);ctx.stroke()}
  if(!state.candles.length||plotW<=0)return;
  const n=Math.max(10,Math.min(state.candles.length,Math.floor(plotW/8)));const data=state.candles.slice(-n);
  const highest=Math.max(...data.map(d=>d.h));const lowest=Math.min(...data.map(d=>d.l));const span=(highest-lowest)||highest*.0001||1;
  const pad=span*.08;const top=highest+pad,bottom=lowest-pad;
  const yPrice=p=>margin.t+(top-p)/(top-bottom)*priceH;
  const step=plotW/n;const bodyW=Math.max(2,Math.min(9,step*.65));
  const maxVol=Math.max(...data.map(d=>d.v),1);
  ctx.fillStyle='#88a39b';ctx.textAlign='left';
  for(let i=0;i<=5;i++){
    const val=top-(top-bottom)*i/5;ctx.fillText(val.toLocaleString('en-US',{maximumFractionDigits:val>=1?2:5}),width-margin.r+10,margin.t+i*priceH/5+4);
  }
  data.forEach((d,i)=>{
    const x=margin.l+(i+.5)*step;const up=d.c>=d.o;const color=up?'#9ce1b1':'#fa9780';
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,yPrice(d.h));ctx.lineTo(x,yPrice(d.l));ctx.stroke();
    const y1=yPrice(Math.max(d.o,d.c)),y2=yPrice(Math.min(d.o,d.c));ctx.fillRect(x-bodyW/2,y1,bodyW,Math.max(y2-y1,1.5));
    ctx.globalAlpha=.45;ctx.fillRect(x-bodyW/2,height-margin.b-d.v/maxVol*(volH-9),bodyW,d.v/maxVol*(volH-9));ctx.globalAlpha=1;
  });
  ctx.strokeStyle='#384849';ctx.beginPath();ctx.moveTo(margin.l,height-margin.b+.5);ctx.lineTo(width-margin.r,height-margin.b+.5);ctx.stroke();
  ctx.fillStyle='#7f9991';ctx.textAlign='center';
  for(let i=0;i<5;i++){const idx=Math.min(n-1,Math.round((n-1)*i/4));ctx.fillText(timeOf(data[idx].t),margin.l+(idx+.5)*step,height-10)}
  if(state.mouseX!==null&&state.mouseX>=margin.l&&state.mouseX<width-margin.r){
    const idx=Math.min(n-1,Math.max(0,Math.floor((state.mouseX-margin.l)/step)));const d=data[idx],x=margin.l+(idx+.5)*step;
    ctx.strokeStyle='#c5dcb888';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x,margin.t);ctx.lineTo(x,height-margin.b);ctx.stroke();ctx.setLineDash([]);
    const label=`${timeOf(d.t)} UTC  O ${formatPrice(d.o)}  H ${formatPrice(d.h)}  L ${formatPrice(d.l)}  C ${formatPrice(d.c)}`;
    const boxWidth=Math.min(width-30,Math.max(240,ctx.measureText(label).width+24));
    ctx.fillStyle='#263938';ctx.fillRect(12,11,boxWidth,26);ctx.fillStyle='#ecf6e8';ctx.textAlign='left';ctx.fillText(label,21,28);
  }
}
async function start(){
  updateSessions();setInterval(updateSessions,30000);
  try{const user=await timeoutFetch('/api/whoami');$('user-email').textContent=user.email||'Approved researcher'}catch(e){$('user-email').textContent='Access verification required'}
  $('menu-open').addEventListener('click',()=>$('rail').classList.add('open'));
  $('rail-close').addEventListener('click',()=>$('rail').classList.remove('open'));
  $('symbol-select').addEventListener('change',e=>{state.symbol=e.target.value;state.candles=[];navigate()});
  $('interval-select').addEventListener('change',e=>{state.interval=e.target.value;state.candles=[];navigate()});
  $('candlestick-chart').addEventListener('mousemove',e=>{state.mouseX=e.clientX-e.target.getBoundingClientRect().left;drawChart()});
  $('candlestick-chart').addEventListener('mouseleave',()=>{state.mouseX=null;drawChart()});
  window.addEventListener('resize',drawChart);
  document.querySelectorAll('.exchange-card[data-market]').forEach(card=>{
    const pick=()=>{
      state.market=card.dataset.market;
      document.querySelectorAll('.exchange-card[data-market]').forEach(c=>c.classList.toggle('chosen',c===card));
      $('instruments-title').textContent=state.market==='crypto'?'Spot instruments':({india:'Indian equities',us:'US equities',fx:'Foreign exchange'}[state.market]);
      renderQuotes();$('instruments-title').scrollIntoView({behavior:'smooth',block:'start'});
    };
    card.addEventListener('click',pick);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}});
  });
  window.addEventListener('hashchange',navigate);
  navigate();refreshQuotes();
  setInterval(refreshQuotes,20000);
  setInterval(()=>refreshCandles(),6000);
}
document.addEventListener('DOMContentLoaded',start);
