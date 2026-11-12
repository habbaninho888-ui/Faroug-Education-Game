/* Parent-supplied recordings stay on this device. No recording or upload service. */
(() => {
  'use strict';
  let clips = Object.create(null), db;
  const normal = window.GalaxyNarrator.normalize;
  const key = (lang, text) => `${lang.split('-')[0]}|${normal(text)}`;
  const ready = new Promise(resolve => {
    try {
      const request = indexedDB.open('galaxy-family-voices', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('recordings');
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        db = request.result;
        const get = db.transaction('recordings').objectStore('recordings').get('clips');
        get.onsuccess = () => {clips = get.result || Object.create(null); resolve(true);};
        get.onerror = () => resolve(false);
      };
    } catch {resolve(false);}
  });
  async function replace(next) {
    await ready;
    if (!db) throw new Error('This browser cannot save recordings. Use a regular browser window or the mobile app.');
    await new Promise((resolve, reject) => {
      const tx = db.transaction('recordings', 'readwrite');
      tx.objectStore('recordings').put(next, 'clips');
      tx.oncomplete = resolve;tx.onerror = tx.onabort = () => reject(new Error('Could not save recordings. Check device storage.'));
    });
    clips = next;
  }
  function lines() {
    return [...new Set([...Object.keys(window.GALAXY_VOICE_PACK.clips), ...(window.GALAXY_RUNNER_LINES || [])])];
  }
  async function importPack(file) {
    if (!file || file.size > 50*1024*1024) throw new Error('Choose a voice pack smaller than 50 MB.');
    let input;try {input=JSON.parse(await file.text());} catch {throw new Error('This file is not a valid JSON voice pack.');}
    const result = window.GalaxyNarrator.validatePack(input);
    if (!result.ok) throw new Error(result.error);
    const allowed = new Set(lines()), next = {...clips};let count = 0;
    for(const [k,v] of Object.entries(result.pack.clips)) {
      if (!allowed.has(k)) throw new Error('A recording does not match a phrase in this edition. Export the script first.');
      if (v.length > 7*1024*1024) throw new Error('Each phrase must be smaller than 5 MB.');
      next[k] = v;count++;
    }
    if (JSON.stringify(next).length > 70*1024*1024) throw new Error('The combined voice library is too large. Remove old recordings first.');
    await replace(next);return count;
  }
  const api = window.GalaxyVoiceLibrary = {ready, get: (lang,text) => clips[key(lang,text)], count: () => Object.keys(clips).length, importPack, lines};
  api.mount = (container, {download, stopSpeech, settings}) => {
    const entries = lines().filter(k=>k.startsWith('ar|')), options = entries.map((k,i)=>`<option value="${i}">Arabic phrase ${i+1}</option>`).join('');
    container.innerHTML = `<h2>A familiar Arabic voice</h2><p>Use clear Modern Standard Arabic recorded by a grown-up or voice artist. Keep complete phrases warm and conversational, with a short pause between ideas. These recordings take priority in “Best available” mode.</p>
      <p class="inline-note">No human voice pack is included yet. Until you add recordings, the app uses an enhanced local voice when available, then the original synthesized clips. Preview pronunciation together.</p>
      <progress max="${entries.length}" value="0" aria-label="Recorded Arabic phrases"></progress><p class="voice-library-status" role="status"></p>
      <div class="voice-actions"><button class="btn btn-outline" data-library="script">Export narration script</button><button class="btn btn-outline" data-library="export">Export recordings</button></div>
      <label class="voice-file">Import a recorded voice pack (.json)<input type="file" accept="application/json,.json" data-library-file="pack"></label>
      <p>Or add one recording at a time. Record with your device’s voice recorder, then choose the audio file here. Files stay on this device.</p>
      <label class="field">Choose a phrase <select aria-label="Arabic recording phrase">${options}</select></label><p class="voice-script" lang="ar" dir="rtl"></p>
      <label class="voice-file">Add audio for this phrase (MP3, WAV, M4A, OGG or WebM; up to 5 MB)<input type="file" accept="audio/*" data-library-file="single"></label>
      <div class="voice-actions"><button class="btn btn-soft" data-library="preview" disabled>Preview recording</button><button class="btn btn-outline" data-library="stop">Stop preview</button><button class="btn btn-danger" data-library="remove" disabled>Remove this recording</button></div>
      <p class="report-note">Add only recordings you have permission to use. Export makes a portable backup; clearing app data deletes this library. Learning progress reset keeps recordings.</p>`;
    const $ = s => container.querySelector(s);let preview, disposed=false,busy=false;
    const selected = () => entries[Number($('select').value)];
    const status = text => {if(!disposed)$('.voice-library-status').textContent=text;};
    const stop = () => {if(preview){preview.pause();preview.removeAttribute('src');preview.load();preview=null;}};
    function update() {
      if(disposed)return;
      const count=entries.filter(k=>clips[k]).length;
      $('progress').value=count;status(`${count} of ${entries.length} Arabic phrases recorded. Unrecorded phrases use fallback narration.`);
      $('.voice-script').textContent=selected().slice(3);
      $('[data-library=preview]').disabled=!clips[selected()];$('[data-library=remove]').disabled=!clips[selected()];
    }
    $('select').onchange=()=>{stop();update();};
    container.onclick=async e=>{
      const action=e.target.closest('[data-library]')?.dataset.library;if(!action||busy)return;
      try {
        if(action==='script') await download('galaxy-narration-script.json',new Blob([JSON.stringify({language:'Modern Standard Arabic',instructions:'Record complete phrases naturally. Preserve letter names, vowel marks and intended meaning. Have an Arabic educator review recordings before use.',phrases:lines().map(k=>({key:k,text:k.slice(k.indexOf('|')+1)}))},null,2)],{type:'application/json'}));
        if(action==='export') await download('galaxy-family-recordings.json',new Blob([JSON.stringify({version:1,label:'Family recordings',clips},null,2)],{type:'application/json'}));
        if(action==='preview'){stop();stopSpeech();const s=settings();if(s.mute||s.voiceVolume===0){status('Unmute audio and raise voice volume to preview.');return;}preview=new Audio(clips[selected()]);preview.volume=s.voiceVolume;await preview.play();}
        if(action==='stop')stop();
        if(action==='remove'){busy=true;stop();stopSpeech();const next={...clips};delete next[selected()];await replace(next);update();}
      } catch(err){status(err.message);} finally{busy=false;}
    };
    container.onchange=async e=>{
      const type=e.target.dataset.libraryFile,file=e.target.files?.[0];if(!type||!file||busy)return;
      busy=true;const target=selected();e.target.disabled=true;stop();stopSpeech();
      try {
        if(type==='pack')await importPack(file);
        else {
          if(file.size>5*1024*1024)throw new Error('Choose an audio clip smaller than 5 MB.');
          const mime = file.type || (/\.m4a$/i.test(file.name)?'audio/mp4':/\.mp3$/i.test(file.name)?'audio/mpeg':'');
          if(!/^audio\/(mpeg|mp3|wav|wave|x-wav|ogg|webm|mp4|x-m4a)$/i.test(mime))throw new Error('Choose an MP3, WAV, M4A, OGG or WebM audio recording.');
          const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read this file.'));r.readAsDataURL(new Blob([file],{type:mime}));});
          await importPack(new File([JSON.stringify({version:1,clips:{[target]:data}})],'recording.json'));
        }
        update();
      } catch(err){status(err.message);} finally{busy=false;e.target.value='';e.target.disabled=false;}
    };
    function visibility(){if(document.hidden)stop();}
    document.addEventListener('visibilitychange',visibility);window.addEventListener('galaxy-background',stop);window.addEventListener('galaxy-mute',stop);
    ready.then(update);
    return () => {disposed=true;stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('galaxy-background',stop);window.removeEventListener('galaxy-mute',stop);};
  };
})();
