'use strict';
const $=id=>document.getElementById(id);
const txt=(tag,value)=>{const el=document.createElement(tag);el.textContent=String(value??'—');return el};
async function api(path,options={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});const b=await r.json().catch(()=>({error:'BAD_RESPONSE'}));if(!r.ok)throw Error(b.message||b.error||'Service unavailable');return b}
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error)}
function date(value){if(!value)return 'UNASSIGNED';const d=new Date(value);return Number.isFinite(d.getTime())?d.toISOString().slice(0,16).replace('T',' ')+' UTC':'—'}
async function assign(slot,email,hours){const body={slot,email,hours};await api('/api/reviewers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});notice('Appointment updated. Verify the exact inbox is also on the Cloudflare Access email allowlist.');await renderOwner()}
async function renderOwner(){
 const [roster,feedback]=await Promise.all([api('/api/reviewers'),api('/api/reviews')]);
 $('active-count').textContent=roster.slots.filter(s=>s.reviewer_email&&new Date(s.expires_at)>new Date()).length;
 const tbody=$('slots');tbody.replaceChildren();
 for(const entry of roster.slots){
  const tr=document.createElement('tr');tr.append(txt('td',String(entry.slot).padStart(2,'0')));
  const td=document.createElement('td'),email=document.createElement('input');email.type='email';email.placeholder='reviewer@example.com';email.value=entry.reviewer_email||'';email.setAttribute('aria-label','Email for slot '+entry.slot);td.append(email);tr.append(td);
  tr.append(txt('td',date(entry.expires_at)));
  const control=document.createElement('td'),box=document.createElement('div');box.className='control';
  const hours=document.createElement('input');hours.type='number';hours.min='1';hours.max='168';hours.value='24';hours.setAttribute('aria-label','Hours for slot '+entry.slot);
  const save=txt('button','ASSIGN');save.onclick=async()=>{save.disabled=true;try{await assign(entry.slot,email.value.trim().toLowerCase(),Number(hours.value))}catch(e){notice(e.message,true)}finally{save.disabled=false}};
  const revoke=txt('button','REVOKE');revoke.className='outline';revoke.disabled=!entry.reviewer_email;revoke.onclick=async()=>{revoke.disabled=true;try{await assign(entry.slot,null,0)}catch(e){notice(e.message,true)}finally{revoke.disabled=false}};
  box.append(hours,save,revoke);control.append(box);tr.append(control);tbody.append(tr);
 }
 const host=$('feedback');host.replaceChildren();
 if(!feedback.reviews.length){host.textContent='No expert assessments have been submitted.';return}
 for(const r of feedback.reviews){const card=document.createElement('article');card.className='review';card.append(txt('strong',r.recommendation.toUpperCase()+' · STRATEGY V'+r.strategy_version));card.append(txt('small',`Slot ${r.slot} · ${r.reviewer_email} · ${date(r.created_at)} · ${r.strategy_id}`));card.append(txt('p',r.note));host.append(card)}
}
async function init(){
 try{const u=await api('/api/whoami');$('session').textContent=u.role.toUpperCase()+' / '+u.email;
  if(u.role==='owner'){$('owner-area').classList.remove('hidden');$('refresh').onclick=()=>renderOwner().catch(e=>notice(e.message,true));await renderOwner();notice('Five verified-email review slots. All appointments have an explicit expiry.');}
  else if(u.role==='reviewer'){$('reviewer-area').classList.remove('hidden');$('active-count').textContent='01';notice('Review-only access. Your assessments are versioned and attributed.');}
  else notice('This identity has not been assigned an active research review role.',true);
 }catch(e){notice('Session or reviewer registry unavailable: '+e.message,true)}
}
document.addEventListener('DOMContentLoaded',init);
