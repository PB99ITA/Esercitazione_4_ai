'use strict';
const P = Object.freeze({L:1,w:1.3,h:1.6,A:6,a:2.5,J:6,columns:1693,required:10155,vt:2.6,vs:.3225,vertical:49.612,fixed:78,annual:296280,hours:2160});
const pitch=2*P.w+P.a;
const classes=[
  {key:'AR',name:'Alta rotazione',base:3034,flow:197280,color:'#57ab87',edge:'#30795b'},
  {key:'MR',name:'Media rotazione',base:3071,flow:66600,color:'#e6a35e',edge:'#a66b2c'},
  {key:'BR',name:'Bassa rotazione',base:4050,flow:32400,color:'#6d9ccd',edge:'#446e9b'}
];
function duration(r){return r/P.vt+P.vertical+P.fixed}
function requiredFleet(d,flow){return d*flow/(3600*P.hours)}
function layoutModel(n,policy){
  const m=Math.ceil(P.columns/(2*n)),perBay=2*n*P.J,capacity=perBay*m;
  const u=n*pitch,v=P.A+m*P.L,extra=capacity-P.required;
  const addAR=Math.round(extra*2192/(2192+2220));
  const caps=[3034+addAR,3071+extra-addAR,4050];
  const sums=[0,0,0],rows=[],zones=[];
  const bounds=[0,caps[0],caps[0]+caps[1],capacity];
  // Each row contains both faces of all aisles and the six levels of each face.
  for(let k=0;k<m;k++){
    const start=k*perBay,end=start+perBay;
    const counts=caps.map((_,i)=>Math.max(0,Math.min(end,bounds[i+1])-Math.max(start,bounds[i])));
    rows.push(counts);
    counts.forEach((count,i)=>{sums[i]+=count*(P.A+(k+.5)*P.L)});
  }
  for(let i=0;i<3;i++){
    const y=sums[i]/caps[i],r=u+4*y,d=duration(r);
    zones.push({y,r,d,z:requiredFleet(d,classes[i].flow),cap:caps[i]});
  }
  const abc=policy==='abc',x=u/4,y=P.A+m*P.L/2;
  const weighted=key=>zones.reduce((sum,zone,i)=>sum+zone[key]*classes[i].flow/P.annual,0);
  const r=abc?weighted('r'):u+2*(2*P.A+m*P.L);
  const d=abc?weighted('d'):duration(r);
  const fractional=abc?zones.reduce((sum,zone)=>sum+zone.z,0):requiredFleet(d,P.annual);
  const z=Math.ceil(fractional);
  return {n,m,perBay,capacity,u,v,area:u*v,extra,addAR,x,y,r,d,fractional,z,sat:100*fractional/z,abc,zones,rows,bounds};
}
const series={};
for(const mode of ['random','abc'])series[mode]=Array.from({length:25},(_,i)=>layoutModel(i+1,mode));
const $=id=>document.getElementById(id);
const formats=[0,1,2,3].map(d=>new Intl.NumberFormat('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d,useGrouping:true}));
const fmt=(v,d=0)=>formats[d].format(v);
const put=(id,v)=>{$(id).textContent=v};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const swatch=(name,kind)=>'<span class="leg"><i class="swatch swatch-'+kind+'"></i>'+name+'</span>';
let policy='random',M=series.random[16],playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,speed=1,elapsed=0;
let trucks=[],history=[],chartDetail=false,chartHover=null,hoverPoint=null,selectedTruck=null;
let zoom=1,panX=0,panY=0,view,chartView,drag=null,needsPaint=true,previousTime=null,displayedSecond=-1;
const base=$('planBase'),motion=$('motion'),chart=$('chart');
const baseCtx=base.getContext('2d'),ctx=motion.getContext('2d'),graph=chart.getContext('2d');
function best(){return series[policy].reduce((a,b)=>b.fractional<a.fractional?b:a)}
function updateData(){
  const random=series.random[M.n-1],gain=100*(random.r-M.r)/random.r;
  $('nInput').value=M.n;put('nValue',M.n);$('nDown').disabled=M.n===1;$('nUp').disabled=M.n===25;
  put('kR',fmt(M.r,2));put('kD',fmt(M.d,2));put('kZ',M.z);put('kF',fmt(M.fractional,3));put('kS',fmt(M.sat,2));
  put('rNote',M.abc?'−'+fmt(gain,1)+'% rispetto a equiprobabile':'Allocazione equiprobabile');
  const high=M.sat>98;$('satFoot').classList.toggle('warn',high);$('satCard').classList.toggle('warn',high);
  put('satText',high?'Sopra il 98%':'Margine '+fmt(100-M.sat,2)+'%');$('satFill').style.width=M.sat+'%';
  put('gM',fmt(M.m));put('gC',fmt(M.capacity));put('gUV',fmt(M.u,2)+' × '+fmt(M.v,2));put('gArea',fmt(M.area,1));
  put('cycleTotal',fmt(M.d,2));
  for(const [key,t] of [['t',M.r/P.vt],['v',P.vertical],['f',P.fixed]]){
    $(key+'Bar').style.width=100*t/M.d+'%';put(key+'Val',fmt(t,2)+' s');
  }
  let lesson;
  if(M.n===17)lesson='Con 17 corridoi e 50 campate, il modello equiprobabile raggiunge il percorso minimo di 210,70 m. Gli 8 carrelli lavorano al 99,37% della capacità utile.';
  else if(M.n<17)lesson='Con '+M.n+' '+(M.n===1?'corridoio servono':'corridoi servono')+' '+fmt(M.m)+' campate per fronte. La profondità sale a '+fmt(M.v,2)+' m e allunga il tragitto dalla testata al vano.';
  else if(M.n>21)lesson='La testata è larga '+fmt(M.u,2)+' m. Ogni corridoio aggiunge 5,10 m alla larghezza, mentre la profondità diminuisce solo quando si elimina una campata intera.';
  else lesson='Con '+M.n+' corridoi servono '+M.m+' campate. L’arrotondamento per eccesso fa variare a gradini la profondità. Il percorso equiprobabile supera il minimo di '+fmt(random.r-series.random[16].r,2)+' m.';
  if(M.abc)lesson='AR genera il '+fmt(classes[0].flow/P.annual*100,2)+'% dei viaggi e ha il baricentro a '+fmt(M.zones[0].y,2)+' m dalla testata. A parità di pianta il percorso medio si riduce del '+fmt(gain,1)+'% e il margine della flotta è '+fmt(100-M.sat,2)+'%.';
  put('lesson',lesson);put('mapTag',M.n+' '+(M.n===1?'corridoio':'corridoi')+' · '+M.m+' campate');
  $('mapLegend').innerHTML=(M.abc?classes.map(c=>swatch(c.key,c.key)).join(''):swatch('Scaffalature','racks'))+
    swatch('Carrelli','trucks')+'<span class="leg"><i class="route-key"></i>Percorso attivo</span><span class="leg"><i class="swatch io-key"></i>I/O</span>'+
    ($('showB').checked?'<span class="leg"><i class="b-key"></i>Baricentro</span>':'');
  $('abcCard').hidden=!M.abc;
  if(M.abc){
    $('classRows').innerHTML=M.zones.map((z,i)=>'<tr><td>'+swatch(classes[i].key,classes[i].key)+'</td><td>'+fmt(z.cap)+'</td><td>'+fmt(100*classes[i].flow/P.annual,2)+'%</td><td>'+fmt(z.y,2)+'</td><td>'+fmt(z.r,2)+'</td><td>'+fmt(z.d,2)+'</td><td>'+fmt(z.z,3)+'</td></tr>').join('');
    put('extraText',fmt(M.extra)+' posti oltre il fabbisogno di 10.155. AR riceve '+fmt(M.addAR)+' posti aggiuntivi e MR ne riceve '+fmt(M.extra-M.addAR)+'.');
    const mixed=M.rows.flatMap((row,k)=>row.filter(Boolean).length>1?['n. '+(k+1)+' ('+row.map((v,i)=>v?fmt(v)+' '+classes[i].key:'').filter(Boolean).join(', ')+')']:[]);
    put('mixedText',mixed.length?'Campate miste · '+mixed.join(' · '):'I confini tra le classi coincidono con campate intere.');
  }
  const optimum=best();put('chartMin','Minimo a n = '+optimum.n);
  chart.setAttribute('aria-valuenow',M.n);chart.setAttribute('aria-valuetext',M.n+' corridoi, '+fmt(M.fractional,3)+' carrelli teorici, '+M.z+' interi');
  $('detailChart').disabled=M.n<10;
  $('detailChart').title=M.n<10?'Disponibile selezionando almeno 10 corridoi':'Ingrandisci l’intervallo da 10 a 25 corridoi';
  motion.setAttribute('aria-label','Pianta in scala. '+M.n+(M.n===1?' corridoio, ':' corridoi, ')+M.m+' campate, '+M.z+' carrelli. Larghezza '+fmt(M.u,2)+' e profondità '+fmt(M.v,2)+' metri. '+(M.abc?'AR vicino alla testata, MR al centro, BR sul fondo.':'Allocazione equiprobabile.'));
}
function pickSlot(model,rng=Math.random){
  let index,zone=-1;
  if(model.abc){
    const p=rng()*P.annual;zone=p<classes[0].flow?0:p<classes[0].flow+classes[1].flow?1:2;
    index=model.bounds[zone]+Math.floor(rng()*model.zones[zone].cap);
  }else index=Math.floor(rng()*model.capacity);
  const bay=Math.floor(index/model.perBay),within=index%model.perBay;
  return {index,zone,bay,aisle:Math.floor(within/(2*P.J)),face:Math.floor(within/P.J)%2,level:within%P.J};
}
const aisleX=i=>-M.u/2+(i+.5)*pitch;
const bayY=k=>P.A+(k+.5)*P.L;
let aisles=[];
function newTrip(t){
  t.slot=pickSlot(M);t.xEnd=aisleX(t.slot.aisle);t.yEnd=bayY(t.slot.bay);
  t.dwell=P.fixed/2+2*t.slot.level*P.h/P.vs;
  // The transverse leg is in the centre of the head aisle.
  const h=P.A/2,dx=Math.abs(t.xEnd),dy=t.yEnd-h;
  t.knots=[[0,0],[0,h],[t.xEnd,h],[t.xEnd,t.yEnd],[t.xEnd,t.yEnd],[t.xEnd,h],[0,h],[0,0]];
  t.times=[h/P.vt,dx/P.vt,dy/P.vt,t.dwell,dy/P.vt,dx/P.vt,h/P.vt];
  t.phase=0;t.inPhase=0;t.x=0;t.y=0;t.heading=Math.PI/2;t.queued=false;
}
function resetFleet(warm=false){
  aisles=Array.from({length:M.n},()=>({owner:null,queue:[]}));
  elapsed=0;history=[];selectedTruck=null;hoverPoint=null;$('mapTip').hidden=true;
  trucks=Array.from({length:M.z},(_,i)=>{const t={id:i+1,wait:i*(warm?6:2.2),missions:0};newTrip(t);return t});
  if(warm)advance(60);
  displayedSecond=-1;updateClock();needsPaint=true;
}
function advance(dt){
  // Move the whole fleet to the next event before granting any aisle access.
  // This also orders arrivals correctly during warm-up or long animation frames.
  let remaining=dt;
  while(remaining>0){
    let step=remaining;
    for(const t of trucks){
      if(t.queued)continue;
      step=Math.min(step,t.wait>0?t.wait:Math.max(0,t.times[t.phase]-t.inPhase));
    }
    elapsed+=step;
    remaining-=step;
    for(const t of trucks){
      if(t.queued)continue;
      if(t.wait>0){t.wait=Math.max(0,t.wait-step);continue}
      const a=t.knots[t.phase],b=t.knots[t.phase+1],length=t.times[t.phase];
      t.inPhase+=step;
      const q=length>0?Math.min(1,t.inPhase/length):1;
      t.x=a[0]+(b[0]-a[0])*q;t.y=a[1]+(b[1]-a[1])*q;
      if(a[0]!==b[0]||a[1]!==b[1])t.heading=Math.atan2(b[1]-a[1],b[0]-a[0]);
      if(t.inPhase>=length-1e-8){
        const aisle=aisles[t.slot.aisle];
        if(t.phase===1){t.queued=true;aisle.queue.push(t)}
        if(t.phase===2)history.push({x:t.xEnd,y:t.yEnd,at:elapsed});
        if(t.phase===4)aisle.owner=null;
        t.phase++;t.inPhase=0;
        if(t.phase===t.times.length){t.missions++;newTrip(t)}
      }
    }
    for(const aisle of aisles){
      if(aisle.owner===null&&aisle.queue.length){
        const next=aisle.queue.shift();
        aisle.owner=next.id;
        next.queued=false;
      }
    }
  }
  history=history.filter(h=>h.at>elapsed-600).slice(-220);
}
function updateClock(){
  const sec=Math.floor(elapsed);if(sec===displayedSecond)return;displayedSecond=sec;
  put('clock',[Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':'));
}
function updatePlayer(){
  put('playText',playing?'Pausa':'Avvia');put('status',playing?'In esecuzione':'In pausa');
  $('playIcon').setAttribute('href',playing?'#i-pause':'#i-play');$('status').classList.toggle('paused',!playing);
}
// Rendering uses CSS pixels, with separate backing stores for the static and moving layers.
function prepare(canvas,c){
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,3);
  const cw=Math.max(1,Math.round(w*dpr)),ch=Math.max(1,Math.round(h*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch}
  c.setTransform(cw/Math.max(1,w),0,0,ch/Math.max(1,h),0,0);return {w,h};
}
function line(c,x1,y1,x2,y2,color,width=1,dash=[]){
  c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();c.setLineDash([]);
}
function label(c,s,x,y,color='#4b6177',size=11,align='center',weight=500){
  c.fillStyle=color;c.font=weight+' '+size+'px "Segoe UI",Arial,sans-serif';c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y);
}
function pill(c,s,x,y,ink,fill,stroke,size=11){
  c.font='600 '+size+'px "Segoe UI",Arial,sans-serif';const w=c.measureText(s).width+10,h=size+6;
  c.beginPath();c.roundRect(x-w/2,y-h/2,w,h,4);c.fillStyle=fill;c.fill();
  if(stroke){c.strokeStyle=stroke;c.lineWidth=.8;c.stroke()}label(c,s,x,y,ink,size,'center',600);
}
function computeView(w,h){
  const compact=w<500,left=compact?25:45,right=compact?46:71,top=44,bottom=39;
  const fitScale=Math.max(.01,Math.min((w-left-right)/M.u,(h-top-bottom)/M.v)),s=fitScale*zoom;
  const limX=Math.max(0,(M.u*s-(w-left-right))/2)+Math.min((zoom-1)*60,90);
  const limY=Math.max(0,(M.v*s-(h-top-bottom))/2)+Math.min((zoom-1)*60,90);
  panX=clamp(panX,-limX,limX);panY=clamp(panY,-limY,limY);
  return {w,h,s,fitScale,cx:(left+w-right)/2+panX,cy:(top+h-bottom+M.v*s)/2+panY};
}
const X=x=>view.cx+x*view.s,Y=y=>view.cy-y*view.s;
function box(c,x,y,w,h,color){
  c.fillStyle=color;c.fillRect(X(x),Y(y+h),w*view.s,h*view.s);
}
function faceBands(k,face){
  const start=k*M.perBay+face*P.J;
  return classes.map((_,i)=>Math.max(0,Math.min(start+P.J,M.bounds[i+1])-Math.max(start,M.bounds[i])));
}
function drawBase(){
  const {w,h}=prepare(base,baseCtx);prepare(motion,ctx);view=computeView(w,h);
  const c=baseCtx,s=view.s,x0=-M.u/2,x1=M.u/2,lo=X(x0),hi=X(x1),top=Y(M.v),bottom=Y(0);
  c.clearRect(0,0,w,h);box(c,x0,0,M.u,M.v,'#fcfdff');box(c,x0,0,M.u,P.A,'#e9f1f8');
  for(let i=0;i<M.n;i++){
    const left=x0+i*pitch;
    if(s>2)line(c,X(aisleX(i)),Y(P.A),X(aisleX(i)),top,'#d7e1e9',.7,[2,4]);
    for(let side=0;side<2;side++){
      const rx=left+(side?P.w+P.a:0),face=2*i+side;
      if(X(rx+P.w)<0||X(rx)>w)continue;
      for(let k=0;k<M.m;k++){
        const y=P.A+k*P.L,py=Y(y+P.L);if(py>h||Y(y)<0)continue;
        if(M.abc){
          const counts=M.rows[k].some(v=>v===M.perBay)?M.rows[k].map(v=>v?P.J:0):faceBands(k,face);
          let at=y;
          counts.forEach((v,j)=>{if(v){box(c,rx,at,P.w,P.L*v/P.J,classes[j].color);at+=P.L*v/P.J}});
        }else box(c,rx,y,P.w,P.L,k%5===4?'#8ba7c2':'#9cb3ca');
        if(s>=2.5)line(c,X(rx),py,X(rx+P.w),py,M.abc?'#ffffffa6':'#e9f0f9',Math.min(.85,s*.13));
      }
      if(s>=1.3){
        line(c,X(rx),Y(P.A),X(rx),top,'#52718d',Math.min(1.1,s*.13));
        line(c,X(rx+P.w),Y(P.A),X(rx+P.w),top,'#52718d',Math.min(1.1,s*.13));
      }
    }
    if(pitch*s>=16&&top>=10&&top<h-8&&(pitch*s>=29||i%2===0)){
      label(c,String(i+1).padStart(2,'0'),X(aisleX(i)),top-9,'#637a8f',10);
    }
  }
  c.setLineDash([]);c.strokeStyle='#607991';c.lineWidth=1.2;c.strokeRect(lo,top,M.u*s,M.v*s);
  line(c,lo,Y(P.A),hi,Y(P.A),'#a6b8c8',1);
  line(c,X(0),top-4,X(0),bottom+3,'#7488a2',1,[6,3,1,3]);
  if(M.u*s>140){label(c,'I–I',X(0),Math.max(11,top-23),'#556d85',11);if(P.A*s>16)label(c,'TESTATA',lo+7,Y(P.A*.52),'#667f97',10,'left',650)}
  if($('showB').checked){
    const qx=clamp(hi+14,12,w-30),qy=clamp(bottom+21,15,h-15);
    if(hi-lo>43){
      line(c,lo,qy,hi,qy,'#73889d');line(c,lo,qy-4,lo,qy+4,'#73889d');line(c,hi,qy-4,hi,qy+4,'#73889d');
      const pos=clamp((lo+hi)/2-55,lo+25,hi-28);pill(c,'u = '+fmt(M.u,2)+' m',pos,qy,'#40586e','#f5f9fc',null,11);
    }else pill(c,'u = '+fmt(M.u,2)+' m',clamp(lo-53,48,w-50),clamp(bottom+7,17,h-14),'#40586e','#f5f9fc',null,11);
    line(c,qx,top,qx,bottom,'#73889d');line(c,qx-4,top,qx+4,top,'#73889d');line(c,qx-4,bottom,qx+4,bottom,'#73889d');
    c.save();c.translate(qx+10,clamp((top+bottom)/2,60,h-60));c.rotate(-Math.PI/2);pill(c,'v = '+fmt(M.v,2)+' m',0,0,'#40586e','#f5f9fc',null,11);c.restore();
  }
  // Cartographic scale and local axes stay legible at extreme aspect ratios.
  const unit=[.1,.2,.5,1,2,5,10,20,50,100,200].filter(v=>v*s<=62).pop()||.05;
  if(hi<w-104||top>90){
    const sx=w-17,sy=h-14;
    line(c,sx-unit*s,sy,sx,sy,'#435e77',1.5);line(c,sx-unit*s,sy-4,sx-unit*s,sy+1,'#435e77');line(c,sx,sy-4,sx,sy+1,'#435e77');
    label(c,fmt(unit,unit<1?1:0)+' m',sx-unit*s/2,sy-11,'#466078',10);
  }
  if(lo>65){const ax=19,ay=h-19;line(c,ax,ay,ax+16,ay,'#6f879d');line(c,ax,ay,ax,ay-16,'#6f879d');label(c,'x',ax+22,ay,'#556e87',10);label(c,'y',ax,ay-23,'#556e87',10)}
  needsPaint=true;
}
function route(c,x,y,color,width,dash=[]){
  const h=P.A/2;c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();
  c.moveTo(X(0),Y(0));c.lineTo(X(0),Y(h));c.lineTo(X(x),Y(h));c.lineTo(X(x),Y(y));c.stroke();c.setLineDash([]);
}
function drawTruck(t,x,y){
  const c=ctx,sz=clamp(view.s*.92,3.3,8.5);
  c.save();c.translate(x,y);c.rotate(-t.heading);
  c.fillStyle=selectedTruck===t.id?'#123863':'#263c51';
  c.fillRect(-sz,-sz*.68,sz*1.62,sz*1.36);
  c.fillStyle='#f3b648';c.fillRect(-sz*.86,-sz*.49,sz*1.15,sz*.98);
  c.fillStyle='#6f5429';c.fillRect(-sz*.47,-sz*.31,sz*.48,sz*.62);
  c.strokeStyle='#30485c';c.lineWidth=Math.max(1,sz*.16);c.beginPath();
  for(const fy of [-.34,.34]){c.moveTo(sz*.53,sz*fy);c.lineTo(sz*1.48,sz*fy)}c.stroke();c.restore();
}
function drawMotion(){
  if(!view)return;const c=ctx,{w,h,s}=view;c.clearRect(0,0,w,h);
  if($('showTrail').checked){
    for(const h of history){const opacity=.085*Math.max(0,1-(elapsed-h.at)/600);route(c,h.x,h.y,'rgba(13,148,145,'+opacity+')',clamp(s*1.12,2.2,12))}
  }
  for(const t of trucks){
    if(t.wait>0||t.queued)continue;
    const active=selectedTruck===t.id;
    route(c,t.xEnd,t.yEnd,active?'#105e9c':'#1a839580',active?2.7:1.25,active?[]:[4,3]);
    const tx=X(t.xEnd),ty=Y(t.yEnd);c.beginPath();c.arc(tx,ty,active?3.8:2.3,0,Math.PI*2);c.fillStyle=active?'#1b5b98':'#408c95';c.fill();
  }
  if($('showB').checked){
    for(const [i,z] of (M.abc?M.zones:[{y:M.y}]).entries()){
      const x=X(M.x),y=Y(z.y);c.save();c.translate(x,y);c.rotate(Math.PI/4);c.fillStyle='#fff';c.strokeStyle='#784b9a';c.lineWidth=1.8;c.fillRect(-3,-3,6,6);c.strokeRect(-3,-3,6,6);c.restore();
      const tag=M.abc?'B '+classes[i].key:'B';pill(c,tag,x+17,y-10,'#704292','#f6f0fb','#c7b2d8',10);
    }
  }
  const ox=X(0),oy=Y(0);
  c.fillStyle='#bd4450';c.beginPath();c.arc(ox,oy,4,0,Math.PI*2);c.fill();
  pill(c,'I/O',ox,oy+12,'#fff','#b8414d',null,10);
  const labels=[];
  for(const t of trucks){
    const x=X(t.x),y=Y(t.y);if(x<-12||x>w+12||y<-12||y>h+12)continue;
    drawTruck(t,x,y);
    const group=labels.find(g=>Math.hypot(g.x-x,g.y-y)<3);
    if(group){group.ids.push(t.id);group.waiting+=Number(t.queued)}
    else labels.push({x,y,ids:[t.id],waiting:Number(t.queued)});
  }
  const placed=[];
  for(const g of labels){
    const text=(g.ids.length===1?'C'+g.ids[0]:'C'+g.ids[0]+' +'+(g.ids.length-1))+(g.waiting?' · '+g.waiting+' in attesa':'');
    c.font='600 10px "Segoe UI",Arial,sans-serif';const width=c.measureText(text).width+8;
    let lx=clamp(g.x+13,3+width/2,w-3-width/2),ly=clamp(g.y-9,9,h-9);
    for(let i=0;i<5&&placed.some(p=>Math.abs(p.x-lx)<(p.w+width)/2&&Math.abs(p.y-ly)<13);i++)ly+=13;
    if(ly>h-9)ly=clamp(g.y-23,9,h-9);
    if(Math.abs(ly-g.y)>17)line(c,g.x,g.y,lx,ly,'#658098',.7);
    pill(c,text,lx,ly,'#233c52','#fffffff2','#aabac6',10);placed.push({x:lx,y:ly,w:width});
  }
  if(hoverPoint)updateMapTip(hoverPoint);
  needsPaint=false;
}
function tooltip(el,text,x,y,parent){
  el.textContent=text;el.hidden=false;
  const w=el.offsetWidth,h=el.offsetHeight;
  el.style.left=clamp(x+13,4,Math.max(4,parent.clientWidth-w-4))+'px';
  el.style.top=clamp(y+16+h>parent.clientHeight?y-h-9:y+16,4,Math.max(4,parent.clientHeight-h-4))+'px';
}
function updateMapTip(p){
  const x=(p.x-view.cx)/view.s,y=(view.cy-p.y)/view.s;
  const nearby=trucks.filter(t=>Math.hypot(p.x-X(t.x),p.y-Y(t.y))<10);
  let info='';selectedTruck=null;
  if(nearby.length){
    const t=nearby[0];selectedTruck=t.id;
    const phase=t.queued?'In attesa in testata':t.wait>0?'In attesa a I/O':t.phase===3?'Presa / deposito':t.phase<3?'Andata':'Ritorno';
    info='C'+t.id+' · '+(t.missions%2?'Prelievo':'Immissione')+' · '+phase+
      '\nCorridoio '+(t.slot.aisle+1)+' · Campata '+(t.slot.bay+1)+' · Livello '+(t.slot.level+1)+
      (M.abc?' · '+classes[t.slot.zone].key:'');
    if(nearby.length>1)info+='\nNello stesso punto: '+nearby.map(v=>'C'+v.id).join(', ');
  }else if($('showB').checked){
    const zs=M.abc?M.zones:[{y:M.y}];const i=zs.findIndex(z=>Math.hypot(p.x-X(M.x),p.y-Y(z.y))<9);
    if(i>=0)info='Baricentro '+(M.abc?classes[i].key:'B')+'\nx̄ = '+fmt(M.x,2)+' m · ȳ = '+fmt(zs[i].y,2)+' m';
  }
  if(!info&&x>=-M.u/2&&x<M.u/2&&y>=0&&y<M.v){
    if(y<P.A)info='Corsia di testata · A = 6,00 m';
    else{
      const pos=x+M.u/2,aisle=Math.min(M.n-1,Math.floor(pos/pitch)),local=pos-aisle*pitch;
      const k=Math.min(M.m-1,Math.floor((y-P.A)/P.L));
      const side=local<P.w?0:local>=P.w+P.a?1:-1;
      info='Corridoio '+(aisle+1)+' · Campata '+(k+1);
      if(side<0)info+='\nCorsia di stoccaggio · a = 2,50 m';
      else{
        info+='\nFronte '+(side?'destro':'sinistro')+' · '+P.J+' livelli';
        if(M.abc)info+='\n'+faceBands(k,2*aisle+side).map((v,i)=>v?v+' '+classes[i].key:'').filter(Boolean).join(' · ');
      }
    }
  }
  if(info)tooltip($('mapTip'),info,p.x,p.y,$('planStage'));else $('mapTip').hidden=true;
}
function drawChart(){
  const {w,h}=prepare(chart,graph),c=graph; c.clearRect(0,0,w,h);
  const first=chartDetail?10:1,items=series[policy].slice(first-1);
  const left=38,right=w-14,top=24,bottom=h-31;
  const smallest=Math.min(...items.map(p=>p.fractional)),largest=Math.max(...items.map(p=>p.z));
  const initial=(largest-smallest)/4;
  const step=[.1,.2,.25,.5,1,2,5,10,20].find(v=>v>=initial)||20;
  const min=Math.floor((smallest-.04*step)/step)*step,max=Math.ceil((largest+.03*step)/step)*step;
  const gx=n=>left+(n-first)*(right-left)/(25-first),gy=z=>bottom-(z-min)*(bottom-top)/(max-min);
  chartView={left,right,top,bottom,first,gx,gy};chart.setAttribute('aria-valuemin',first);
  label(c,'Carrelli',left,11,'#54687e',11,'left');
  for(let z=min;z<=max+.001;z+=step){
    const y=gy(z);line(c,left,y,right,y,'#dce5ef',.85,[3,4]);
    label(c,fmt(z,step<1?(step===.25?2:1):0),left-6,y,'#52677d',11,'right');
  }
  line(c,left,top,left,bottom,'#bdcbd8',.8);line(c,left,bottom,right,bottom,'#bdcbd8',.8);
  const ticks=chartDetail?[10,13,16,19,22,25]:[1,5,9,13,17,21,25];
  for(const n of ticks){if(Math.abs(gx(n)-gx(M.n))>16)label(c,''+n,gx(n),bottom+10,'#52677d',11)}
  label(c,'Corridoi n',right,h-5,'#54687e',11,'right');
  c.beginPath();c.moveTo(gx(first),bottom);
  for(const p of items)c.lineTo(gx(p.n),gy(p.fractional));
  c.lineTo(right,bottom);c.closePath();const grad=c.createLinearGradient(0,top,0,bottom);
  grad.addColorStop(0,'#467ccb27');grad.addColorStop(1,'#467ccb06');c.fillStyle=grad;c.fill();
  c.beginPath();items.forEach((p,i)=>{if(!i)c.moveTo(gx(p.n),gy(p.z));else{c.lineTo(gx(p.n),gy(items[i-1].z));c.lineTo(gx(p.n),gy(p.z))}});
  c.strokeStyle='#16837d';c.lineWidth=1.8;c.setLineDash([5,3]);c.stroke();c.setLineDash([]);
  c.beginPath();items.forEach((p,i)=>i?c.lineTo(gx(p.n),gy(p.fractional)):c.moveTo(gx(p.n),gy(p.fractional)));
  c.strokeStyle='#2b63ad';c.lineWidth=2.3;c.stroke();
  const current=gx(M.n);
  line(c,current,top,current,bottom,'#7492b6',1,[3,3]);
  c.fillStyle='#17847f';c.fillRect(current-3,gy(M.z)-3,6,6);
  c.beginPath();c.arc(current,gy(M.fractional),4.1,0,2*Math.PI);c.fillStyle='#285fa8';c.fill();c.strokeStyle='white';c.lineWidth=1.3;c.stroke();
  pill(c,String(M.n),current,bottom+10,'white','#2b5f9e',null,10);
  if(chartHover!==null&&chartHover>=first){
    const p=series[policy][chartHover-1],x=gx(p.n);
    line(c,x,top,x,bottom,'#4c6883',1,[2,4]);tooltip($('chartTip'),'n = '+p.n+' · '+fmt(p.fractional,3)+' frazionari\n'+p.z+' carrelli interi',x,gy(p.fractional)-20,$('chartStage'));
  }else $('chartTip').hidden=true;
}
function setConfiguration(n,mode=policy){
  n=clamp(Math.round(n),1,25);if(n===M.n&&mode===policy)return;
  policy=mode;M=series[mode][n-1];
  if(n<10)chartDetail=false;
  $('detailChart').setAttribute('aria-pressed',chartDetail);chartHover=null;
  zoom=1;panX=0;panY=0;updateZoom();resetFleet();updateData();drawBase();drawMotion();drawChart();
}
function updateZoom(){
  put('zoomValue',fmt(zoom*100)+'%');$('zoomOut').disabled=zoom<=1;$('zoomIn').disabled=zoom>=128;
  $('planStage').classList.toggle('zoomed',zoom>1);
}
function changeZoom(value,point=null){
  const next=clamp(value,1,128),ratio=next/zoom;
  if(point){panX+=(point.x-view.cx)*(1-ratio);panY+=(point.y-Y(M.v/2))*(1-ratio)}
  zoom=next;if(zoom===1){panX=0;panY=0}
  updateZoom();drawBase();drawMotion();
}
function localPoint(e,el){
  const r=el.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};
}
function chartNumber(e){
  const p=localPoint(e,chart),{first,left,right}=chartView;
  return clamp(Math.round(first+(p.x-left)*(25-first)/(right-left)),first,25);
}
$('nInput').addEventListener('input',e=>setConfiguration(Number(e.target.value)));
$('nDown').onclick=()=>setConfiguration(M.n-1);$('nUp').onclick=()=>setConfiguration(M.n+1);
$('opt').onclick=()=>setConfiguration(17);
document.querySelectorAll('input[name="policy"]').forEach(el=>el.onchange=()=>setConfiguration(M.n,el.value));
$('play').onclick=()=>{playing=!playing;previousTime=null;updatePlayer()};
$('reset').onclick=()=>{resetFleet();drawMotion()};
document.querySelectorAll('[data-speed]').forEach(btn=>btn.onclick=()=>{
  speed=Number(btn.dataset.speed);
  document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.speed)===speed));
});
$('showB').onchange=()=>{updateData();drawBase();drawMotion()};
$('showTrail').onchange=()=>drawMotion();
$('zoomIn').onclick=()=>changeZoom(zoom*2);$('zoomOut').onclick=()=>changeZoom(zoom/2);
$('fit').onclick=()=>changeZoom(1);
function setExpanded(on){
  $('planCard').classList.toggle('expanded',on);document.body.style.overflow=on?'hidden':'';
  $('expand').setAttribute('aria-pressed',on);$('expand').setAttribute('aria-label',on?'Riduci la pianta':'Espandi la pianta');
  $('expand').title=on?'Riduci la pianta (Esc)':'Espandi la pianta';
  if(on){motion.focus({preventScroll:true})}else $('expand').focus({preventScroll:true});
  drawBase();drawMotion();
}
$('expand').onclick=()=>setExpanded(!$('planCard').classList.contains('expanded'));
document.addEventListener('keydown',e=>{
  if(!$('planCard').classList.contains('expanded'))return;
  if(e.key==='Escape'){setExpanded(false);return}
  if(e.key==='Tab'){
    const focusable=Array.from($('planCard').querySelectorAll('button:not(:disabled),[tabindex="0"]'));
    if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable.at(-1).focus()}
    else if(!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();focusable[0].focus()}
  }
});
motion.onpointerdown=e=>{
  const p=localPoint(e,motion);
  if(zoom>1){drag={x:p.x,y:p.y,startX:panX,startY:panY,moved:false};motion.setPointerCapture(e.pointerId);$('planStage').classList.add('dragging')}
  hoverPoint=p;needsPaint=true;
};
motion.onpointermove=e=>{
  const p=localPoint(e,motion);
  if(drag){
    const dx=p.x-drag.x,dy=p.y-drag.y;
    if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;
    if(drag.moved){panX=drag.startX+dx;panY=drag.startY+dy;hoverPoint=null;selectedTruck=null;$('mapTip').hidden=true;drawBase();drawMotion();return}
  }
  hoverPoint=p;needsPaint=true;
};
function stopDrag(){drag=null;$('planStage').classList.remove('dragging')}
motion.onpointerup=stopDrag;motion.onpointercancel=stopDrag;
motion.onpointerleave=()=>{if(!drag){hoverPoint=null;selectedTruck=null;$('mapTip').hidden=true;needsPaint=true}};
motion.ondblclick=()=>changeZoom(1);
motion.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();changeZoom(zoom*(e.deltaY<0?1.25:.8),localPoint(e,motion))}},{passive:false});
motion.onkeydown=e=>{
  if(e.key==='+'||e.key==='=')changeZoom(zoom*2);
  else if(e.key==='-')changeZoom(zoom/2);
  else if(e.key==='Home')changeZoom(1);
  else if(zoom>1&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    if(e.key==='ArrowLeft')panX+=40;if(e.key==='ArrowRight')panX-=40;
    if(e.key==='ArrowUp')panY+=40;if(e.key==='ArrowDown')panY-=40;drawBase();drawMotion();
  }else return;e.preventDefault();
};
chart.onpointermove=e=>{chartHover=chartNumber(e);drawChart()};
chart.onpointerleave=()=>{chartHover=null;drawChart()};
chart.onclick=e=>setConfiguration(chartNumber(e));
chart.onkeydown=e=>{
  const lo=chartDetail?10:1,keys={ArrowLeft:M.n-1,ArrowDown:M.n-1,ArrowRight:M.n+1,ArrowUp:M.n+1,Home:lo,End:25};
  if(Object.hasOwn(keys,e.key)){e.preventDefault();setConfiguration(clamp(keys[e.key],lo,25))}
};
$('detailChart').onclick=()=>{
  chartDetail=!chartDetail;$('detailChart').setAttribute('aria-pressed',chartDetail);chartHover=null;drawChart();
};
$('dataBtn').onclick=()=>$('project').showModal();$('closeData').onclick=()=>$('project').close();
$('project').onclick=e=>{if(e.target===$('project')){const r=$('project').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('project').close()}};
function refresh(){drawBase();drawMotion();drawChart()}
new ResizeObserver(refresh).observe($('planStage'));new ResizeObserver(drawChart).observe($('chartStage'));
window.addEventListener('resize',refresh);
document.addEventListener('visibilitychange',()=>{previousTime=null});
function frame(now){
  if(previousTime!==null&&playing&&!document.hidden){
    const dt=(now-previousTime)/1000;
    if(dt>0){advance(dt*speed);updateClock();needsPaint=true}
  }
  previousTime=now;if(needsPaint)drawMotion();requestAnimationFrame(frame);
}
updateData();updatePlayer();updateZoom();resetFleet(true);refresh();requestAnimationFrame(frame);
