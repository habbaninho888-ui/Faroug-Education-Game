/* Fixed-step runner simulation shared by the canvas UI and regression tests. */
(() => {
  'use strict';
  const sequence = ['coin', 'rock', 'coin', 'barrier', 'coin', 'rock', 'barrier', 'coin', 'coin', 'rock', 'barrier', 'coin'];
  class RunnerModel {
    constructor({pace = .75, calm = false, onEvent = () => {}} = {}) {
      Object.assign(this, {pace, calm, onEvent, time: 0, distance: 0, y: 0, vy: 0, duck: 0, land: 0, hit: 0, glow: 0, coins: 0, bumps: 0, index: 0, next: 1.6, objects: [], particles: [], paused: true, done: false, buffer: 0});
    }
    emit(type) { this.onEvent(type, this); }
    action(kind) {
      if (this.paused || this.done) return;
      if (this.calm) {
        const item = sequence[this.index];
        if (item === 'coin' && kind === 'collect') {this.coins++; this.glow = .6; this.emit('coin');}
        else if ((item === 'rock' && kind === 'jump') || (item === 'barrier' && kind === 'duck')) this.emit(kind);
        else {this.emit(item === 'rock' ? 'try-jump' : item === 'barrier' ? 'try-duck' : 'try-collect'); return;}
        this.index++;
        if (this.index >= sequence.length) {this.done = true; this.emit('finish');}
        return;
      }
      if (kind === 'jump') {
        this.duck = 0;
        if (this.y <= 0) {this.vy = 650; this.land = 0; this.emit('jump');}
        else this.buffer = .14;
      }
      if (kind === 'duck' && this.y <= 0) {this.duck = .95; this.emit('duck');}
    }
    step(dt) {
      if (this.paused || this.done || this.calm) return;
      dt = Math.min(dt, 1 / 30);
      this.time += dt; this.distance += 250 * this.pace * dt;
      for (const k of ['duck', 'land', 'hit', 'glow', 'buffer']) this[k] = Math.max(0, this[k] - dt);
      if (this.y > 0 || this.vy > 0) {
        this.vy -= 1550 * dt; this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0; this.vy = 0; this.land = .16; this.emit('land');
          if (this.buffer > 0) this.action('jump');
        }
      }
      if (this.time >= this.next && this.index < sequence.length) {
        this.objects.push({kind: sequence[this.index++], x: 1000, checked: false});
        this.next += 2.8 / this.pace;
      }
      for (const o of this.objects) {
        o.x -= 250 * this.pace * dt;
        // A single swept encounter avoids frame-rate-dependent double hits.
        if (o.x <= 210 && !o.checked) {
          o.checked = true;
          if (o.kind === 'coin') {this.coins++; this.glow = .65; this.emit('coin');}
          else if ((o.kind === 'rock' && this.y < 58) || (o.kind === 'barrier' && (this.duck <= 0 || this.y > 0))) {
            this.bumps++; this.hit = .65; this.emit(o.kind === 'rock' ? 'hit-rock' : 'hit-barrier');
          } else this.emit('clear');
        }
      }
      this.objects = this.objects.filter(o => o.x > -80);
      if (this.index === sequence.length && !this.objects.length) {this.done = true; this.emit('finish');}
    }
    get encounter() {return sequence[this.index];}
  }
  if (typeof module !== 'undefined') module.exports = {RunnerModel, sequence};
  if (typeof window === 'undefined') return;
  window.GalaxyRunnerModel = RunnerModel;
  window.startRunner = ({container, settings, sfx, speak, stopSpeech, onFinish, onExit}) => {
    container.innerHTML = `<section class="runner" aria-labelledby="runner-title">
      <div class="runner-heading"><div><div class="eyebrow">A LITTLE MOVEMENT BREAK</div><h1 id="runner-title">Starlight Run</h1><p>Jump, duck, and gather a pocketful of light.</p></div><button class="btn btn-outline" data-run="exit">Exit run</button></div>
      <div class="runner-toolbar"><label>Pace <select id="runner-pace"><option value="0.75">Gentle</option><option value="1">Adventurous</option></select></label><label>Coach <select id="runner-language"><option value="en">English</option><option value="ar">العربية الفصحى</option></select></label><button class="btn btn-outline" data-run="pause" disabled>Pause</button></div>
      <div class="runner-stage"><canvas aria-label="Nova’s running trail. Use the Jump and Duck buttons below." role="img"></canvas><div class="runner-hud"><span>✦ <b id="runner-coins">0</b> coins</span><span id="runner-progress">12 little moments</span></div>
      <div class="runner-overlay"><h2>Ready, little explorer?</h2><p>Jump over rocks. Duck under striped barriers.<br>Coins come to you. Bumps are okay—you keep going.</p><p>No lives to lose. Your learning scores stay separate.</p><button class="btn btn-primary" data-run="start">Let’s run →</button></div></div>
      <p class="runner-message" role="status" aria-live="polite">${settings.motion ? '↑ or Space to jump · ↓ to duck · P to pause. You can also swipe up or down.' : 'Stiller play: the trail waits for you. Choose Jump, Duck, or Collect for each object.'}</p>
      <div class="runner-controls"><button class="btn btn-primary" data-run="jump" disabled>↑ Jump</button><button class="btn btn-soft" data-run="duck" disabled>↓ Duck</button><button class="btn btn-outline" data-run="collect" ${settings.motion ? 'hidden' : ''} disabled>✦ Collect</button></div>
      <p class="report-note">Coins celebrate play, not learning progress. A short trail, then a moment to stretch.</p>
    </section>`;
    const root = container.querySelector('.runner'), $ = s => root.querySelector(s);
    const canvas = $('canvas'), ctx = canvas.getContext('2d'), overlay = $('.runner-overlay'), message = $('.runner-message');
    let destroyed = false, raf = 0, previous = 0, accumulator = 0, model, started = false, finished = false, particles = [], lastCue = -10, count = 0, pointer = null;
    const cues = {
      jump: [['Up we go!', 'A little leap!'], ['هَيَّا نَقْفِزْ!', 'قَفْزَةٌ جَمِيلَةٌ!']],
      duck: [['Down low!', 'Nice and low!'], ['لِنَنْحَنِ!', 'أَحْسَنْتَ!']],
      coin: [['A little light!', 'You found a coin!', 'Lovely collecting!'], ['عُمْلَةٌ جَدِيدَةٌ!', 'جَمْعٌ رَائِعٌ!', 'أَحْسَنْتَ!']],
      'hit-rock': [['A bump! Try jumping over the next rock.'], ['لَا بَأْسَ! لِنَقْفِزْ فَوْقَ الصَّخْرَةِ التَّالِيَةِ.']],
      'hit-barrier': [['A bump! Duck under the next barrier.'], ['لَا بَأْسَ! لِنَنْحَنِ تَحْتَ الْحَاجِزِ التَّالِي.']],
      clear: [['You made it!', 'Nicely done!'], ['أَحْسَنْتَ!', 'مُرُورٌ رَائِعٌ!']],
      'try-jump': [['Choose Jump for the rock.'], ['اِخْتَرِ الْقَفْزَ فَوْقَ الصَّخْرَةِ.']],
      'try-duck': [['Choose Duck for the barrier.'], ['اِخْتَرِ الانْحِنَاءَ تَحْتَ الْحَاجِزِ.']],
      'try-collect': [['Choose Collect for the coin.'], ['اِخْتَرْ جَمْعَ الْعُمْلَةِ.']]
    };
    function controls(enabled) {$$('.runner-controls button').forEach(b => b.disabled = !enabled);}
    function $$(s) {return [...root.querySelectorAll(s)];}
    function burst(type) {
      if (!settings.motion) return;
      const color = type === 'coin' ? '#ffe399' : type.startsWith('hit') ? '#d7c7ff' : '#b5dded';
      for (let i = 0; i < (type === 'coin' ? 16 : 8); i++) particles.push({x: 210, y: 310 - model.y, vx: Math.cos(i * 2.4) * 100, vy: -40 - i * 10, life: .65, color});
    }
    function event(kind) {
      if (kind === 'finish') {finish(); return;}
      sfx(kind);
      if (['coin', 'land', 'hit-rock', 'hit-barrier'].includes(kind)) burst(kind);
      if (cues[kind]) {
        const lang = $('#runner-language').value, choices = cues[kind][lang === 'ar' ? 1 : 0], text = choices[count++ % choices.length];
        message.textContent = text; message.lang = lang; message.dir = lang === 'ar' ? 'rtl' : 'ltr';
        if (model.calm || model.time - lastCue >= 2.5) {speak(text, lang, {quiet: true}); lastCue = model.time;}
      }
      $('#runner-coins').textContent = model.coins;
    }
    function reset() {
      model = new RunnerModel({pace: Number($('#runner-pace').value), calm: !settings.motion, onEvent: event});
      model.paused = false; started = true; finished = false; particles = []; lastCue = -10;
      overlay.hidden = true; controls(true); $('[data-run=pause]').disabled = false;
      $('[data-run=pause]').textContent = 'Pause'; $('#runner-pace').disabled = true;
      $('#runner-coins').textContent = '0'; previous = 0; accumulator = 0;
      $('[data-run=jump]').focus({preventScroll: true});
    }
    function pause(value = true) {
      if (!started || finished) return;
      model.paused = value; previous = 0; accumulator = 0; stopSpeech(); controls(!value);
      $('[data-run=pause]').textContent = value ? 'Resume' : 'Pause';
      overlay.hidden = !value;
      if (value) {overlay.innerHTML = '<h2>A little breather.</h2><p>The trail will wait for you.</p><button class="btn btn-primary" data-run="resume">Resume run →</button>'; $('[data-run=resume]').focus({preventScroll:true});}
      else $('[data-run=jump]').focus({preventScroll:true});
    }
    function finish() {
      if (finished || destroyed) return;
      finished = true; controls(false); stopSpeech(); sfx('correct');
      $('[data-run=pause]').disabled = true; $('#runner-pace').disabled = false;
      $('#runner-coins').textContent = model.coins;
      overlay.hidden = false;
      overlay.innerHTML = `<h2>A pocketful of starlight!</h2><p>${model.coins} coins collected. Every try counts.</p><p>Stretch your arms and take a little break.</p><div><button class="btn btn-primary" data-run="exit">Back to adventures</button> <button class="btn btn-outline" data-run="start">Play again</button></div>`;
      onFinish({coins: model.coins, bumps: model.bumps, seconds: Math.round(model.time), calm: model.calm});
      overlay.querySelector('[data-run=exit]')?.focus({preventScroll:true});
    }
    function click(e) {
      const b = e.target.closest('[data-run]'); if (!b || b.disabled) return;
      const action = b.dataset.run;
      if (action === 'exit') {destroy(); onExit();}
      else if (action === 'start') reset();
      else if (action === 'pause') pause(!model.paused);
      else if (action === 'resume') pause(false);
      else model?.action(action);
    }
    function key(e) {
      if (e.target.matches('input,select,textarea') || e.repeat || !started || finished) return;
      if (e.code === 'KeyP' || e.code === 'Escape') {e.preventDefault(); pause(!model.paused);}
      // Focused buttons keep normal Space/Enter activation.
      else if (e.code === 'ArrowUp' || (e.code === 'Space' && !e.target.closest('button'))) {e.preventDefault(); model.action('jump');}
      else if (e.code === 'ArrowDown') {e.preventDefault(); model.action('duck');}
    }
    function visibility() {if (document.hidden) pause(true);}
    function pointerDown(e) {pointer = {id: e.pointerId, x: e.clientX, y: e.clientY}; canvas.setPointerCapture(e.pointerId);}
    function pointerUp(e) {
      if (!pointer || pointer.id !== e.pointerId) return;
      const dy = e.clientY - pointer.y, dx = e.clientX - pointer.x;
      if (Math.abs(dy) > 24 && Math.abs(dy) > Math.abs(dx)) model?.action(dy < 0 ? 'jump' : 'duck');
      pointer = null;
    }
    const round = (x,y,w,h,r,color) => {ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
    const ellipse = (x,y,rx,ry,color) => {ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();};
    function drawObject(o) {
      if (o.kind === 'coin') {
        if (o.checked) return;
        const radius = settings.motion ? 10 + Math.abs(Math.cos((model?.time || 0)*4)) * 9 : 18;
        ellipse(o.x,278,radius+5,25,'#ffda7630');ellipse(o.x,278,radius,20,'#f5cf78');
        ctx.fillStyle='#76531b';ctx.font='bold 23px sans-serif';ctx.textAlign='center';ctx.fillText('✦',o.x,286);
      } else if (o.kind === 'rock') {
        ctx.fillStyle='#968cac';ctx.beginPath();ctx.moveTo(o.x-32,338);ctx.lineTo(o.x-25,303);ctx.lineTo(o.x-4,283);ctx.lineTo(o.x+23,297);ctx.lineTo(o.x+34,338);ctx.fill();
        ctx.fillStyle='#c1b6d3';ctx.beginPath();ctx.moveTo(o.x-25,303);ctx.lineTo(o.x-4,283);ctx.lineTo(o.x+4,313);ctx.fill();
      } else {
        round(o.x-32,232,9,106,4,'#8a7da6');round(o.x+24,232,9,106,4,'#8a7da6');round(o.x-40,242,80,29,5,'#f7ce85');
        ctx.save();ctx.beginPath();ctx.rect(o.x-40,242,80,29);ctx.clip();ctx.strokeStyle='#654c7a';ctx.lineWidth=12;
        for(let x=-50;x<60;x+=26){ctx.beginPath();ctx.moveTo(o.x+x,240);ctx.lineTo(o.x+x+20,274);ctx.stroke();}ctx.restore();
      }
    }
    function drawNova() {
      const m = model || {y:0,time:0,duck:0,land:0,hit:0,glow:0,paused:true};
      const stride = settings.motion && !m.paused && !finished ? Math.sin(m.time*16) : 0;
      ellipse(210,342,Math.max(15,32-m.y*.09),8,'#14182e44');
      ctx.save();ctx.translate(210,338-m.y);
      if (settings.motion) {ctx.rotate(m.hit ? -.16*Math.sin(m.hit*19) : m.y > 0 ? -.07 : .035*stride);ctx.scale(m.land ? 1.12 : 1,m.land ? .87 : 1);}
      const duck = m.duck > 0;
      if (duck) {ctx.translate(0, -2);ctx.scale(1.2,.52);}
      if (m.glow) {ellipse(0,-55,52,66,'#ffe39328');}
      // Articulated legs, arms and antenna give each movement a distinct silhouette.
      const leg = m.y > 0 ? 15 : stride*13;
      ctx.strokeStyle='#a494d4';ctx.lineWidth=13;ctx.lineCap='round';
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*12,-30);ctx.lineTo(side*13+side*leg,-15);ctx.lineTo(side*13-side*leg*.4,-4);ctx.stroke();}
      round(-25,-68,50,43,17,'#bba8eb');
      ctx.strokeStyle='#cdbcf4';ctx.lineWidth=10;
      for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*26,-58);ctx.lineTo(side*34,-42+(m.y>0?-24:side*stride*10));ctx.stroke();}
      round(-34,-114,68,51,18,'#d9cdf8');round(-27,-104,54,30,11,'#273650');
      if (m.hit) {ctx.strokeStyle='#c3f6e1';ctx.lineWidth=3;for(const x of [-13,13]){ctx.beginPath();ctx.moveTo(x-4,-93);ctx.lineTo(x+3,-89);ctx.lineTo(x-4,-85);ctx.stroke();}}
      else {ellipse(-12,-91,4,6,'#baf1da');ellipse(12,-91,4,6,'#baf1da');}
      ctx.strokeStyle='#baf1da';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-86,5,0,Math.PI);ctx.stroke();
      ctx.strokeStyle='#c4b2eb';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-114);ctx.lineTo(stride*2,-128);ctx.stroke();ellipse(stride*2,-131,5,5,'#ffe19b');
      ellipse(0,-48,8,8,'#8271bb');ctx.restore();
    }
    function render() {
      const dpr = Math.min(devicePixelRatio || 1, 2), width = canvas.clientWidth || 960, height = canvas.clientHeight || 400;
      if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      ctx.setTransform(canvas.width/(width<650?600:960),0,0,canvas.height/400,0,0);
      const bg = ctx.createLinearGradient(0,0,0,400);bg.addColorStop(0,'#222344');bg.addColorStop(1,'#5c507a');ctx.fillStyle=bg;ctx.fillRect(0,0,960,400);
      for(let i=0;i<45;i++){const x=(i*127.3-(settings.motion?(model?.distance||0)*.08:0))%1000;ellipse((x+1000)%1000,(i*47)%210+15,i%3===0?2:1,i%3===0?2:1,'#e9e0f5');}
      ellipse(785,98,54,54,'#bea4ce');ellipse(768,85,11,8,'#a48eb8');ellipse(802,116,7,9,'#a48eb8');
      ctx.fillStyle='#4b4c70';ctx.beginPath();ctx.moveTo(0,330);for(let x=0;x<=960;x+=40)ctx.lineTo(x,280+Math.sin(x*.009)*26);ctx.lineTo(960,400);ctx.lineTo(0,400);ctx.fill();
      round(0,340,960,60,0,'#77749a');round(0,340,960,5,0,'#b6b9c8');
      const offset = settings.motion ? (model?.distance || 0)%100 : 0;
      for(let x=-100;x<1000;x+=100)round(x-offset,365,42,3,2,'#b6afc3');
      if (model?.calm && !model.done) drawObject({kind:model.encounter,x:500});
      else model?.objects.forEach(drawObject);
      drawNova();
      for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/.65);ellipse(p.x,p.y,4,4,p.color);}ctx.globalAlpha=1;
      if (model) {
        $('#runner-progress').textContent = model.calm ? `${Math.min(model.index+1,12)} / 12 · ${model.done ? 'Complete' : {rock:'Jump over the rock',barrier:'Duck under the barrier',coin:'Collect the coin'}[model.encounter]}` : `${Math.min(model.index,12)} / 12 little moments`;
      }
    }
    function frame(now) {
      if (destroyed) return;
      const dt = previous ? Math.min((now-previous)/1000,.1) : 0; previous=now;
      if (model && !model.paused && !model.done) {
        accumulator += dt;
        while(accumulator>=1/120){model.step(1/120);accumulator-=1/120;}
        for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=200*dt;p.life-=dt;}
        particles=particles.filter(p=>p.life>0);
      }
      render();raf=requestAnimationFrame(frame);
    }
    function destroy() {if(destroyed)return;destroyed=true;cancelAnimationFrame(raf);stopSpeech();root.removeEventListener('click',click);document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',visibilityBlur);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerCancel);}
    function visibilityBlur(){pause(true);}
    function pointerCancel(){pointer=null;}
    root.addEventListener('click',click);document.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',visibilityBlur);canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerCancel);
    raf=requestAnimationFrame(frame);
    return {destroy, pause};
  };
})();
