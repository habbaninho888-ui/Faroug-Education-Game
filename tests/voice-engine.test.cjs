// Deterministic narration behavior tests. No audio service or browser voice is assumed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../narration.js'), 'utf8');

const EN = {name:'Microsoft Aria Online (Natural)', voiceURI:'aria', lang:'en-US', localService:false};
const OLD_EN = {name:'Microsoft David', voiceURI:'david', lang:'en-US', localService:true};
const AR = {name:'Microsoft Zariyah Online (Natural)', voiceURI:'zariyah', lang:'ar_SA', localService:false};
const CLIP_EN = 'data:audio/mpeg;base64,SUQzBA==';
const CLIP_AR = 'data:audio/mpeg;base64,SUQzBQ==';
const PACK = {version:1, provider:'test', label:'Test narration', voices:{en:'English test',ar:'Arabic test'},
  clips:{'en|Hello explorer.':CLIP_EN,'ar|أَهْلًا بِكَ':CLIP_AR}};

function harness({voices=[], pack, settings={}}={}) {
  let now=0, nextTimer=1;
  const timers=new Map(), listeners=new Set(), status=[], speaking=[], audio=[];
  const options={voice:true,voiceVolume:.8,rate:1,voiceSource:'pack',...settings};
  const synth={voices:[...voices],spoken:[],cancels:0,speaking:false,pending:false,paused:false,
    getVoices(){return this.voices;},
    addEventListener(type,fn){if(type==='voiceschanged')listeners.add(fn);},
    removeEventListener(type,fn){if(type==='voiceschanged')listeners.delete(fn);},
    speak(u){this.spoken.push(u);this.speaking=true;u.onstart?.();},
    cancel(){this.cancels++;this.speaking=false;this.spoken.at(-1)?.onerror?.({error:'canceled'});},
    resume(){this.paused=false;},
    finish(){this.speaking=false;this.spoken.at(-1)?.onend?.();},
    changed(next){this.voices=next;for(const listener of listeners)listener();}
  };
  class Audio {
    constructor(){this.src='';this.volume=1;this.duration=NaN;this.playbackRate=1;this.playCalls=[];this.pauseCalls=0;audio.push(this);}
    play(){this.playCalls.push(this.src);if(this.rejectNext){const e=this.rejectNext;this.rejectNext=null;return Promise.reject(e);}if(this.hangNext){this.hangNext=false;return new Promise(()=>{});}this.onplaying?.();return Promise.resolve();}
    pause(){this.pauseCalls++;}
    removeAttribute(key){if(key==='src')this.src='';}
    load(){}
    finish(){this.onended?.();}
  }
  const window={speechSynthesis:synth,SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},Audio,GALAXY_VOICE_PACK:pack};
  vm.runInNewContext(source,{window,Date:{now:()=>now},setTimeout(fn,ms){const id=nextTimer++;timers.set(id,{at:now+ms,fn});return id;},clearTimeout(id){timers.delete(id);},console});
  const engine=window.GalaxyNarrator.create({settings:()=>options,onStatus:x=>status.push(x),onSpeaking:x=>speaking.push(x)});
  const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
  const tick=async ms=>{
    const target=now+ms;
    for(let n=0;n<10000;n++){
      const next=[...timers.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();
    }
    now=target;await flush();
  };
  return {engine,window,synth,audio,options,status,speaking,flush,tick,timers,listeners};
}

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test('delayed Arabic voices are awaited and underscore language tags normalize',async()=>{
  const h=harness();
  const result=h.engine.speak('أَهْلًا بِكَ','ar_SA');
  assert.equal(h.synth.spoken.length,0);
  await h.tick(300);
  h.synth.changed([EN,AR]);await h.flush();
  assert.equal(h.synth.spoken.length,1);
  assert.equal(h.synth.spoken[0].lang,'ar-SA');
  assert.equal(h.synth.spoken[0].voice,AR);
  assert.equal(h.status.length,0);
  h.synth.finish();assert.equal(await result,true);
  h.engine.dispose();
});

