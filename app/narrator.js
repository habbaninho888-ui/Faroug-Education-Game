
/* A single narration channel for recorded clips and device speech.
   Core priorities: keep complete phrases intact, retain native utterances,
   wait for asynchronous voice discovery, and invalidate stale callbacks. */
(() => {
  'use strict';
  const normalize = text => String(text ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const languageTag = value => String(value || 'en').replace(/_/g, '-').toLowerCase();
  const language = value => languageTag(value).split('-')[0];
  const labels = {en: 'English', ar: 'Arabic'};
  const WAIT_MS = 1800;
  const CANCEL_GAP_MS = 80;

  function validatePack(input) {
    if (!input || input.version !== 1 || !input.clips || typeof input.clips !== 'object' || Array.isArray(input.clips)) {
      return {ok: false, error: 'Choose a version 1 voice pack with a clips map.'};
    }
    const entries = Object.entries(input.clips);
    if (!entries.length || entries.length > 10000) return {ok: false, error: 'The voice pack is empty or too large.'};
    const clips = Object.create(null);
    for (const [key, value] of entries) {
      const divider = key.indexOf('|');
      if (divider < 1 || typeof value !== 'string' || !/^data:audio\/(?:mpeg|mp3|wav|wave|x-wav|ogg|webm|mp4|x-m4a)(?:;[^,]*)?;base64,[A-Za-z0-9+/=\s]+$/i.test(value)) {
        return {ok: false, error: 'Voice clips must be embedded audio data, indexed by language and text.'};
      }
      const lang = language(key.slice(0, divider)), text = normalize(key.slice(divider + 1));
      if (!['en', 'ar'].includes(lang) || !text) return {ok: false, error: 'A clip has an unsupported language or empty text.'};
      clips[`${lang}|${text}`] = value;
    }
    return {ok: true, pack: {version: 1, provider: String(input.provider || ''), label: String(input.label || 'Recorded narration'),
      voices: {en: String(input.voices?.en || 'Recorded English'), ar: String(input.voices?.ar || 'Recorded Arabic')}, clips}, count: Object.keys(clips).length};
  }

  function create({settings = () => ({}), onStatus = () => {}, onSpeaking = () => {}} = {}) {
    const synth = window.speechSynthesis;
    let voices = [], pack = null, active = null, pending = null, serial = 0, epoch = 0, disposed = false;
    let lastCancel = -Infinity, discovered = false, clipPlayer = null, unlockGeneration = 0;
    const warned = new Set(), waiters = new Set(), timers = new Set();
    const currentSettings = () => settings() || {};
    const enabled = () => {const s = currentSettings(); return !disposed && !s.mute && s.voice !== false && Number(s.voiceVolume ?? 1) > 0;};
    const current = job => !disposed && active === job && job.epoch === epoch && !job.finished;
    const schedule = (fn, ms) => {
      const timer = setTimeout(() => {timers.delete(timer); fn();}, ms);
      timers.add(timer);
      return timer;
    };
    const cancelTimer = timer => {if (timer != null) {clearTimeout(timer); timers.delete(timer);}};
    const notice = (key, message) => {if (!warned.has(key)) {warned.add(key); onStatus(message);}};
    const matches = lang => voices.filter(v => language(v.lang) === lang);

    function refreshVoices() {
      if (disposed) return [];
      try {voices = synth?.getVoices?.() || [];} catch {voices = [];}
      discovered ||= voices.length > 0;
      for (const lang of ['en', 'ar']) if (matches(lang).length) warned.delete(`missing-${lang}`);
      for (const waiter of [...waiters]) if (waiter.predicate(voices)) waiter.resolve(voices);
      return [...voices];
    }

    function waitForVoices(predicate) {
      refreshVoices();
      if (disposed || predicate(voices) || !synth?.getVoices) return {promise: Promise.resolve([...voices]), cancel() {}};
      let poll, timeout, done = false;
      let resolvePromise;
      const promise = new Promise(resolve => {resolvePromise = resolve;});
      const waiter = {predicate, resolve(value) {
        if (done) return;
        done = true;
        cancelTimer(poll); cancelTimer(timeout); waiters.delete(waiter);
        resolvePromise([...value]);
      }};
      waiters.add(waiter);
      const check = () => {
        if (done) return;
        refreshVoices();
        if (!done) poll = schedule(check, 100);
      };
      poll = schedule(check, 100);
      timeout = schedule(() => {discovered = true; waiter.resolve(voices);}, WAIT_MS);
      return {promise, cancel: () => waiter.resolve([])};
    }

    function chooseVoice(lang) {
      const list = matches(lang), selected = currentSettings()[lang === 'ar' ? 'voiceAR' : 'voiceEN'];
      const exact = list.find(v => v.voiceURI === selected || v.name === selected);
      if (exact) return exact;
      const score = v => {
        const name = String(v.name || '');
        let n = /natural|neural/i.test(name) ? 100 : /premium|enhanced/i.test(name) ? 85 : 0;
        if (/online/i.test(name) || v.localService === false) n += 25;
        if (/google/i.test(name)) n += 20;
        if (languageTag(v.lang) === (lang === 'ar' ? 'ar-sa' : 'en-us')) n += 6;
        if (v.default) n += 1;
        return n;
      };
      return list.slice().sort((a, b) => score(b) - score(a))[0];
    }

    function speaking(job, value) {
      if (!current(job) || job.speaking === value) return;
      job.speaking = value;
      onSpeaking(value);
    }

    function clean(job) {
      job.wait?.cancel(); job.wait = null;
      cancelTimer(job.delay); cancelTimer(job.watchdog);
      if (job.audio) {
        job.audio.onended = job.audio.onerror = job.audio.onplaying = null;
      }
      if (job.utterance) {
        job.utterance.onstart = job.utterance.onend = job.utterance.onerror = null;
      }
    }

    function finish(job, success) {
      if (!current(job)) return;
      clean(job);
      speaking(job, false);
      job.finished = true;
      job.resolve(success);
      active = null;
      const next = pending; pending = null;
      if (next) {
        // Start outside the previous native end callback. Never cancel a healthy phrase.
        active = next;
        next.delay = schedule(() => start(next), 20);
      }
    }

    function playClip(job, source) {
      if (!current(job) || !enabled()) {finish(job, false); return;}
      if (typeof window.Audio !== 'function') {
        notice(`clip-api-${job.lang}`, 'Recorded narration is not supported in this browser. Try a current browser or choose a device voice.');
        finish(job, false); return;
      }
      try {
        const player = clipPlayer ||= new window.Audio();
        unlockGeneration++;
        try {player.pause();} catch {}
        job.audio = player; // Strong reference, including while play() is pending.
        player.preload = 'auto'; player.src = source;
        player.muted = false;
        player.volume = Math.max(0, Math.min(1, Number(currentSettings().voiceVolume ?? .8)));
        // Rendered at a natural pace; optional practice slowing preserves pitch.
        player.playbackRate = Math.max(.65, Math.min(1.3, Number(currentSettings().rate ?? 1)));
        player.preservesPitch = true;
        player.onplaying = () => speaking(job, true);
        job.watchdog = schedule(() => {if(current(job)){player.pause();finish(job,false);}}, 60000);
        player.onended = () => finish(job, true);
        const fail = error => {
          if (!current(job)) return;
          const blocked = error?.name === 'NotAllowedError';
          notice(`clip-play-${job.lang}${blocked ? '-blocked' : ''}`, blocked ? 'Tap Hear to enable narration in this browser.' : `${labels[job.lang] || job.lang} recorded narration could not play. Tap Hear again, or choose a device voice in Settings.`);
          finish(job, false);
        };
        player.onerror = fail;
        speaking(job, true);
        const playing = player.play();
        if (playing?.catch) playing.catch(fail);
      } catch {
        if (current(job)) {notice(`clip-play-${job.lang}`, 'The recorded narration could not start. Tap Hear again.'); finish(job, false);}
      }
    }

    function playNative(job, voice) {
      if (!current(job) || !enabled()) {finish(job, false); return;}
      const delay = Math.max(0, CANCEL_GAP_MS - (Date.now() - lastCancel));
      if (delay > 0) {job.delay = schedule(() => playNative(job, voice), delay); return;}
      try {
        const u = new window.SpeechSynthesisUtterance(job.text);
        job.utterance = u; // Some browsers lose unreferenced utterances before completion.
        u.voice = voice;
        u.lang = String(voice.lang || job.lang).replace(/_/g, '-');
        u.rate = Math.max(.5, Math.min(1.5, Number(currentSettings().rate ?? 1)));
        u.pitch = 1;
        u.volume = Math.max(0, Math.min(1, Number(currentSettings().voiceVolume ?? .8)));
        u.onstart = () => speaking(job, true);
        u.onend = () => finish(job, true);
        u.onerror = event => {
          if (!current(job)) return;
          if (!['canceled', 'interrupted'].includes(event.error)) {
            notice(`native-play-${job.lang}`, `${labels[job.lang] || job.lang} device narration could not play. Try the recorded voice pack, or tap Hear again.`);
          }
          finish(job, false);
        };
        if (synth.paused && synth.resume) synth.resume();
        speaking(job, true);
        // A failed browser engine should not retain the channel forever.
        job.watchdog = schedule(() => {
          if (!current(job)) return;
          try {synth.cancel(); lastCancel = Date.now();} catch {}
          notice(`native-stalled-${job.lang}`, 'Device speech stopped responding. Tap Hear again, or use the recorded voice pack.');
          finish(job, false);
        }, Math.min(45000, Math.max(12000, job.text.length * 130 / u.rate + 6000)));
        synth.speak(u);
      } catch {
        if (current(job)) {notice(`native-play-${job.lang}`, 'Device narration could not start. Try another voice in Settings.'); finish(job, false);}
      }
    }

    async function start(job) {
      if (!current(job)) return;
      if (!enabled()) {finish(job, false); return;}
      await window.GalaxyVoiceLibrary?.ready;
      if (!current(job) || !enabled()) {finish(job, false); return;}
      const s = currentSettings();
      if (s.voiceSource !== 'device') {
        const recording = window.GalaxyVoiceLibrary?.get(job.lang, job.text);
        if (recording) {playClip(job, recording); return;}
        if (s.voiceSource === 'best' && job.lang === 'ar') {
          refreshVoices();
          const enhanced = matches(job.lang).filter(v => v.localService && /natural|neural|premium|enhanced/i.test(v.name))[0];
          if (enhanced) {playNative(job, enhanced); return;}
        }
      }
      const usePack = pack && s.voiceSource !== 'device';
      if (usePack) {
        const clip = pack.clips[`${job.lang}|${job.text}`];
        if (clip) {playClip(job, clip); return;}
        if (!job.quiet) notice(`clip-missing-${job.lang}`, `The voice pack does not include this ${labels[job.lang] || job.lang} phrase. Read it on screen, or select a device voice in Settings.`);
        if (!job.quiet || !chooseVoice(job.lang)) {finish(job, false); return;}
      }
      if (!synth?.speak || typeof window.SpeechSynthesisUtterance !== 'function') {
        notice(`missing-${job.lang}`, 'This browser has no device narration. Use the recorded voice pack or read the directions on screen.');
        finish(job, false); return;
      }
      refreshVoices();
      let voice = chooseVoice(job.lang);
      if (!voice) {
        job.wait = waitForVoices(() => matches(job.lang).length > 0);
        await job.wait.promise;
        if (!current(job)) return;
        job.wait = null;
        voice = chooseVoice(job.lang);
      }
      if (!voice) {
        notice(`missing-${job.lang}`, `No ${labels[job.lang] || job.lang} voice is available on this device. Use the recorded voice pack, or add a device voice in language settings.`);
        finish(job, false); return;
      }
      playNative(job, voice);
    }

    function stop() {
      epoch++; unlockGeneration++;
      if (pending) {pending.finished = true; pending.resolve(false); pending = null;}
      const old = active;
      active = null;
      if (old) {
        clean(old);
        old.finished = true;
        old.resolve(false);
        
      }
      if (clipPlayer) {
        try {clipPlayer.pause(); clipPlayer.removeAttribute('src'); clipPlayer.load();} catch {}
      }
      if (synth && (old?.utterance || synth.speaking || synth.pending)) {
        try {synth.cancel(); lastCancel = Date.now();} catch {}
      }
      onSpeaking(false);
    }

    function speak(text, lang = 'en', options = {}) {
      const cleaned = normalize(text), normalizedLang = language(lang);
      if (!cleaned || !enabled()) return Promise.resolve(false);
      if (options.interrupt) stop();
      // Duplicate automatic cues do not interrupt or echo a phrase already in flight.
      if (!options.interrupt && active?.text === cleaned && active.lang === normalizedLang) return active.promise;
      let resolve;
      const promise = new Promise(done => {resolve = done;});
      const job = {id: ++serial, epoch, text: cleaned, lang: normalizedLang, resolve, promise, finished: false, speaking: false, quiet: !!options.quiet};
      if (active) {
        if (pending) {pending.finished = true; pending.resolve(false);}
        pending = job; // Latest automatic feedback only; no stale spoken backlog.
      } else {
        active = job;
        start(job);
      }
      return promise;
    }

    function unlock() {
      if (disposed || active?.audio || !pack || typeof window.Audio !== 'function') return Promise.resolve(false);
      const source = Object.values(pack.clips)[0];
      if (!source) return Promise.resolve(false);
      try {
        const player = clipPlayer ||= new window.Audio(), token = ++unlockGeneration;
        player.muted = true; player.volume = 0; player.preload = 'auto'; player.src = source;
        const playing = player.play();
        return Promise.resolve(playing).then(() => {
          if (token === unlockGeneration && !active?.audio) {
            player.pause(); player.muted = false;
            try {player.currentTime = 0;} catch {}
            player.volume = Math.max(0, Math.min(1, Number(currentSettings().voiceVolume ?? .8)));
          }
          return true;
        }, () => false);
      } catch {return Promise.resolve(false);}
    }

    function setPack(input) {
      const result = validatePack(input);
      if (!result.ok) return result;
      stop(); pack = result.pack;
      for (const key of [...warned]) if (key.startsWith('clip-')) warned.delete(key);
      return {ok: true, count: result.count, label: pack.label};
    }

    function getStatus(lang = 'en') {
      const normalizedLang = language(lang), usePack = pack && currentSettings().voiceSource !== 'device';
      if (usePack) {
        const count = Object.keys(pack.clips).filter(k => k.startsWith(`${normalizedLang}|`)).length;
        return {source: 'pack', available: count > 0, voice: pack.voices[normalizedLang] || pack.label, label: pack.label, clips: count, loading: false};
      }
      const v = chooseVoice(normalizedLang);
      return {source: 'device', available: !!v, voice: v?.name || '', clips: 0, loading: !discovered};
    }

    const onVoicesChanged = () => refreshVoices();
    synth?.addEventListener?.('voiceschanged', onVoicesChanged);
    refreshVoices();
    if (window.GALAXY_VOICE_PACK) {
      const result = validatePack(window.GALAXY_VOICE_PACK);
      if (result.ok) pack = result.pack;
    }
    return {
      speak, stop, unlock, refreshVoices, getVoices: () => refreshVoices(),
      ready: () => waitForVoices(list => list.length > 0).promise,
      setPack, getStatus,
      dispose() {
        if (disposed) return;
        stop(); disposed = true;
        for (const waiter of [...waiters]) waiter.resolve([]);
        for (const timer of [...timers]) cancelTimer(timer);
        synth?.removeEventListener?.('voiceschanged', onVoicesChanged);
      }
    };
  }
  window.GalaxyNarrator = {create, normalize, languageTag, validatePack};
})();

