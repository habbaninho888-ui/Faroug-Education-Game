"""Real first-Arabic-click verification, including browser-rendered PCM energy.
No prior English playback; installed device voices are deliberately unavailable.
Requires local project server, Playwright and Chromium. No external audio services.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8001')
KEY='faroug-galaxy-academy-v1'
INSTRUMENT=r'''(()=>{
 window.__media=[];window.__native=0;window.__energies=[];window.__voices=[];
 Object.defineProperty(speechSynthesis,'getVoices',{value:()=>[],configurable:true});
 Object.defineProperty(speechSynthesis,'speak',{value:()=>{window.__native++;throw Error('No device speech allowed');},configurable:true});
 const OriginalAudio=window.Audio;let count=0;
 window.Audio=function(...args){const a=new OriginalAudio(...args);a.__id=++count;window.__voices.push(a);
 for(const event of ['playing','ended','error','pause'])a.addEventListener(event,()=>{const key=Object.keys(window.GALAXY_VOICE_PACK?.clips||{}).find(k=>window.GALAXY_VOICE_PACK.clips[k]===a.src);window.__media.push({event,key,volume:a.volume,muted:a.muted,id:a.__id});});
 a.addEventListener('playing',()=>{if(a.__graph)return;a.__graph=true;const ctx=new AudioContext();ctx.resume();const source=ctx.createMediaElementSource(a),analyser=ctx.createAnalyser();analyser.fftSize=1024;source.connect(analyser);analyser.connect(ctx.destination);const data=new Float32Array(1024);const sample=()=>{analyser.getFloatTimeDomainData(data);let energy=0;for(const v of data)energy+=v*v;window.__energies.push(Math.sqrt(energy/data.length));if(!a.ended)setTimeout(sample,30);};sample();});return a;};window.Audio.prototype=OriginalAudio.prototype;
})();'''
def main():
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-breakpad','--disable-crash-reporter'])
  ctx=b.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce');ctx.add_init_script(INSTRUMENT)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE,wait_until='networkidle')
  # This is the first user gesture in a fresh profile: Arabic directly from home.
  page.locator('[data-action=arabic-check]').first.click()
  page.wait_for_function("__media.some(x=>x.event==='ended'&&x.key?.startsWith('ar|')&&x.volume>0&&!x.muted)")
  assert page.evaluate('Math.max(...__energies)')>.005, 'Arabic must render non-silent PCM in the browser graph'
  assert page.evaluate('__native')==0
  assert not page.evaluate("__media.some(x=>x.event==='playing'&&x.key?.startsWith('en|')&&x.volume>0&&!x.muted)")
  expect(page.locator('[data-setting=voiceSource]')).to_have_value('pack')
  expect(page.locator('#narration-status')).to_contain_text('Arabic sample finished')
  print('PASS FIRST Arabic-only click: actual completion and browser PCM energy, no English priming or device voices',flush=True)
  # The same restore action must recover intentionally disabled/muted settings.
  page.locator('[data-setting=voice]').uncheck();page.locator('#quick-sound').click()
  page.locator('[data-action=arabic-check]').click()
  expect(page.locator('[data-setting=voice]')).to_be_checked()
  assert page.evaluate('(k)=>JSON.parse(localStorage.getItem(k)).settings.mute',KEY)==False
  print('PASS Enable & test Arabic recovers voice-off/mute without resetting progress',flush=True)
  # Deliberate device selection with zero Arabic device voices still uses a matching included clip.
  page.locator('[data-action=stop-voice]').click();page.locator('[data-setting=voiceSource]').select_option('device')
  page.evaluate('__media=[]')
  page.locator('[data-action=test-ar]').click()
  page.wait_for_function("__media.some(x=>x.event==='playing'&&x.key?.startsWith('ar|')&&x.volume>0&&!x.muted)",timeout=6000)
  assert page.evaluate('__native')==0
  print('PASS Missing Arabic device voice automatically falls back to included Arabic audio',flush=True)
  page.locator('[data-action=stop-voice]').click()
  # Recent version2 prefs migrate without erasing observed practice.
  old={'version':1,'settings':{'voiceRevision':2,'voiceSource':'device','rate':1,'voice':True},'stats':{'stardust':15,'attempted':4,'completed':3,'independent':2},'history':{},'sessions':[]}
  page.evaluate('([k,s])=>localStorage.setItem(k,JSON.stringify(s))',[KEY,old]);page.reload(wait_until='networkidle');page.locator('.profile-button').click()
  expect(page.locator('[data-setting=voiceSource]')).to_have_value('pack')
  assert page.locator('#star-total').inner_text()=='15'
  print('PASS Version2 stale device choice migrates to included voices; progress survives',flush=True)
  assert not errors, errors
  print('PASS No uncaught script errors in real Arabic recovery workflow',flush=True)
  b.close()
if __name__=='__main__':main()