test('natural default is preferred, explicit saved selection is honored, pitch stays normal',async()=>{
  const h=harness({voices:[OLD_EN,EN]});
  h.engine.speak('Hello explorer.');
  assert.equal(h.synth.spoken[0].voice,EN);
  assert.equal(h.synth.spoken[0].pitch,1);
  assert.equal(h.synth.spoken[0].rate,1);
  assert.equal(h.synth.cancels,0);
  h.synth.finish();h.options.voiceEN='david';
  h.engine.speak('A second phrase.');
  assert.equal(h.synth.spoken[1].voice,OLD_EN);
  h.engine.dispose();
});

test('automatic narration finishes the current phrase and retains only latest feedback',async()=>{
  const h=harness({voices:[EN]});
  const first=h.engine.speak('The question.');
  const displaced=h.engine.speak('Old feedback.');
  const latest=h.engine.speak('Current feedback.');
  assert.equal(await displaced,false);
  assert.equal(h.synth.spoken.length,1);
  assert.equal(h.synth.cancels,0);
  h.synth.finish();await h.tick(20);
  assert.equal(await first,true);
  assert.deepEqual(h.synth.spoken.map(u=>u.text),['The question.','Current feedback.']);
  assert.equal(h.synth.cancels,0);
  h.synth.finish();assert.equal(await latest,true);
  h.engine.dispose();
});

test('manual replay cancels once, waits 80ms, and ignores old completion callbacks',async()=>{
  const h=harness({voices:[EN]});
  const first=h.engine.speak('The question.');
  const oldEnd=h.synth.spoken[0].onend,oldError=h.synth.spoken[0].onerror;
  const manual=h.engine.speak('Replay please.','en',{interrupt:true});
  assert.equal(await first,false);
  assert.equal(h.synth.cancels,1);
  await h.tick(79);assert.equal(h.synth.spoken.length,1);
  await h.tick(1);assert.equal(h.synth.spoken.length,2);
  const count=h.speaking.length;
  oldEnd();oldError({error:'network'});
  assert.equal(h.speaking.length,count);
  assert.equal(h.status.length,0);
  assert.equal(h.speaking.at(-1),true);
  h.synth.finish();assert.equal(await manual,true);
  h.engine.dispose();
});

test('navigation stop invalidates voice loading and no stale question starts later',async()=>{
  const h=harness();
  const result=h.engine.speak('أَهْلًا','ar');
  h.engine.stop();await h.flush();
  h.synth.changed([AR]);await h.tick(2000);
  assert.equal(await result,false);
  assert.equal(h.synth.spoken.length,0);
  assert.equal(h.status.length,0);
  h.engine.dispose();
});

test('missing voice warning is bounded, once per language, and recovers on voice discovery',async()=>{
  const h=harness({voices:[EN]});
  const one=h.engine.speak('أَهْلًا','ar');await h.tick(1800);
  assert.equal(await one,false);assert.equal(h.status.length,1);
  const two=h.engine.speak('حاول مرة أخرى.','ar');await h.tick(1800);
  assert.equal(await two,false);assert.equal(h.status.length,1);
  h.synth.changed([EN,AR]);h.engine.speak('أَهْلًا','ar');
  assert.equal(h.synth.spoken.length,1);
  h.engine.dispose();
});

test('embedded English and Arabic clips use one persistent player without device voices',async()=>{
  const h=harness({pack:PACK});
  const en=h.engine.speak('  Hello\n explorer.  ','en');
  const ar=h.engine.speak('أَهْلًا  بِكَ','ar-SA');
  assert.equal(h.audio.length,1);
  assert.equal(h.audio[0].src,CLIP_EN);
  assert.equal(h.audio[0].volume,.8);
  assert.equal(h.audio[0].playbackRate,1);
  assert.equal(h.audio[0].preservesPitch,true);
  assert.equal(h.synth.spoken.length,0);
  h.options.rate=.86;
  h.audio[0].finish();await h.tick(20);
  assert.equal(await en,true);
  assert.equal(h.audio[0].playbackRate,.86);
  assert.equal(h.audio.length,1);
  assert.equal(h.audio[0].src,CLIP_AR);
  assert.equal(h.status.length,0);
  h.audio[0].finish();assert.equal(await ar,true);
  assert.equal(h.engine.getStatus('ar').source,'pack');
  assert.equal(h.engine.getStatus('ar').available,true);
  h.engine.dispose();
});

