const {test,expect}=require('@playwright/test');
const KEY='faroug-galaxy-academy-v1';
async function open(page,settings={}){await page.addInitScript(({KEY,settings})=>{if(!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify({version:1,settings:{voice:false,length:4,...settings}}));},{KEY,settings});await page.goto('/');}
async function nav(page,view){await page.locator(`.nav-button[data-view="${view}"]`).click();}
async function settings(page){await page.locator('.profile-button').click();}
async function parents(page){await settings(page);await page.locator('[data-action=parent-gate]').click();const label=await page.locator('#adult-answer').getAttribute('aria-label');const nums=label.match(/\d+/g).map(Number);await page.locator('#adult-answer').fill(String(nums[0]+nums[1]));await page.getByRole('button',{name:'Open grown-up corner'}).click();}
async function state(page){return page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)),KEY);}
async function answer(page){const id=await page.locator('#question-title').getAttribute('data-question-id');return page.evaluate(id=>window.GALAXY_CONTENT.questions.find(q=>q.id===id).answer,id);}

test('all content: valid choices, unique IDs, all original narration available',async({page})=>{
 await open(page);const report=await page.evaluate(()=>{const c=GALAXY_CONTENT,qs=c.questions,pack=GALAXY_VOICE_PACK.clips,norm=GalaxyNarrator.normalize;return {count:qs.length,duplicates:qs.length-new Set(qs.map(q=>q.id)).size,invalid:qs.filter(q=>!q.choices.includes(q.answer)||new Set(q.choices).size!==q.choices.length).map(q=>q.id),missing:qs.flatMap(q=>[q.spoken||q.prompt,q.hint,q.explanation].filter(t=>!pack[q.lang+'|'+norm(t)]).map(t=>q.id+':'+t))};});expect(report.count).toBeGreaterThan(60);expect(report.duplicates).toBe(0);expect(report.invalid).toEqual([]);expect(report.missing).toEqual([]);
});

for(const world of ['letters','numbers','arabic','discovery'])test(`${world}: lesson, wrong answer, hint, full mission, saved learning`,async({page})=>{
 await open(page);await nav(page,'worlds');await page.locator(`[data-world=${world}]`).click();await expect(page.locator('.lesson-model')).toBeVisible();await page.locator('[data-action=model]').click();await page.locator('[data-action=quiz-world]').click();
 for(let i=0;i<4;i++){
  const correct=await answer(page);
  if(i===0){const wrong=page.locator('[data-answer]').filter({hasNotText:'unlikely-placeholder'});const values=await wrong.evaluateAll(bs=>bs.map(b=>b.dataset.answer));await page.locator('[data-answer]').evaluateAll((bs,a)=>bs.find(b=>b.dataset.answer===a).click(),values.find(v=>v!==correct));await page.locator('[data-action=hint]').click();}
  await page.locator('[data-answer]').evaluateAll((bs,a)=>bs.find(b=>b.dataset.answer===a).click(),correct);
  await expect(page.locator('#question-feedback')).toHaveClass(/success/);await page.locator('[data-action=next-question]').click();
 }
 await expect(page.locator('.result-panel')).toBeVisible();const s=await state(page);expect(s.stats.completed).toBe(4);expect(s.stats.independent).toBe(3);expect(s.stats.stardust).toBe(20);await page.reload();expect((await state(page)).stats.completed).toBe(4);
});

test('mixed mission, partial exit, collection and parent report',async({page})=>{
 await open(page);await page.locator('[data-action=start-mixed]').click();await page.locator('[data-action=hint]').click();await page.locator('[data-action=leave-quiz]').click();await nav(page,'collection');await expect(page.locator('.badge')).toHaveCount(6);await parents(page);await expect(page.locator('.parent-stats')).toContainText('Items attempted');expect((await state(page)).stats.attempted).toBe(1);expect((await state(page)).sessions[0].completed).toBe(0);
});

test('adaptive practice requires breadth; repeated single answer cannot raise level',async({page})=>{
 await open(page);await page.evaluate(KEY=>{const s=JSON.parse(localStorage.getItem(KEY));const q=GALAXY_CONTENT.questions.find(q=>q.world==='arabic'&&q.level===1);s.history={[q.id]:{world:'arabic',attempted:30,completed:30,independent:30,hints:0,last:Date.now()}};localStorage.setItem(KEY,JSON.stringify(s));},KEY);await page.reload();await nav(page,'worlds');await page.locator('[data-world=arabic]').click();await page.locator('[data-action=quiz-world]').click();for(let i=0;i<4;i++){const id=await page.locator('#question-title').getAttribute('data-question-id');const q=await page.evaluate(id=>GALAXY_CONTENT.questions.find(q=>q.id===id),id);expect(q.level).toBe(1);await page.locator('[data-answer]').evaluateAll((bs,a)=>bs.find(b=>b.dataset.answer===a).click(),q.answer);await page.locator('[data-action=next-question]').click();}
});

