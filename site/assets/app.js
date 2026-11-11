// Progressive enhancement only: the site remains readable without JavaScript.
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}
const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}, {threshold: .08}) : null;
document.querySelectorAll('.reveal').forEach(el => observer ? observer.observe(el) : el.classList.add('visible'));

// Deterministic, synthetic Gaussian observations for an educational geometry demo.
// Do not mistake these points for securities returns or empirical research results.
function rng(seed){let s=seed>>>0;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296}}
function points(seed=1441,n=190){const random=rng(seed),result=[];for(let i=0;i<n;i++){const u=Math.max(random(),1e-12),v=random();const r=Math.sqrt(-2*Math.log(u)),t=2*Math.PI*v;result.push([r*Math.cos(t),r*Math.sin(t)])}return result}
const cloud=points();
export function renderScatter(canvas,rho,{ink='#d8fa5b',axis='#3b5045',bg='transparent'}={}){
 if(!canvas)return;
 const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
 const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);
 const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const w=box.width,h=box.height;
 if(bg!=='transparent'){ctx.fillStyle=bg;ctx.fillRect(0,0,w,h)}
 ctx.lineWidth=1;ctx.strokeStyle=axis;for(let k=1;k<5;k++){const y=k*h/5,x=k*w/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
 ctx.strokeStyle=ink;ctx.globalAlpha=.55;ctx.beginPath();const cx=w*.5,cy=h*.5,s=Math.min(w,h)*.128;const r=Math.max(-1,Math.min(1,rho));
 for(let k=-3;k<=3;k+=.04){const x=cx+k*s,y=cy-r*k*s;if(k===-3)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke();ctx.globalAlpha=1;
 cloud.forEach(([z1,z2],i)=>{const x=cx+z1*s,y=cy-(r*z1+Math.sqrt(Math.max(0,1-r*r))*z2)*s;
 if(x>=0&&x<=w&&y>=0&&y<=h){ctx.beginPath();ctx.arc(x,y,i%8===0?2.7:1.7,0,2*Math.PI);ctx.fillStyle=i%13===0?'#ff795b':ink;ctx.globalAlpha=i%8===0?.92:.52;ctx.fill()}});ctx.globalAlpha=1;
}
const heroScatter=document.getElementById('hero-scatter'),heroSlider=document.getElementById('hero-rho'),heroValue=document.getElementById('hero-rho-value');
if(heroScatter&&heroSlider){const draw=()=>{const r=Number(heroSlider.value)/100;heroValue.textContent=(r>=0?'+':'')+r.toFixed(2);renderScatter(heroScatter,r)};heroSlider.addEventListener('input',draw);window.addEventListener('resize',draw,{passive:true});draw()}
