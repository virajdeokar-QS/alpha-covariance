/** Cloudflare Pages Function: POST /api/inquiry
 * Production prerequisites: D1 binding INQUIRIES_DB, TURNSTILE_SECRET_KEY.
 * Fails closed if either is not configured. Never logs visitor text.
 */
const json = (body, status=200) => new Response(JSON.stringify(body), {
  status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
const isValidEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const fields = ['research','engineering','collaboration','feedback','other'];
export async function onRequestPost({request,env}) {
  if (!env.INQUIRIES_DB || !env.TURNSTILE_SECRET_KEY) return json({error:'The inquiry form is not yet available. Please email research@alphacovariance.com.'},503);
  const origin=request.headers.get('Origin');
  if(origin && origin!==new URL(request.url).origin) return json({error:'Invalid origin.'},403);
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>20000) return json({error:'Your submission is too large.'},413);
  const type=request.headers.get('Content-Type')||'';
  if(!type.includes('multipart/form-data') && !type.includes('application/x-www-form-urlencoded')) return json({error:'Invalid form content type.'},415);
  let fd;
  try {fd=await request.formData();}catch{return json({error:'Could not read your inquiry.'},400);}
  const val=(key)=>typeof fd.get(key)==='string' ? fd.get(key).trim() : '';
  const name=val('name'),email=val('email'),topic=val('topic'),message=val('message');
  const consent=val('consent'),honeypot=val('website'),token=val('cf-turnstile-response');
  if(honeypot) return json({ok:true}); // no bot data saved
  if(name.length<2||name.length>120||email.length>180||!isValidEmail(email)||!fields.includes(topic)||message.length<20||message.length>4000||consent!=='yes') return json({error:'Please provide a valid name, email, topic, consent and a message of at least 20 characters.'},400);
  if(!token||token.length>2048) return json({error:'Complete the security check.'},400);
  let verified=false;
  try {
    const payload=new FormData();payload.set('secret',env.TURNSTILE_SECRET_KEY);payload.set('response',token);
    const ip=request.headers.get('CF-Connecting-IP');if(ip)payload.set('remoteip',ip);
    const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:payload});
    const resultBody=await result.json();
    const hostname=new URL(request.url).hostname;
    verified=resultBody.success===true && resultBody.hostname===hostname;
  } catch {return json({error:'The security check is unavailable. Please retry later.'},503);}
  if(!verified) return json({error:'The security check failed. Please try again.'},403);
  try {
    const id=crypto.randomUUID();
    await env.INQUIRIES_DB.prepare('INSERT INTO inquiries (id, name, email, topic, message, consent_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))')
      .bind(id,name,email.toLowerCase(),topic,message).run();
    return json({ok:true},201);
  } catch {return json({error:'We could not save the inquiry. Please email us directly.'},503);}
}
export function onRequestGet(){return json({error:'Method not allowed.'},405);}