test('word builder: incomplete, reveal, remove tile, correct, next',async({page})=>{
 await open(page);await nav(page,'studio');await page.locator('[data-action=word-check]').click();await expect(page.locator('#word-feedback')).toContainText('every space');await page.locator('[data-action=word-hint]').click();const word=await page.locator('#studio-word').textContent();
 for(const c of word)await page.locator(`[data-tile]:not(:disabled)`).filter({hasText:new RegExp('^'+c+'$')}).first().click();
 await page.locator('[data-slot="2"]').click();await page.locator('[data-tile]:not(:disabled)').filter({hasText:new RegExp('^'+word[2]+'$')}).first().click();await page.locator('[data-action=word-check]').click();await expect(page.locator('#word-feedback')).toContainText('You built');expect((await state(page)).stats.independent).toBe(0);await page.locator('[data-action=word-next]').click();await expect(page.locator('#studio-word')).not.toHaveText(word);
});

test('drawing tools, export, clear, switching back to builder',async({page})=>{
 await open(page);await nav(page,'studio');await page.locator('[data-action=studio-draw]').click();await page.locator('#draw-guide').selectOption('ب');await page.getByRole('button',{name:'Mint brush'}).click();const canvas=page.locator('#drawing'),b=await canvas.boundingBox();await page.mouse.move(b.x+30,b.y+30);await page.mouse.down();await page.mouse.move(b.x+100,b.y+100);await page.mouse.up();
 const file=page.waitForEvent('download');await page.locator('[data-action=draw-save]').click();expect((await file).suggestedFilename()).toMatch(/png$/);await page.locator('[data-action=draw-clear]').click();await page.locator('[data-action=studio-build]').click();await expect(page.locator('[data-action=word-check]')).toBeVisible();
});

test('settings persist, parent gate rejects, progress export and reset',async({page})=>{
 await open(page);await settings(page);await page.locator('[data-setting=name]').fill('Little Explorer');await page.locator('[data-setting=contrast]').check();await page.locator('[data-setting=largeText]').check();await page.locator('[data-setting=length]').selectOption('8');await page.locator('[data-action=parent-gate]').click();await page.locator('#adult-answer').fill('0');await page.getByRole('button',{name:'Open grown-up corner'}).click();await expect(page.locator('.parent-stats')).toHaveCount(0);await parents(page);
 const file=page.waitForEvent('download');await page.locator('[data-action=export-progress]').click();expect((await file).suggestedFilename()).toMatch(/json$/);await page.locator('[data-action=reset-progress]').click();await page.getByRole('button',{name:'Keep my progress'}).click();await page.locator('[data-action=reset-progress]').click();await page.getByRole('button',{name:'Reset progress',exact:true}).click();await page.reload();expect((await state(page)).settings.name).toBe('Little Explorer');expect((await state(page)).settings.contrast).toBe(true);
});

test('Orbit Flight: selection, hint, pause, complete and reward',async({page})=>{
 await open(page,{motion:false});await nav(page,'journey');await page.locator('[data-action=start-orbit]').click();await page.locator('[data-orbit=pause]').click();await expect(page.locator('.orbit-pause-screen')).toHaveClass(/visible/);await page.locator('[data-orbit=resume]').click();
 for(let i=0;i<4;i++){const id=await page.locator('.orbit-question').getAttribute('data-question-id');const a=await page.evaluate(id=>GALAXY_CONTENT.questions.find(q=>q.id===id).answer,id);if(i===0)await page.locator('[data-orbit=hint]').click();await page.locator('[data-lane]').evaluateAll((bs,a)=>bs.find(b=>b.querySelector('span').textContent===a).click(),a);await page.locator('[data-orbit=collect]').click();await page.locator('[data-orbit=next]').click();}
 await expect(page.locator('.result-panel')).toBeVisible();expect((await state(page)).stats.flights).toBe(1);expect((await state(page)).stats.independent).toBe(3);
});