test('voice pack preserves Arabic diacritics and rejects unsafe or malformed clips',async()=>{
  const h=harness({pack:PACK});
  assert.equal(h.window.GalaxyNarrator.normalize('  أَهْلًا\n بِكَ '),'أَهْلًا بِكَ');
  assert.equal(h.engine.setPack({version:1,clips:{'ar|hello':'https://untrusted.invalid/voice.mp3'}}).ok,false);
  assert.equal(h.engine.getStatus('ar').available,true);
  assert.equal(h.engine.setPack({version:1,clips:{'ar|':'data:audio/mpeg;base64,QQ=='}}).ok,false);
  h.engine.dispose();
});

test('missing recorded phrase does not silently use robotic fallback; device mode remains available',async()=>{
  const h=harness({pack:PACK,voices:[EN]});
  assert.equal(await h.engine.speak('Not in this pack.'),false);
  assert.equal(h.synth.spoken.length,0);assert.equal(h.status.length,1);
  h.options.voiceSource='device';
  h.engine.speak('Hello explorer.');
  assert.equal(h.synth.spoken.length,1);assert.equal(h.synth.spoken[0].voice,EN);
  assert.equal(h.audio.length,0);
  h.engine.dispose();
});

test('unlock reuses the player and cannot pause or mute the first real narration',async()=>{
  const h=harness({pack:PACK});
  const unlocked=h.engine.unlock();
  assert.equal(h.audio.length,1);assert.equal(h.audio[0].volume,0);assert.equal(h.audio[0].muted,true);
  const spoken=h.engine.speak('Hello explorer.');
  await h.flush();assert.equal(await unlocked,true);
  assert.equal(h.audio.length,1);assert.equal(h.audio[0].volume,.8);assert.equal(h.audio[0].muted,false);
  assert.equal(h.audio[0].playCalls.length,2);
  assert.equal(h.speaking.at(-1),true);
  h.audio[0].finish();assert.equal(await spoken,true);
  h.engine.dispose();
});

test('blocked clip playback asks for a gesture and an explicit retry can succeed',async()=>{
  const h=harness({pack:PACK});await h.engine.unlock();
  h.audio[0].rejectNext={name:'NotAllowedError'};
  const blocked=h.engine.speak('Hello explorer.');await h.flush();
  assert.equal(await blocked,false);
  assert.match(h.status[0],/Tap Hear to enable narration/);
  const retry=h.engine.speak('Hello explorer.','en',{interrupt:true});
  h.audio[0].finish();assert.equal(await retry,true);
  h.audio[0].rejectNext={name:'NotAllowedError'};
  const blockedAgain=h.engine.speak('Hello explorer.','en',{interrupt:true});await h.flush();
  assert.equal(await blockedAgain,false);
  assert.equal(h.status.filter(x=>x.includes('Tap Hear to enable narration')).length,2);
  h.engine.dispose();
});

test('a stalled clip start releases the latest queued narration after eight seconds',async()=>{
  const h=harness({pack:PACK});await h.engine.unlock();
  h.audio[0].hangNext=true;
  const first=h.engine.speak('Hello explorer.');
  const next=h.engine.speak('أَهْلًا بِكَ','ar');
  await h.tick(7999);assert.equal(h.audio[0].src,CLIP_EN);assert.equal(h.status.length,0);
  await h.tick(1);assert.equal(await first,false);assert.match(h.status[0],/could not start/);
  await h.tick(20);assert.equal(h.audio[0].src,CLIP_AR);
  h.audio[0].finish();assert.equal(await next,true);
  h.engine.dispose();assert.equal(h.timers.size,0);
});

test('clip completion watchdog uses duration and releases the following clip',async()=>{
  const h=harness({pack:PACK});await h.engine.unlock();
  h.audio[0].duration=20;
  const first=h.engine.speak('Hello explorer.');
  const next=h.engine.speak('أَهْلًا بِكَ','ar');
  await h.tick(24999);assert.equal(h.status.length,0);assert.equal(h.audio[0].src,CLIP_EN);
  await h.tick(1);assert.equal(await first,false);assert.match(h.status[0],/stopped responding/);
  await h.tick(20);assert.equal(h.audio[0].src,CLIP_AR);
  h.audio[0].finish();assert.equal(await next,true);
  h.engine.dispose();assert.equal(h.timers.size,0);
});

