'use strict';
const $=id=>document.getElementById(id);
const state={records:[],selected:null,editing:null,version:null,role:'restricted'};
async function api(path,options={}){
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin',...options});
  const result=await response.json().catch(()=>({error:'INVALID_RESPONSE',message:'Unexpected service response'}));
  if(!response.ok)throw Error(result.message||result.error||'Request failed');
  return result;
}
function notice(message,error=false){const el=$('notice');el.textContent=message;el.classList.toggle('error',error);}
function el(tag,text,className){const x=document.createElement(tag);x.textContent=text||'';if(className)x.className=className;return x;}
const date=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC':'—';};
function metrics(){
  const rows=state.records;
  $('metric-total').textContent=rows.length;
  $('metric-draft').textContent=rows.filter(x=>x.status==='draft').length;
  $('metric-archived').textContent=rows.filter(x=>x.status==='archived').length;
  $('metric-validated').textContent=rows.filter(x=>x.status==='validated').length;
}
function renderList(){
  const tbody=$('registry-rows');tbody.replaceChildren();
  if(!state.records.length){const tr=el('tr');const td=el('td','No registered strategies. Your first saved research specification will appear here.');td.colSpan=5;tr.append(td);tbody.append(tr);return;}
  for(const record of state.records){
    const tr=el('tr');tr.className='record-row';tr.tabIndex=0;
    for(const value of [record.name,record.universe,`V${record.version}`])tr.append(el('td',value));
    const status=el('td');status.append(el('span',record.status.toUpperCase(),'chip'+(record.status==='archived'?' archived':'')));tr.append(status);
    tr.append(el('td','VIEW ↗'));
    const open=()=>selectRecord(record.id);
    tr.addEventListener('click',open);tr.addEventListener('keydown',e=>{if(e.key==='Enter')open();});
    tbody.append(tr);
  }
}
function info(dl,label,value){dl.append(el('dt',label));dl.append(el('dd',value));}
async function selectRecord(id){
  state.selected=id;const panel=$('record-details');panel.replaceChildren(el('p','Loading historical research revisions…'));
  try{
    const data=await api(`/api/strategies/${encodeURIComponent(id)}`),s=data.strategy;
    panel.replaceChildren();panel.append(el('p',`RESEARCH ID / ${s.id}`,'eyebrow'),el('h3',s.name));
    const dl=document.createElement('dl');
    info(dl,'HYPOTHESIS',s.hypothesis);info(dl,'UNIVERSE',s.universe);
    info(dl,'SIGNAL FAMILY',s.signal_family);info(dl,'ENTRY LOGIC',s.entry_logic);info(dl,'EXIT LOGIC',s.exit_logic);
    info(dl,'RISK CONTROLS',s.risk_controls);info(dl,'PARAMETERS',JSON.stringify(s.parameters,null,2));
    info(dl,'RESEARCH REFERENCES',s.references.join('\n')||'None supplied');
    info(dl,'AUDIT HISTORY',`${data.versions.length} preserved versions · ${data.events.length} lifecycle events`);
    info(dl,'RESEARCH RUN INDEX',`${(data.runs||[]).length} linked historical backtest or virtual replay sessions`);
    info(dl,'EXPERT ASSESSMENTS',`${(data.reviews||[]).length} attributed notes visible to this account`);
    info(dl,'UPDATED',date(s.updated_at));
    for(const r of (data.runs||[])){
      const link=el('a',`${r.run_type.toUpperCase()} · V${r.strategy_version} · ${date(r.created_at)} →`,'workflow-link');
      link.href='/laboratory.html?'+(r.run_type==='paper'?'paper':'run')+'='+encodeURIComponent(r.engine_job_id)+'#'+(r.run_type==='paper'?'paper':'backtests');panel.append(link);
    }
    for(const r of (data.reviews||[])){
      const entry=el('p',`${r.recommendation.toUpperCase()} · V${r.strategy_version} · ${date(r.created_at)} · ${r.note}`,'review-note');panel.append(entry);
    }
    panel.append(dl);
    if(state.role==='reviewer'){
      const panelTitle=el('h3','Reviewer assessment');panel.append(panelTitle);
      const form=document.createElement('form');form.className='review-form';
      const choice=document.createElement('select');choice.setAttribute('aria-label','Recommendation');
      for(const [v,name] of [['evaluate','Proceed to evaluation'],['revise','Request revision'],['reject','Do not advance']]){
        const o=document.createElement('option');o.value=v;o.textContent=name;choice.append(o);
      }
      const note=document.createElement('textarea');note.required=true;note.minLength=12;note.maxLength=2000;note.rows=4;note.placeholder='Evidence-based review: strengths, risks, limitations, next tests';
      const submit=el('button','SUBMIT RECORDED REVIEW');submit.type='submit';
      form.append(choice,note,submit);form.addEventListener('submit',async event=>{
        event.preventDefault();submit.disabled=true;
        try{await api('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy_id:s.id,recommendation:choice.value,note:note.value})});
          notice('Review saved with the exact strategy revision and your verified identity.');note.value='';}
        catch(error){notice(error.message,true)}finally{submit.disabled=false;}
      });panel.append(form);
    }
    if(s.status==='draft'&&state.role==='owner'){
      if(s.signal_family!=='custom_research'){
        const run=el('a','RUN BACKTEST →','ghost workflow-link');run.href='/laboratory.html?strategy='+encodeURIComponent(s.id)+'#backtests';panel.append(run);
        const paper=el('a','CREATE PAPER REPLAY →','ghost workflow-link');paper.href='/laboratory.html?strategy='+encodeURIComponent(s.id)+'#paper';panel.append(paper);
      }

      const edit=el('button','EDIT DRAFT / CREATE REVISION','ghost');edit.type='button';edit.addEventListener('click',()=>editRecord(s));panel.append(edit);
      const archive=el('button','ARCHIVE DRAFT','ghost');archive.style.marginLeft='10px';archive.type='button';archive.addEventListener('click',()=>archiveRecord(s));panel.append(archive);
    }
  }catch(e){panel.replaceChildren(el('p',`Unable to load strategy: ${e.message}`));}
}
async function archiveRecord(s){
  const reason=prompt('Archive rationale (recorded permanently in the audit trail):');
  if(reason===null)return;
  if(reason.trim().length<4){notice('Archive rationale must contain at least four characters.',true);return;}
  try{await api(`/api/strategies/${encodeURIComponent(s.id)}/archive`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})});
    notice('Research draft archived. Audit event recorded.');await refresh();await selectRecord(s.id);
  }catch(e){notice(e.message,true);}
}
function editRecord(s){
  state.editing=s.id;state.version=s.version;
  const form=$('research-form');for(const key of ['name','hypothesis','universe','signal_family','entry_logic','exit_logic','risk_controls'])form.elements.namedItem(key).value=s[key];
  form.elements.namedItem('parameters').value=JSON.stringify(s.parameters,null,2);
  form.elements.namedItem('references').value=s.references.join('\n');
  $('editor-heading').textContent=`Edit draft · V${s.version}`;
  $('save').firstChild.textContent='SAVE NEW IMMUTABLE REVISION ';
  $('form-state').textContent=`REVISION FROM V${s.version} · NO EXECUTION`;
  document.querySelector('.editor').scrollIntoView({behavior:'smooth',block:'start'});
}
function resetEditor(){state.editing=null;state.version=null;$('research-form').reset();$('editor-heading').textContent='New specification';$('form-state').textContent='DRAFTS ONLY · NO AUTOMATIC TRADING';$('save').firstChild.textContent='SAVE RESEARCH SPECIFICATION ';}
async function refresh(){
  try{
    const data=await api('/api/strategies');if(!Array.isArray(data.strategies))throw Error('Invalid registry');
    state.records=data.strategies;metrics();renderList();$('storage-state').textContent='CONNECTED';notice('Research registry connected · saved drafts and versions are stored in D1. No strategies have been executed.');
  }catch(e){$('storage-state').textContent='UNAVAILABLE';for(const id of ['metric-total','metric-draft','metric-archived','metric-validated'])$(id).textContent='—';
    $('registry-rows').replaceChildren();const tr=el('tr'),td=el('td','Research storage unavailable. No synthetic records shown.');td.colSpan=5;tr.append(td);$('registry-rows').append(tr);notice(`Cannot load research registry: ${e.message}`,true);
  }
}
function values(form){
  const data=Object.fromEntries(new FormData(form));
  let parameters;try{parameters=JSON.parse(data.parameters)}catch{throw Error('Configuration must be valid JSON');}
  if(!parameters||Array.isArray(parameters)||typeof parameters!=='object')throw Error('Configuration must be a JSON object');
  return {...data,parameters,references:String(data.references||'').split('\n').map(s=>s.trim()).filter(Boolean)};
}
async function save(e){
  e.preventDefault();const button=$('save');button.disabled=true;
  try{
    const data=values(e.currentTarget);
    const wasEditing=!!state.editing;
    const path=state.editing?`/api/strategies/${encodeURIComponent(state.editing)}/versions`:'/api/strategies';
    if(state.editing)data.expected_version=state.version;
    const result=await api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const id=result.id;resetEditor();await refresh();await selectRecord(id);
    notice(`Research specification ${wasEditing?'revised':'saved'} at version ${result.version}. No backtest or order was started.`);
  }catch(err){notice(err.message,true);}finally{button.disabled=false;}
}
async function start(){
  $('research-form').addEventListener('submit',save);$('reload').addEventListener('click',refresh);$('new-record').addEventListener('click',resetEditor);
  try{const u=await api('/api/whoami');state.role=u.role;$('session-identity').textContent=u.role.toUpperCase()+' / '+u.email;
    if(u.role!=='owner'){$('research-form').querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);$('form-state').textContent=u.role==='reviewer'?'REVIEW-ONLY SESSION':'OWNER PERMISSION REQUIRED';}
  }catch{$('session-identity').textContent='SESSION UNAVAILABLE';}
  await refresh();
  if(state.role==='owner'){
    try{await api('/api/engine/status');$('engine-state').textContent='HISTORICAL / READY';}
    catch{$('engine-state').textContent='LOCAL / INACTIVE';}
  }else $('engine-state').textContent='OWNER CONTROLLED';
}
document.addEventListener('DOMContentLoaded',start);