test('runner calm mode: retries, pause, full trail, separate rewards, replay',async({page})=>{
 await open(page,{motion:false});await nav(page,'journey');await page.locator('[data-action=start-runner]').click();await page.locator('[data-run=start]').click();await page.locator('[data-run=duck]').click();await expect(page.locator('.runner-message')).toContainText('Collect');await page.locator('[data-run=pause]').click();await expect(page.locator('[data-run=jump]')).toBeDisabled();await page.locator('[data-run=resume]').click();
 for(const kind of ['collect','jump','collect','duck','collect','jump','duck','collect','collect','jump','duck','collect'])await page.locator(`[data-run=${kind}]`).click();
 await expect(page.locator('.runner-overlay')).toContainText('6 coins');const s=await state(page);expect(s.stats.runs).toBe(1);expect(s.stats.runCoins).toBe(6);expect(s.stats.completed).toBe(0);expect(s.stats.stardust).toBe(0);await page.locator('[data-run=start]').click();await expect(page.locator('#runner-coins')).toHaveText('0');await page.locator('.runner-heading [data-run=exit]').click();await expect(page.locator('[data-action=start-runner]')).toBeVisible();
});

test('runner animated controls, Arabic captions, background pause, navigation cleanup',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page,{motion:true});await nav(page,'journey');await page.locator('[data-action=start-runner]').click();await page.locator('#runner-language').selectOption('ar');await page.locator('[data-run=start]').click();await page.locator('[data-run=jump]').click();await expect(page.locator('.runner-message')).toHaveAttribute('lang','ar');await page.waitForTimeout(950);await page.locator('[data-run=duck]').click();await expect(page.locator('.runner-message')).toHaveAttribute('dir','rtl');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect(page.locator('[data-run=resume]')).toBeVisible();await nav(page,'home');await page.keyboard.press('ArrowUp');expect(errors).toEqual([]);
});

test('Quran selection, repeat and offline recitation error remain readable',async({page})=>{
 await open(page);await page.route('https://everyayah.com/**',route=>route.abort());await nav(page,'garden');const tabs=page.locator('[data-surah]');for(let i=0;i<await tabs.count();i++){await tabs.nth(i).click();await expect(page.locator('.verse')).not.toHaveCount(0);}await page.locator('#verse-repeat').selectOption('3');await page.locator('[data-action=recite-all]').click();await expect(page.locator('#recite-status')).toContainText('could not load');await page.locator('[data-action=recite-stop]').click();await expect(page.locator('#recite-status')).toContainText('Paused');
});

test('human recording import, persisted priority, preview, export, remove, invalid file',async({page})=>{
 await open(page);await parents(page);await expect(page.locator('.voice-library-status')).toContainText('0 of');const data=await page.evaluate(()=>{const k=GalaxyVoiceLibrary.lines().find(k=>k.startsWith('ar|'));return {k,v:GALAXY_VOICE_PACK.clips[k]};});
 await page.locator('[data-library-file=pack]').setInputFiles({name:'test-pack.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,clips:{[data.k]:data.v}}))});await expect(page.locator('.voice-library-status')).toContainText('1 of');await page.locator('[data-library=preview]').click();await page.locator('[data-library=stop]').click();await page.reload();await parents(page);await expect(page.locator('.voice-library-status')).toContainText('1 of');const file=page.waitForEvent('download');await page.locator('[data-library=export]').click();expect((await file).suggestedFilename()).toContain('recordings');await page.locator('[data-library=remove]').click();await expect(page.locator('.voice-library-status')).toContainText('0 of');await page.locator('[data-library-file=pack]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(page.locator('.voice-library-status')).toContainText('not a valid');
});

test('real embedded Arabic and English playback without browser voices, stop and mute',async({page})=>{
 await open(page,{voice:true});await settings(page);await page.locator('[data-setting=voiceSource]').selectOption('pack');await page.evaluate(()=>{window.speechSynthesis.getVoices=()=>[];});
 for(const lang of ['ar','en']){await page.locator(`[data-action=test-${lang}]`).click();await expect(page.locator('#narration-status')).toContainText('speaking');await expect(page.locator('#narration-status')).toContainText('Ready',{timeout:25000});}
 await page.locator('[data-action=test-ar]').click();await page.locator('[data-action=stop-voice]').click();await expect(page.locator('#narration-status')).toContainText('Ready');await page.locator('#quick-sound').click();await page.locator('[data-action=test-ar]').click();await expect(page.locator('#narration-status')).toContainText('Ready');await expect(page.locator('#quick-sound')).toHaveAttribute('aria-pressed','true');
});

test('offline reload, mobile layout, keyboard focus and no console errors',async({page,context})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await context.setOffline(true);await page.reload();await expect(page.locator('.welcome')).toBeVisible();for(const view of ['worlds','journey','studio','garden','collection']){await nav(page,view);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}await settings(page);await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement!==document.body)).toBe(true);expect(errors).toEqual([]);
});
