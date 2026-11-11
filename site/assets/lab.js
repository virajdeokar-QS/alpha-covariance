import {renderScatter} from './app.js';
const sliders={a:document.querySelector('#vol-a'),b:document.querySelector('#vol-b'),rho:document.querySelector('#rho'),wa:document.querySelector('#weight-a')};
const output=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value};
const canvas=document.getElementById('lab-scatter');
function update(){
 const a=Number(sliders.a.value)/100,b=Number(sliders.b.value)/100,r=Number(sliders.rho.value)/100,wa=Number(sliders.wa.value)/100,wb=1-wa;
 const covariance=r*a*b;const variance=wa*wa*a*a+wb*wb*b*b+2*wa*wb*covariance;
 const vol=Math.sqrt(Math.max(variance,0));
 output('out-vol-a',(a*100).toFixed(0)+'%');output('out-vol-b',(b*100).toFixed(0)+'%');output('out-rho',(r>=0?'+':'')+r.toFixed(2));output('out-weight-a',(wa*100).toFixed(0)+'%');
 output('result-vol',(vol*100).toFixed(2)+'%');output('result-cov',covariance.toFixed(4));output('result-div',(Math.max(0,wa*a+wb*b-vol)*100).toFixed(2)+' pp');
 output('portfolio-weights',`${(wa*100).toFixed(0)}% / ${(wb*100).toFixed(0)}%`);
 output('allocation-a',(wa*100).toFixed(0)+'%');output('allocation-b',(wb*100).toFixed(0)+'%');
 document.getElementById('bar-a').style.width=(wa*100)+'%';document.getElementById('bar-b').style.width=(wb*100)+'%';
 output('math-output',`σₚ² = ${wa.toFixed(2)}² × ${a.toFixed(2)}² + ${wb.toFixed(2)}² × ${b.toFixed(2)}² + 2 × ${wa.toFixed(2)} × ${wb.toFixed(2)} × ${r.toFixed(2)} × ${a.toFixed(2)} × ${b.toFixed(2)}`);
 renderScatter(canvas,r,{ink:'#234639',axis:'#bdcabc',bg:'#e3e8dc'});
}
Object.values(sliders).forEach(x=>x&&x.addEventListener('input',update));window.addEventListener('resize',update,{passive:true});update();
