/* Original learning-flight mini-game. No network, dependencies, or persistent state. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  window.startOrbit = function startOrbit(options) {
    const {container, onAnswer = () => {}, onHint = () => {}, onFinish = () => {}, onExit = () => {}, sfx = () => {}, speak = () => {}, reducedMotion = false} = options;
    const questions = (options.questions || []).filter(q => q.choices?.length > 1 && q.choices.length <= 4 && q.choices.includes(q.answer));
    if (!container || !questions.length) throw new Error('Orbit Flight needs a container and valid questions.');
    container.innerHTML = `<style>
      .orbit-game{--og-ink:#26334d;--og-mute:#6e768b;color:var(--og-ink);font-family:inherit;max-width:1100px;margin:auto;padding:4px 0 20px}
      .orbit-game *{box-sizing:border-box}.orbit-game button{font:inherit;cursor:pointer;touch-action:manipulation}.orbit-game button:focus-visible{outline:3px solid #b68cf4;outline-offset:4px}.orbit-game button:disabled{cursor:default}
      .orbit-top{display:flex;gap:16px;justify-content:space-between;align-items:center;margin-bottom:20px}.orbit-top h1{font-size:28px;letter-spacing:-1px;margin:0 0 5px;font-weight:800}.orbit-top p{margin:0;color:var(--og-mute);font-size:13px}.orbit-top-actions{display:flex;gap:8px}
      .orbit-small{background:#fff;border:1px solid #e1e2e8;color:#51586f;border-radius:12px;min-height:43px;padding:10px 14px;font-weight:700!important;font-size:13px!important}.orbit-small:hover{background:#f3f0fc}
      .orbit-objective{display:flex;align-items:center;gap:20px;justify-content:space-between;margin:0 0 14px;background:#fff;border:1px solid #e9e7ef;padding:20px 24px;border-radius:20px;min-height:111px}.orbit-objective-label{font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:1.4px;color:#7d6ca9}.orbit-question{font-size:21px;margin:7px 0 0;line-height:1.55;font-weight:750}.orbit-qvisual{color:#7253b5;font-size:34px;font-weight:800;letter-spacing:3px;line-height:1.5;text-align:center;max-width:48%;padding:0 15px}.orbit-qvisual.orbit-dots{display:flex;gap:7px;flex-wrap:wrap;max-width:130px;justify-content:center}.orbit-dot{width:16px;height:16px;border-radius:50%;background:#9c7ae0;box-shadow:inset -3px -3px #0001;display:block}
      .orbit-stage{position:relative;background:#151b38;overflow:hidden;border-radius:24px;isolation:isolate;box-shadow:0 15px 38px #29284c16}.orbit-stage canvas{display:block;width:100%;height:450px;touch-action:manipulation}.orbit-hud{position:absolute;inset:20px 24px auto;display:flex;justify-content:space-between;align-items:center;gap:12px;pointer-events:none}.orbit-hud b{color:#fff;font-size:12px;font-weight:700;background:#ffffff12;border:1px solid #ffffff15;border-radius:100px;padding:9px 14px;backdrop-filter:blur(8px)}.orbit-hud b:last-child{color:#ffe59a}.orbit-stage-help{position:absolute;bottom:17px;left:20px;right:20px;text-align:center;color:#d6d8ed;font-size:11px;letter-spacing:.3px;pointer-events:none;opacity:.8}.orbit-pause-screen{position:absolute;inset:0;display:none;place-content:center;text-align:center;background:#12182dda;backdrop-filter:blur(8px);color:white;z-index:5}.orbit-pause-screen.visible{display:grid}.orbit-pause-screen strong{font-size:30px;letter-spacing:-.6px}.orbit-pause-screen p{font-size:14px;color:#cbc8df}.orbit-pause-screen button{margin:10px auto;width:160px;background:#c4a3f2;border:0;padding:14px;border-radius:14px;color:#281c48;font-weight:800}
      .orbit-lanes{display:grid;grid-template-columns:repeat(var(--lane-count),minmax(0,1fr));gap:10px;margin:16px 0 12px}.orbit-lane{min-height:68px;border:2px solid #e2e0eb;border-radius:16px;background:white;color:#4a4863;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;position:relative;font-size:24px!important;font-weight:800!important;transition:background .15s,border-color .15s}.orbit-lane small{font-size:10px;font-weight:700;color:#8b829b;border:1px solid #e8e3f0;border-radius:6px;padding:4px 6px}.orbit-lane[aria-pressed=true]{border-color:#9872d7;background:#f1eafa;color:#66449b;box-shadow:0 0 0 2px #9872d712}.orbit-lane[disabled]{background:#f1f0f3;color:#a4a1ac;opacity:.5}.orbit-lane.orbit-right{border-color:#67ba9e;background:#edf9f1;color:#28755a;opacity:1}
      .orbit-bottom{display:flex;align-items:center;justify-content:space-between;gap:20px;background:#fff;border:1px solid #e8e6ed;border-radius:18px;padding:18px 20px;min-height:93px}.orbit-message{font-size:14px;line-height:1.65;margin:0;color:#6c6680;max-width:650px}.orbit-message[data-correct=true]{color:#32785e}.orbit-bottom-actions{display:flex;gap:9px;align-items:center;flex-shrink:0}.orbit-primary{border:0;border-radius:12px;background:#8356be;color:white;padding:14px 22px;min-height:48px;font-size:13px!important;font-weight:800!important;box-shadow:0 4px 0 #654396;white-space:nowrap}.orbit-primary:hover{background:#7548ad}.orbit-primary:disabled{opacity:.5;box-shadow:none}.orbit-primary[hidden],.orbit-small[hidden]{display:none}.orbit-progress{height:5px;background:#e9e4f0;border-radius:30px;margin-top:22px;overflow:hidden}.orbit-progress i{height:100%;display:block;background:linear-gradient(90deg,#ab84db,#71bba6);transition:width .3s}.orbit-caption{display:flex;justify-content:space-between;gap:20px;color:#8c869a;font-size:11px;margin-top:10px}.orbit-game .orbit-question[lang=ar]{font-size:23px}.orbit-qvisual[lang=ar]{letter-spacing:0}
      @media(max-width:650px){.orbit-top{gap:8px;align-items:flex-start}.orbit-top h1{font-size:22px}.orbit-top p{font-size:11px;max-width:220px;line-height:1.5}.orbit-top-actions{gap:5px}.orbit-small{padding:8px 10px;min-height:40px}.orbit-objective{padding:16px;gap:8px}.orbit-question{font-size:17px}.orbit-game .orbit-question[lang=ar]{font-size:20px}.orbit-qvisual{font-size:27px;max-width:40%;padding:0}.orbit-qvisual.orbit-dots{max-width:90px;gap:5px}.orbit-dot{width:12px;height:12px}.orbit-stage{border-radius:18px}.orbit-stage canvas{height:360px}.orbit-hud{inset:14px 14px auto}.orbit-hud b{font-size:10px;padding:8px 10px}.orbit-lanes{gap:7px}.orbit-lane{font-size:20px!important;min-height:60px;padding:8px;gap:0}.orbit-lane small{display:none}.orbit-bottom{flex-direction:column;align-items:stretch;gap:13px;padding:16px}.orbit-bottom-actions{justify-content:space-between}.orbit-primary{flex:1}.orbit-message{font-size:13px;min-height:42px}.orbit-caption span:last-child{display:none}}
      @media(prefers-reduced-motion:reduce){.orbit-game *{transition:none!important}}
    </style><section class="orbit-game" aria-label="Orbit Flight learning game">
      <div class="orbit-top"><div><h1>Orbit Flight</h1><p>A little adventure. A new discovery at every stop.</p></div><div class="orbit-top-actions"><button class="orbit-small" data-orbit="pause" aria-label="Pause flight">Ⅱ Pause</button><button class="orbit-small" data-orbit="exit">Exit flight</button></div></div>
      <div class="orbit-objective"><div><span class="orbit-objective-label">Your next discovery</span><h2 class="orbit-question"></h2></div><div class="orbit-qvisual"></div><button class="orbit-small" data-orbit="hear" aria-label="Read question aloud">♪ Hear it</button></div>
      <div class="orbit-stage"><canvas aria-hidden="true"></canvas><div class="orbit-hud"><b class="orbit-checkpoint"></b><b class="orbit-starcount">✦ 0 discoveries</b></div><div class="orbit-stage-help">Steer toward an answer gate. Collect it when you’re ready.</div><div class="orbit-pause-screen"><strong>Take your time.</strong><p>Your spaceship is waiting for you.</p><button data-orbit="resume">Resume flight →</button></div></div>
      <div class="orbit-lanes" role="group" aria-label="Choose your answer gate"></div>
      <div class="orbit-bottom"><p class="orbit-message" role="status" aria-live="polite"></p><div class="orbit-bottom-actions"><button class="orbit-small" data-orbit="hint">A little hint</button><button class="orbit-primary" data-orbit="collect">Collect answer →</button><button class="orbit-primary" data-orbit="next" hidden>Next checkpoint →</button></div></div>
      <div class="orbit-progress" role="progressbar" aria-label="Flight progress" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="0"><i style="width:0%"></i></div><div class="orbit-caption"><span>No timer. No lives to lose. Just room to explore.</span><span>← → steer · 1–4 select · Enter collect</span></div>
    </section>`;
    const root = container.querySelector('.orbit-game');
    const $ = query => root.querySelector(query);
    const canvas = $('canvas'), ctx = canvas.getContext('2d');
    const collect = $('[data-orbit=collect]'), next = $('[data-orbit=next]'), hint = $('[data-orbit=hint]'), message = $('.orbit-message');
    let index = 0, lane = 0, shipLane = 0, wrong = new Set(), attempts = 0, hinted = false, solved = false, paused = false, correctFirst = 0;
    let destroyed = false, raf = 0, lastTime = 0, time = 0, arrival = 0, width = 900, height = 450;
    let targets = [];
    const stars = Array.from({length:75},(_,i)=>({x:((i*127.13)%997)/997,y:((i*93.17)%613)/613,r:.7+(i%3)*.5,s:.1+(i%5)*.06}));
    const current = () => questions[index];
    function setMessage(text, good = false) {message.textContent = text; message.dataset.correct = String(good);}
    function visual(q) {
      const el = $('.orbit-qvisual'); el.classList.toggle('orbit-dots',q.visual?.type==='dots'); el.lang=q.lang==='ar'?'ar':'en';
      if(q.visual?.type==='dots') {el.setAttribute('role','img');el.setAttribute('aria-label',`${q.visual.value} dots`);el.innerHTML=Array.from({length:Math.min(20,Number(q.visual.value)||0)},()=>'<i class="orbit-dot"></i>').join('');}
      else {el.removeAttribute('role');el.removeAttribute('aria-label');el.textContent=q.visual?.value??'';}
    }
    function renderQuestion() {
      wrong=new Set();attempts=0;hinted=false;solved=false;arrival=0;lane=Math.floor((current().choices.length-1)/2);shipLane=lane;
      const q=current(); $('.orbit-question').textContent=q.prompt;$('.orbit-question').lang=q.lang==='ar'?'ar':'en';$('.orbit-question').dir=q.lang==='ar'?'rtl':'ltr';visual(q);
      $('.orbit-checkpoint').textContent=`CHECKPOINT ${index+1} / ${questions.length}`;
      $('.orbit-lanes').style.setProperty('--lane-count',q.choices.length);
      $('.orbit-lanes').innerHTML=q.choices.map((v,i)=>`<button class="orbit-lane" data-lane="${i}" aria-pressed="${i===lane}" aria-label="Answer gate ${escape(v)}"><small>${i+1}</small><span ${q.lang==='ar'?'lang="ar" dir="rtl"':''}>${escape(v)}</span></button>`).join('');
      collect.hidden=false;collect.disabled=!reducedMotion;next.hidden=true;hint.hidden=false;hint.disabled=false;
      if(reducedMotion){arrival=1;setMessage('Choose an answer gate below, then collect it.');}
      else setMessage('Approaching the next discovery. You can start choosing your gate.');
      $('.orbit-progress').setAttribute('aria-valuenow',index);$('.orbit-progress i').style.width=`${index/questions.length*100}%`;
    }
    function select(value) {
      if(paused||solved||wrong.has(value)||value<0||value>=current().choices.length)return;
      lane=value;if(reducedMotion)shipLane=value;
      root.querySelectorAll('[data-lane]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.lane===lane)));
      sfx('click');
    }
    function submit() {
      if(paused||solved||arrival<1||wrong.has(lane))return;
      const q=current(), correct=q.choices[lane]===q.answer, firstTry=correct&&attempts===0&&!hinted;
      onAnswer(q,{correct,firstTry,hinted});
      if(correct){
        solved=true;if(firstTry)correctFirst++;
        root.querySelector(`[data-lane="${lane}"]`).classList.add('orbit-right');root.querySelectorAll('[data-lane]').forEach(b=>b.disabled=true);
        sfx('correct');setMessage(q.explanation||'You found it. A new discovery for your star map!',true);
        $('.orbit-starcount').textContent=`✦ ${index+1} ${index===0?'discovery':'discoveries'}`;collect.hidden=true;next.hidden=false;hint.hidden=true;
        next.textContent=index===questions.length-1?'Complete flight →':'Next checkpoint →';next.focus({preventScroll:true});
        $('.orbit-progress').setAttribute('aria-valuenow',index+1);$('.orbit-progress i').style.width=`${(index+1)/questions.length*100}%`;
      }else{
        attempts++;wrong.add(lane);const b=root.querySelector(`[data-lane="${lane}"]`);b.disabled=true;b.setAttribute('aria-pressed','false');
        sfx('wrong');setMessage(`Let's explore another gate. ${q.hint||'Look carefully and try another answer.'}`);
        const remaining=q.choices.findIndex((_,i)=>!wrong.has(i));select(remaining);
      }
    }
    function advance(){
      if(!solved||paused)return;
      if(index===questions.length-1){destroy();onFinish({correctFirst,total:questions.length});return;}
      index++;renderQuestion();$('.orbit-question').tabIndex=-1;$('.orbit-question').focus({preventScroll:true});
    }
    function pause(value){
      paused=value;$('.orbit-pause-screen').classList.toggle('visible',value);$('[data-orbit=pause]').textContent=value?'▶ Resume':'Ⅱ Pause';
      $('[data-orbit=pause]').setAttribute('aria-label',value?'Resume flight':'Pause flight');
      if(value)$('[data-orbit=resume]').focus({preventScroll:true});else $('[data-orbit=pause]').focus({preventScroll:true});
    }
    function rootClick(e){
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-lane')){select(+b.dataset.lane);return;}
      switch(b.dataset.orbit){
        case 'collect':submit();break;
        case 'next':advance();break;
        case 'hear':speak(current().spoken||current().prompt,current().lang||'en');break;
        case 'hint':if(!solved&&!paused&&!hinted){onHint(current());hinted=true;setMessage(current().hint||'Look carefully at each answer gate.');hint.disabled=true;}break;
        case 'pause':pause(!paused);break;
        case 'resume':pause(false);break;
        case 'exit':destroy();onExit();break;
      }
    }
    function keydown(e){
      if(destroyed||!root.isConnected||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea,[contenteditable=true]'))return;
      if(e.key==='Escape'){e.preventDefault();pause(!paused);return;}
      if(paused)return;
      if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a'){e.preventDefault();let n=lane-1;while(n>=0&&wrong.has(n))n--;select(Math.max(0,n));}
      if(e.key==='ArrowRight'||e.key.toLowerCase()==='d'){e.preventDefault();let n=lane+1;while(n<current().choices.length&&wrong.has(n))n++;select(Math.min(current().choices.length-1,n));}
      if(/^[1-4]$/.test(e.key)){e.preventDefault();select(Number(e.key)-1);}
      // Native focused buttons retain Enter/Space behavior; shortcuts work when the board has focus.
      if((e.key==='Enter'||e.code==='Space')&&!e.target.closest('button')){e.preventDefault();solved?advance():submit();}
    }
    function clickCanvas(e){
      if(paused||solved)return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*width/r.width,y=(e.clientY-r.top)*height/r.height;
      targets.forEach((t,i)=>{if(x>t.x-t.w/2&&x<t.x+t.w/2&&y>t.y-t.h/2&&y<t.y+t.h/2)select(i);});
    }
    function resize(){if(destroyed)return;width=canvas.clientWidth||900;height=canvas.clientHeight||450;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
    const round=(x,y,w,h,r,fill,stroke)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}};
    function planet(x,y,r,colors,ring){
      ctx.save();ctx.translate(x,y);if(ring){ctx.save();ctx.rotate(-.38);ctx.strokeStyle=colors[0]+'55';ctx.lineWidth=r*.19;ctx.beginPath();ctx.ellipse(0,0,r*1.7,r*.35,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
      const g=ctx.createRadialGradient(-r*.4,-r*.4,r*.1,0,0,r);g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.15;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(-r*.3,-r*.4,r*.34,r*.12,-.6,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    function star(x,y,r,fill){ctx.beginPath();for(let j=0;j<8;j++){const a=j*Math.PI/4-Math.PI/2,rr=j%2?r*.3:r;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
    function draw(dt){
      if(!ctx)return;
      if(!paused){time+=dt;if(arrival<1){arrival=Math.min(1,arrival+dt/1.8);if(arrival===1){collect.disabled=false;setMessage('Choose an answer gate below, then collect it.');}}shipLane+=(lane-shipLane)*(reducedMotion?1:Math.min(1,dt*7));}
      const w=width,h=height;ctx.clearRect(0,0,w,h);
      const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#141d3e');bg.addColorStop(.55,'#242748');bg.addColorStop(1,'#303153');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      const glow=ctx.createRadialGradient(w*.5,h*.25,0,w*.5,h*.25,w*.55);glow.addColorStop(0,'#8f76c52e');glow.addColorStop(1,'#8f76c500');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
      stars.forEach((s,i)=>{const y=((s.y*h+(reducedMotion?0:time*s.s*7))%(h+8))-4;ctx.globalAlpha=.3+(i%4)*.15;ctx.beginPath();ctx.arc(s.x*w,y,s.r,0,Math.PI*2);ctx.fillStyle=i%5===0?'#efdb9b':'#dde2ff';ctx.fill();});ctx.globalAlpha=1;
      planet(w*.1,h*.27,Math.min(w*.055,45),['#a2cfc6','#416c7b'],false);planet(w*.91,h*.36,Math.min(w*.075,66),['#c1a1d4','#685886'],true);
      const n=current().choices.length,spread=Math.min(w*.72,650),spacing=spread/n,start=w/2-spread/2+spacing/2;
      // Perspective pathways converge toward the distant star gate.
      for(let i=0;i<=n;i++){
        const x=w/2-spread/2+i*spacing;ctx.beginPath();ctx.moveTo(w/2+(x-w/2)*.1,h*.17);ctx.quadraticCurveTo(w/2+(x-w/2)*.4,h*.44,x+(x-w/2)*.18,h*.97);ctx.strokeStyle='#c1b3f014';ctx.lineWidth=1;ctx.stroke();
      }
      for(let i=0;i<6;i++){const y=h*.25+i*h*.12;ctx.beginPath();ctx.ellipse(w/2,y,spread*(.06+i*.09),h*.018+i*2,0,0,Math.PI);ctx.strokeStyle='#a6acdf10';ctx.stroke();}
      const intro=reducedMotion?1:1-Math.pow(1-arrival,3),gateY=h*(.27+.24*intro),gateW=Math.min(spacing*.78,140),gateH=Math.min(h*.25,112);
      targets=[];
      current().choices.forEach((choice,i)=>{
        const x=start+i*spacing, chosen=i===lane, disabled=wrong.has(i),good=solved&&chosen;targets.push({x,y:gateY,w:gateW,h:gateH});
        ctx.save();ctx.globalAlpha=disabled?.25:1;ctx.shadowBlur=chosen?22:0;ctx.shadowColor=good?'#8de7c7':'#c59cf9';ctx.lineWidth=chosen?2.5:1;
        round(x-gateW/2,gateY-gateH/2,gateW,gateH,Math.min(18,gateW*.17),good?'#497d75':chosen?'#725599':'#333854',good?'#97e2c6':chosen?'#d5b5ff':'#6b668b');ctx.shadowBlur=0;
        round(x-gateW/2+6,gateY-gateH/2+6,gateW-12,gateH-12,12,'#ffffff05');
        ctx.textAlign='center';ctx.textBaseline='middle';let fs=Math.min(34,gateW*.4);ctx.font=`700 ${fs}px "Segoe UI", Tahoma, Arial, sans-serif`;while(ctx.measureText(String(choice)).width>gateW-14&&fs>12){fs--;ctx.font=`700 ${fs}px "Segoe UI", Tahoma, Arial, sans-serif`;}
        ctx.fillStyle=disabled?'#aaa4bc':'#fff9f1';ctx.fillText(String(choice),x,gateY+2);
        ctx.restore();
        if(!disabled)star(x,gateY-gateH/2-19,chosen?8:5,chosen?'#ffe5a4':'#8d839f');
      });
      const shipX=start+shipLane*spacing,shipY=h*.82+(reducedMotion?0:Math.sin(time*2)*3),scale=Math.min(1,w/600+.2);
      ctx.save();ctx.translate(shipX,shipY);ctx.scale(scale,scale);
      const beam=ctx.createLinearGradient(0,-h*.25,0,25);beam.addColorStop(0,'#c8a6ff00');beam.addColorStop(1,'#c8a6ff15');ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(-28,0);ctx.lineTo(-spacing*.3,-h*.23);ctx.lineTo(spacing*.3,-h*.23);ctx.lineTo(28,0);ctx.closePath();ctx.fill();
      ctx.fillStyle='#cbb3f0';ctx.beginPath();ctx.moveTo(0,-45);ctx.bezierCurveTo(18,-40,28,-8,39,16);ctx.quadraticCurveTo(20,24,0,18);ctx.quadraticCurveTo(-20,24,-39,16);ctx.bezierCurveTo(-28,-8,-18,-40,0,-45);ctx.fill();
      ctx.fillStyle='#84669f';ctx.beginPath();ctx.moveTo(-12,-11);ctx.lineTo(-47,24);ctx.lineTo(-16,15);ctx.lineTo(0,-9);ctx.lineTo(16,15);ctx.lineTo(47,24);ctx.lineTo(12,-11);ctx.closePath();ctx.fill();
      const glass=ctx.createLinearGradient(-10,-31,15,-6);glass.addColorStop(0,'#b3e5df');glass.addColorStop(1,'#4c8395');ctx.fillStyle=glass;ctx.beginPath();ctx.ellipse(0,-23,12,18,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e9f9ed99';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#fff5db';ctx.beginPath();ctx.ellipse(-4,-30,3,7,.3,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#e7c88d';ctx.beginPath();ctx.moveTo(-7,19);ctx.quadraticCurveTo(0,49+(reducedMotion?0:Math.sin(time*15)*5),7,19);ctx.fill();ctx.fillStyle='#fff5d4';ctx.beginPath();ctx.moveTo(-3,19);ctx.quadraticCurveTo(0,38,3,19);ctx.fill();
      ctx.restore();
      if(solved){for(let i=0;i<9;i++){const a=i*Math.PI*2/9,r=48+(reducedMotion?0:Math.sin(time*1.5)*5);star(shipX+Math.cos(a)*r,shipY+Math.sin(a)*r*.6,3+i%3,'#f7d88f');}}
    }
    function frame(t){if(destroyed)return;const dt=lastTime?Math.min(.05,(t-lastTime)/1000):.016;lastTime=t;draw(dt);raf=requestAnimationFrame(frame);}
    function visibility(){if(document.hidden&&!paused)pause(true);}
    function destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(raf);observer.disconnect();root.removeEventListener('click',rootClick);canvas.removeEventListener('click',clickCanvas);document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visibility);}
    root.addEventListener('click',rootClick);canvas.addEventListener('click',clickCanvas);document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',visibility);
    const observer=new ResizeObserver(resize);observer.observe(canvas);renderQuestion();resize();raf=requestAnimationFrame(frame);
    return {destroy};
  };
})();
