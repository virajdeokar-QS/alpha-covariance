'use strict';
/* R1.2: 25 reference instruments per market. A reference list is not a quote feed.
 * Sourced charts: approved owner Coinbase viewing or owner-registered licensed CSV.
 */
const $=id=>document.getElementById(id);
const raw={
'INDIA / NSE':`RELIANCE.NS|Reliance Industries;HDFCBANK.NS|HDFC Bank;ICICIBANK.NS|ICICI Bank;SBIN.NS|State Bank of India;TCS.NS|Tata Consultancy Services;INFY.NS|Infosys;BHARTIARTL.NS|Bharti Airtel;ITC.NS|ITC;LT.NS|Larsen & Toubro;AXISBANK.NS|Axis Bank;KOTAKBANK.NS|Kotak Mahindra Bank;HINDUNILVR.NS|Hindustan Unilever;BAJFINANCE.NS|Bajaj Finance;MARUTI.NS|Maruti Suzuki;SUNPHARMA.NS|Sun Pharma;WIPRO.NS|Wipro;TITAN.NS|Titan;ULTRACEMCO.NS|UltraTech Cement;TATAMOTORS.NS|Tata Motors;NTPC.NS|NTPC;ONGC.NS|ONGC;POWERGRID.NS|Power Grid;ADANIPORTS.NS|Adani Ports;ASIANPAINT.NS|Asian Paints;TECHM.NS|Tech Mahindra`,
'US / EQUITIES':`AAPL|Apple;MSFT|Microsoft;NVDA|NVIDIA;GOOGL|Alphabet;AMZN|Amazon;META|Meta Platforms;TSLA|Tesla;BRK.B|Berkshire Hathaway;JPM|JPMorgan Chase;V|Visa;MA|Mastercard;XOM|Exxon Mobil;UNH|UnitedHealth Group;PG|Procter & Gamble;JNJ|Johnson & Johnson;WMT|Walmart;COST|Costco;HD|Home Depot;ABBV|AbbVie;ORCL|Oracle;CRM|Salesforce;AMD|Advanced Micro Devices;NFLX|Netflix;BAC|Bank of America;DIS|Walt Disney`,
'CRYPTO / SPOT':`BTC-USD|Bitcoin;ETH-USD|Ethereum;SOL-USD|Solana;ADA-USD|Cardano;XRP-USD|XRP;DOGE-USD|Dogecoin;AVAX-USD|Avalanche;LINK-USD|Chainlink;DOT-USD|Polkadot;LTC-USD|Litecoin;BCH-USD|Bitcoin Cash;UNI-USD|Uniswap;AAVE-USD|Aave;ATOM-USD|Cosmos;XLM-USD|Stellar;ETC-USD|Ethereum Classic;FIL-USD|Filecoin;ALGO-USD|Algorand;NEAR-USD|NEAR;MKR-USD|Maker;SNX-USD|Synthetix;CRV-USD|Curve DAO;GRT-USD|The Graph;COMP-USD|Compound;SUSHI-USD|SushiSwap`,
'FOREX / PAIRS':`EUR/USD|Euro / US Dollar;GBP/USD|Pound / US Dollar;USD/JPY|US Dollar / Yen;USD/CHF|US Dollar / Swiss Franc;USD/CAD|US Dollar / Canadian Dollar;AUD/USD|Australian Dollar / US Dollar;NZD/USD|New Zealand Dollar / US Dollar;EUR/GBP|Euro / Pound;EUR/JPY|Euro / Yen;GBP/JPY|Pound / Yen;AUD/JPY|Australian Dollar / Yen;EUR/CHF|Euro / Swiss Franc;GBP/CHF|Pound / Swiss Franc;CHF/JPY|Swiss Franc / Yen;CAD/JPY|Canadian Dollar / Yen;NZD/JPY|New Zealand Dollar / Yen;AUD/NZD|Australian Dollar / NZ Dollar;EUR/AUD|Euro / Australian Dollar;EUR/CAD|Euro / Canadian Dollar;GBP/CAD|Pound / Canadian Dollar;GBP/AUD|Pound / Australian Dollar;USD/SGD|US Dollar / Singapore Dollar;USD/HKD|US Dollar / Hong Kong Dollar;USD/INR|US Dollar / Indian Rupee;EUR/INR|Euro / Indian Rupee`,
'COMMODITIES':`GOLD|Gold spot reference;SILVER|Silver spot reference;WTI|WTI crude oil reference;BRENT|Brent crude reference;NATGAS|Natural gas reference;COPPER|Copper reference;PLATINUM|Platinum reference;PALLADIUM|Palladium reference;ALUMINUM|Aluminium reference;NICKEL|Nickel reference;ZINC|Zinc reference;TIN|Tin reference;LEAD|Lead reference;IRONORE|Iron ore reference;STEEL|Steel reference;WHEAT|Wheat reference;CORN|Corn reference;SOYBEANS|Soybeans reference;SOYMEAL|Soybean meal reference;SOYOIL|Soybean oil reference;COFFEE|Coffee reference;COCOA|Cocoa reference;SUGAR|Sugar reference;COTTON|Cotton reference;RICE|Rice reference`,
'UK / LSE':`SHEL.L|Shell;AZN.L|AstraZeneca;HSBA.L|HSBC;ULVR.L|Unilever;BP.L|BP;GSK.L|GSK;RIO.L|Rio Tinto;DGE.L|Diageo;BARC.L|Barclays;LLOY.L|Lloyds;NG.L|National Grid;REL.L|RELX;AAL.L|Anglo American;BATS.L|British American Tobacco;VOD.L|Vodafone;PRU.L|Prudential;STAN.L|Standard Chartered;LSEG.L|London Stock Exchange Group;BA.L|BAE Systems;RR.L|Rolls-Royce;SSE.L|SSE;TSCO.L|Tesco;NWG.L|NatWest Group;HLMA.L|Halma;SGE.L|Sage Group`,
'HONG KONG / HKEX':`0700.HK|Tencent;9988.HK|Alibaba;0005.HK|HSBC;1299.HK|AIA Group;0941.HK|China Mobile;0388.HK|HKEX;0001.HK|CK Hutchison;0002.HK|CLP Holdings;0016.HK|Sun Hung Kai Properties;0011.HK|Hang Seng Bank;0017.HK|New World Development;0027.HK|Galaxy Entertainment;0066.HK|MTR Corporation;0083.HK|Sino Land;0101.HK|Hang Lung Properties;0175.HK|Geely Automobile;0291.HK|China Resources Beer;0398.HK|Oriental Watch;0688.HK|China Overseas Land;0762.HK|China Unicom;0883.HK|CNOOC;0939.HK|China Construction Bank;1398.HK|ICBC;2318.HK|Ping An Insurance;3988.HK|Bank of China`,
'EUROPE / EQUITIES':`ASML.AS|ASML;MC.PA|LVMH;OR.PA|L’Oreal;SAN.PA|Sanofi;TTE.PA|TotalEnergies;BNP.PA|BNP Paribas;AI.PA|Air Liquide;SU.PA|Schneider Electric;KER.PA|Kering;RMS.PA|Hermès;SAP.DE|SAP;SIE.DE|Siemens;ALV.DE|Allianz;DTE.DE|Deutsche Telekom;BAS.DE|BASF;BMW.DE|BMW;MBG.DE|Mercedes-Benz;VOW3.DE|Volkswagen;ADS.DE|Adidas;IBE.MC|Iberdrola;SAN.MC|Banco Santander;ITX.MC|Inditex;NESN.SW|Nestlé;NOVN.SW|Novartis;ROG.SW|Roche`
};
const catalogs=Object.fromEntries(Object.entries(raw).map(([market,str])=>[market,str.split(';').map(row=>{const [id,name]=row.split('|');return {id,name,market}})]));
const markets=Object.keys(catalogs),state={market:markets[0],selected:catalogs[markets[0]][0],quotes:new Map(),datasets:[],feed:'restricted',lastFetch:0};
const num=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:4}):'—';
async function api(path,method='GET',body){const r=await fetch(path,{cache:'no-store',credentials:'same-origin',method,...(body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('Source is not enabled for this session');return r.json()}
async function sources(){
 try{const me=await api('/api/whoami');$('account').textContent=me.role.toUpperCase()+' / '+me.email;}catch{$('account').textContent='SESSION REQUIRED'}
 try{const r=await api('/api/engine/datasets');state.datasets=r.datasets||[]}catch{state.datasets=[]}
 try{const r=await api('/api/markets');for(const x of r.tickers||[])state.quotes.set(x.symbol,{price:x.price,source:r.source,at:x.quoteTime||r.receivedAt});state.feed=r.source||'Exchange';state.lastFetch=Date.now()}
 catch{state.feed='Owner market-data display restricted'}
 render();await select(state.selected);
}
function draw(items){
 const canvas=$('chart'),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(300,canvas.getBoundingClientRect().width||640),h=360;
 canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#fcfdfd';ctx.fillRect(0,0,w,h);
 const norm=(items||[]).map(a=>({t:Date.parse(a.t)||a.t,o:Number(a.o??a.open),h:Number(a.h??a.high),l:Number(a.l??a.low),c:Number(a.c??a.close)}));
 ctx.strokeStyle='#e8edf0';for(let i=0;i<5;i++){const y=30+i*70;ctx.beginPath();ctx.moveTo(32,y);ctx.lineTo(w-30,y);ctx.stroke()}
 if(!norm.length){ctx.fillStyle='#84939f';ctx.font='13px system-ui';ctx.fillText('SOURCE-ATTRIBUTED OHLC ONLY',Math.max(36,w/2-120),h/2);return}
 if(norm.some(q=>![q.o,q.h,q.l,q.c].every(Number.isFinite)||q.h<q.l))return;
 const lo=Math.min(...norm.map(q=>q.l)),hi=Math.max(...norm.map(q=>q.h)),span=Math.max(0.001,hi-lo),x=i=>36+(w-74)*(i+.5)/norm.length,y=v=>22+(h-58)*(hi-v)/span;
 const breadth=Math.max(1,(w-74)/norm.length*.65);
 for(let i=0;i<norm.length;i++){const p=norm[i],xx=x(i),bull=p.c>=p.o;ctx.strokeStyle=bull?'#16967a':'#d95664';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(xx,y(p.h));ctx.lineTo(xx,y(p.l));ctx.stroke();ctx.fillRect(xx-breadth/2,Math.min(y(p.o),y(p.c)),breadth,Math.max(1,Math.abs(y(p.c)-y(p.o))))}
 ctx.fillStyle='#5c6c77';ctx.font='11px ui-monospace,monospace';ctx.fillText(num(hi),w-90,15);ctx.fillText(num(lo),w-90,h-17)
}
function render(){
 $('total').textContent=String(markets.length*25);
 $('market-label').textContent=state.market.toUpperCase();$('market-count').textContent=catalogs[state.market].length+' reference instruments';
 $('market-source').textContent='PRICE COVERAGE / VERIFIED SOURCES ONLY';
 const tabs=$('market-tabs');tabs.replaceChildren();for(const name of markets){const button=document.createElement('button');button.textContent=name;button.type='button';button.setAttribute('aria-selected',String(name===state.market));button.onclick=()=>{state.market=name;state.selected=catalogs[name][0];$('query').value='';render();void select(state.selected)};tabs.append(button)}
 const rows=$('rows');rows.replaceChildren();const filter=$('query').value.trim().toLowerCase();
 for(const item of catalogs[state.market].filter(x=>(x.id+' '+x.name).toLowerCase().includes(filter))){
  const ds=state.datasets.find(d=>d.symbol.toUpperCase()===item.id.toUpperCase());const q=state.quotes.get(item.id);
  const tr=document.createElement('tr');tr.className=state.selected.id===item.id?'selected':'';tr.tabIndex=0;
  const first=document.createElement('td'),name=document.createElement('strong'),symbol=document.createElement('small');name.textContent=item.name;symbol.textContent=item.id;first.append(name,symbol);tr.append(first);
  const price=document.createElement('td');price.textContent=q?num(q.price):ds?'HIST.':'—';tr.append(price);
  const source=document.createElement('td');source.textContent=q?'EXCHANGE':ds?'DATASET':'UNPRICED';tr.append(source);
  tr.onclick=()=>void select(item);tr.onkeydown=e=>{if(e.key==='Enter')void select(item)};rows.append(tr);
 }
}
let seq=0;
async function select(item){
 state.selected=item;render();const ticket=++seq;
 $('instrument-title').textContent=item.name+' / '+item.id;$('instrument-venue').textContent=item.market;
 $('chart-time').textContent='WAITING FOR SOURCE';$('chart-count').textContent='—';$('last-price').textContent='—';$('quote-source').textContent='—';
 $('provenance').textContent='Reference instrument; no sourced observation loaded.';
 const ds=state.datasets.find(d=>d.symbol.toUpperCase()===item.id.toUpperCase());const q=state.quotes.get(item.id);
 try{
  let candles,result,source;
  if(ds){result=await api('/api/engine/datasets/'+encodeURIComponent(ds.id)+'/bars');candles=result.bars;source=result.provider+' / checksum '+result.checksum.slice(0,16);$('chart-mode').textContent='AUTHORIZED HISTORICAL / '+result.interval_seconds+'s'}
  else if(['BTC-USD','ETH-USD','SOL-USD'].includes(item.id)&&q){result=await api('/api/candles?symbol='+encodeURIComponent(item.id)+'&interval=5m');candles=result.candles;source=result.source;$('chart-mode').textContent='EXCHANGE OBSERVATION / 5m'}
  else throw Error('No entitled OHLC source attached to this instrument');
  if(ticket!==seq)return;
  if(!Array.isArray(candles)||!candles.length)throw Error('Source returned no bars');
  draw(candles);const last=candles.at(-1),price=Number(last.c??last.close);
  $('last-price').textContent=num(price);$('quote-source').textContent=ds?'HISTORICAL CLOSE':'EXCHANGE / USD';$('chart-time').textContent='LAST BAR / '+String(last.t);
  $('chart-count').textContent=candles.length+' BARS';$('provenance').textContent=source+' · '+(ds?'owner-registered source; not a live quote':'owner-only provider observation');
  $('chart-status').textContent='Recorded candles plotted without interpolation or generated price points.';
 }catch(e){if(ticket!==seq)return;draw([]);$('chart-time').textContent='NOT AVAILABLE';$('chart-status').textContent=e.message+' · Select a registered historical dataset or approved market-data source.'}
}
const automation={sessions:[],selected:''};
async function refreshAutomation(){
 const status=$('automation-status');
 try{
  const response=await api('/api/engine/paper');automation.sessions=response.sessions||[];
  const sel=$('session-select'),old=sel.value;sel.replaceChildren();
  const first=document.createElement('option');first.value='';first.textContent='Select a saved historical replay';sel.append(first);
  for(const s of automation.sessions){const o=document.createElement('option');o.value=s.id;o.textContent=s.id.slice(0,8)+' · '+s.status.toUpperCase()+' · '+s.currency;sel.append(o)}
  if(automation.sessions.some(s=>s.id===old))sel.value=old;
  updateAutomationButtons();status.textContent=automation.sessions.length+' persisted historical replay sessions';
 }catch{status.textContent='Local historical-replay service inactive. Controls will become available when connected.';
  $('run-auto').disabled=true;$('halt-auto').disabled=true;}
}
function updateAutomationButtons(){
 const session=automation.sessions.find(s=>s.id===$('session-select').value);
 $('run-auto').disabled=!session||session.status!=='stopped';
 $('halt-auto').disabled=!session||session.status!=='running';
}
async function paperControl(action){
 const session=automation.sessions.find(s=>s.id===$('session-select').value);if(!session)return;
 const btn=$(action==='resume'?'run-auto':'halt-auto'),status=$('automation-status');btn.disabled=true;
 try{
  if(action==='resume')await api('/api/engine/paper/'+encodeURIComponent(session.id)+'/auto','POST',{enabled:true});
  await api('/api/engine/paper/'+encodeURIComponent(session.id)+'/'+action,'POST',{});
  status.textContent=action==='resume'?'Historical replay resumed with automatic signals.':'Historical replay stopped and persisted.';
  await refreshAutomation();
 }catch(e){status.textContent='Replay operation unavailable: '+e.message;updateAutomationButtons()}
}
function init(){$('query').addEventListener('input',render);$('session-select').addEventListener('change',updateAutomationButtons);$('run-auto').addEventListener('click',()=>paperControl('resume'));$('halt-auto').addEventListener('click',()=>paperControl('stop'));render();draw([]);void sources();void refreshAutomation();setInterval(()=>{if(!document.hidden&&Date.now()-state.lastFetch>60000&&state.market==='CRYPTO / SPOT')void sources()},60000)}
document.addEventListener('DOMContentLoaded',init);
