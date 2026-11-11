// Optional Cloudflare D1 + Turnstile form. It is not enabled until configured.
const form=document.getElementById('inquiry-form');
const notReady=document.getElementById('form-unavailable');
const feedback=document.getElementById('form-feedback');
const turnstileContainer=document.getElementById('turnstile-container');
const siteKey=(window.AC_CONFIG?.turnstileSiteKey||'').trim();
if(form&&siteKey){
 form.hidden=false;
 if(notReady)notReady.hidden=true;
 turnstileContainer.setAttribute('data-sitekey',siteKey);
 const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js';script.async=true;script.defer=true;document.head.appendChild(script);
 form.addEventListener('submit',async (event)=>{
   event.preventDefault();if(!form.reportValidity())return;feedback.textContent='';feedback.className='form-feedback';
   const submit=form.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent='Submitting…';
   try{
     const data=new FormData(form);
     const token=data.get('cf-turnstile-response');
     if(!token)throw new Error('Please finish the security check and try again.');
     const response=await fetch('/api/inquiry',{method:'POST',body:data,headers:{'Accept':'application/json'}});
     const result=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(result.error||'Submission is unavailable. Please email us directly.');
     feedback.textContent='Your message has been received. Thank you for reaching out.';feedback.classList.add('success');
     form.reset();if(window.turnstile)window.turnstile.reset();
   }catch(err){feedback.textContent=err.message||'Please use the direct email link instead.';feedback.classList.add('error');if(window.turnstile)window.turnstile.reset();}
   finally{submit.disabled=false;submit.textContent='Submit inquiry ↗'}
 });
}