test('completion timeout stays within fifteen to ninety seconds and stops when disposed',async()=>{
  for(const [duration,budget] of [[.2,15000],[3600,90000]]){
    const h=harness({pack:PACK});await h.engine.unlock();h.audio[0].duration=duration;
    const result=h.engine.speak('Hello explorer.');
    await h.tick(budget-1);assert.equal(h.status.length,0);
    // Repeated metadata cannot move the deadline relative to first playback.
    h.audio[0].ondurationchange?.();
    await h.tick(1);assert.equal(await result,false);assert.equal(h.status.length,1);
    h.engine.dispose();assert.equal(h.timers.size,0);
  }
});

test('missing Arabic device voice falls back to the included clip and reports its real source',async()=>{
  const h=harness({pack:PACK,voices:[EN],settings:{voiceSource:'device'}});
  assert.equal(h.engine.getStatus('en').source,'device');
  const available=h.engine.getStatus('ar');
  assert.equal(available.source,'pack');assert.equal(available.requestedSource,'device');
  assert.equal(available.fallback,true);assert.equal(available.available,true);
  assert.match(available.label,/Arabic device voice unavailable/);
  const result=h.engine.speak('أَهْلًا بِكَ','ar');
  await h.tick(1799);assert.equal(h.audio.length,0);
  await h.tick(1);assert.equal(h.audio.length,1);assert.equal(h.audio[0].src,CLIP_AR);
  assert.match(h.status[0],/Playing the included Arabic narration instead/);
  h.audio[0].finish();assert.equal(await result,true);
  h.synth.changed([EN,AR]);h.engine.speak('أَهْلًا بِكَ','ar');
  assert.equal(h.synth.spoken.length,1);assert.equal(h.synth.spoken[0].voice,AR);
  assert.equal(h.engine.getStatus('ar').source,'device');assert.equal(h.engine.getStatus('ar').fallback,false);
  h.engine.dispose();
});

test('unsupported, failing and stalled native narration fall back once without losing the clip',async()=>{
  for(const kind of ['unsupported-api','native-error','native-watchdog']){
    const h=harness({pack:PACK,voices:[AR],settings:{voiceSource:'device'}});
    if(kind==='unsupported-api')h.window.SpeechSynthesisUtterance=undefined;
    const result=h.engine.speak('أَهْلًا بِكَ','ar');
    let staleEnd;
    if(kind!=='unsupported-api'){
      assert.equal(h.synth.spoken.length,1);staleEnd=h.synth.spoken[0].onend;
      if(kind==='native-error')h.synth.spoken[0].onerror({error:'language-unavailable'});
      else await h.tick(12000);
    }
    assert.equal(h.audio.length,1);assert.equal(h.audio[0].src,CLIP_AR);
    const status=h.engine.getStatus('ar');
    assert.equal(status.source,'pack');assert.equal(status.fallback,true);assert.equal(status.available,true);
    assert.equal(status.fallbackReason,kind==='unsupported-api'?'device-voice-unavailable':'device-playback-failed');
    const changes=h.speaking.length;staleEnd?.();assert.equal(h.speaking.length,changes);
    assert.equal(h.speaking.at(-1),true);
    h.audio[0].finish();assert.equal(await result,true);
    if(kind!=='unsupported-api'){
      const next=h.engine.speak('أَهْلًا بِكَ','ar');
      assert.equal(h.synth.spoken.length,1); // Keep the known-working fallback for this failed voice.
      h.audio[0].finish();assert.equal(await next,true);
    }
    h.engine.dispose();assert.equal(h.timers.size,0);
  }
});

test('muting, stop, stale clip events and disposal leave no active narration',async()=>{
  const h=harness({pack:PACK});
  const first=h.engine.speak('Hello explorer.');
  const stale=h.audio[0].onended;
  h.engine.stop();assert.equal(await first,false);assert.equal(h.audio[0].src,'');
  const second=h.engine.speak('أَهْلًا بِكَ','ar');
  const changes=h.speaking.length;stale();assert.equal(h.speaking.length,changes);
  h.options.mute=true;h.engine.stop();assert.equal(await second,false);
  assert.equal(await h.engine.speak('Hello explorer.'),false);
  h.engine.dispose();assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
  assert.equal(h.speaking.at(-1),false);
});

(async()=>{
  for(const [name,fn] of tests){await fn();console.log('PASS '+name);}
  console.log(`PASS ${tests.length} narration engine groups. These mocks verify behavior, not the sound quality of a voice.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
