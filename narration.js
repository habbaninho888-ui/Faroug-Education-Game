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
  const CLIP_START_MS = 8000;
  const CLIP_MIN_FINISH_MS = 15000;
  const CLIP_MAX_FINISH_MS = 90000;

  function validatePack(input) {
    if (!input || input.version !== 1 || !input.clips || typeof input.clips !== 'object' || Array.isArray(input.clips)) {
      return {ok: false, error: 'Choose a version 1 voice pack with a clips map.'};
    }
    const entries = Object.entries(input.clips);
    if (!entries.length || entries.length > 10000) return {ok: false, error: 'The voice pack is empty or too large.'};
    const clips = Object.create(null);
    for (const [key, value] of entries) {
      const divider = key.indexOf('|');
      if (divider < 1 || typeof value !== 'string' || !/^data:audio\/(?:mpeg|mp3|wav|wave|x-wav|ogg|webm)(?:;[^,]*)?;base64,[A-Za-z0-9+/=\s]+$/i.test(value)) {
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
    const warned = new Set(), waiters = new Set(), timers = new Set(), nativeFailures = new Map();
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
    const voiceIdentity = voice => voice?.voiceURI || voice?.name || voice?.lang || '';

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
      cancelTimer(job.delay); cancelTimer(job.watchdog); cancelTimer(job.startWatchdog);
      if (job.audio) {
        job.audio.onended = job.audio.onerror = job.audio.onplaying = null;
        job.audio.onloadedmetadata = job.audio.ondurationchange = null;
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
        job.channel = 'clip';
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
        const fail = (error, timeoutMessage) => {
          if (!current(job)) return;
          const blocked = error?.name === 'NotAllowedError';
          const key = timeoutMessage ? `clip-timeout-${job.lang}` : `clip-play-${job.lang}${blocked ? '-blocked' : ''}`;
          notice(key, timeoutMessage || (blocked ? 'Tap Hear to enable narration in this browser.' : `${labels[job.lang] || job.lang} recorded narration could not play. Tap Hear again, or choose a device voice in Settings.`));
          try {player.pause();} catch {}
          finish(job, false);
        };
        const armCompletion = () => {
          if (!current(job) || !job.clipStarted) return;
          cancelTimer(job.watchdog);
          const duration = Number(player.duration), rate = player.playbackRate || 1;
          const expected = Number.isFinite(duration) && duration > 0 ? duration * 1000 / rate + 5000 : job.text.length * 130 / rate + 6000;
          // Measure from first playback; repeated metadata events cannot extend a clip forever.
          const budget = Math.min(CLIP_MAX_FINISH_MS, Math.max(CLIP_MIN_FINISH_MS, expected));
          const remaining = Math.max(0, budget - (Date.now() - job.clipStartedAt));
          job.watchdog = schedule(() => fail(null, `${labels[job.lang] || job.lang} narration stopped responding. Tap Hear to try the line again.`), remaining);
        };
        const started = () => {
          if (!current(job) || job.clipStarted) return;
          job.clipStarted = true; job.clipStartedAt = Date.now();
          cancelTimer(job.startWatchdog);
          speaking(job, true);
          armCompletion();
        };
        player.onplaying = started;
        player.onloadedmetadata = player.ondurationchange = armCompletion;
        player.onended = () => finish(job, true);
        player.onerror = fail;
        speaking(job, true);
        job.startWatchdog = schedule(() => fail(null, `${labels[job.lang] || job.lang} narration could not start. Tap Hear to try again.`), CLIP_START_MS);
        const playing = player.play();
        if (playing?.then) playing.then(started, fail);
      } catch {
        if (current(job)) {notice(`clip-play-${job.lang}`, 'The recorded narration could not start. Tap Hear again.'); finish(job, false);}
      }
    }

    function useDeviceFallback(job, reason = 'unavailable') {
      const clip = pack?.clips[`${job.lang}|${job.text}`];
      if (!clip || !current(job) || job.fallbackUsed) return false;
      job.fallbackUsed = true;
      if (reason === 'failed' && job.nativeVoice) nativeFailures.set(job.lang, voiceIdentity(job.nativeVoice));
      cancelTimer(job.watchdog); job.watchdog = null;
      if (job.utterance) {
        job.utterance.onstart = job.utterance.onend = job.utterance.onerror = null;
        try {synth?.cancel(); lastCancel = Date.now();} catch {}
      }
      const message = reason === 'failed' ? `${labels[job.lang] || job.lang} device narration could not play.` : `No ${labels[job.lang] || job.lang} device voice is available.`;
      notice(`device-fallback-${job.lang}`, `${message} Playing the included ${labels[job.lang] || job.lang} narration instead.`);
      playClip(job, clip);
      return true;
    }

    function playNative(job, voice) {
      if (!current(job) || !enabled()) {finish(job, false); return;}
      const delay = Math.max(0, CANCEL_GAP_MS - (Date.now() - lastCancel));
      if (delay > 0) {job.delay = schedule(() => playNative(job, voice), delay); return;}
      try {
        job.channel = 'native';
        const u = new window.SpeechSynthesisUtterance(job.text);
        job.utterance = u; // Some browsers lose unreferenced utterances before completion.
        job.nativeVoice = voice;
        u.voice = voice;
        u.lang = String(voice.lang || job.lang).replace(/_/g, '-');
        u.rate = Math.max(.5, Math.min(1.5, Number(currentSettings().rate ?? 1)));
        u.pitch = 1;
        u.volume = Math.max(0, Math.min(1, Number(currentSettings().voiceVolume ?? .8)));
        u.onstart = () => {if (job.channel === 'native') speaking(job, true);};
        u.onend = () => {if (job.channel === 'native') finish(job, true);};
        u.onerror = event => {
          if (!current(job) || job.channel !== 'native') return;
          if (useDeviceFallback(job, 'failed')) return;
          if (!['canceled', 'interrupted'].includes(event.error)) {
            notice(`native-play-${job.lang}`, `${labels[job.lang] || job.lang} device narration could not play. Try the recorded voice pack, or tap Hear again.`);
          }
          finish(job, false);
        };
        if (synth.paused && synth.resume) synth.resume();
        speaking(job, true);
        // A failed browser engine should not retain the channel forever.
        job.watchdog = schedule(() => {
          if (!current(job) || job.channel !== 'native') return;
          if (useDeviceFallback(job, 'failed')) return;
          try {synth.cancel(); lastCancel = Date.now();} catch {}
          notice(`native-stalled-${job.lang}`, 'Device speech stopped responding. Tap Hear again, or use the recorded voice pack.');
          finish(job, false);
        }, Math.min(45000, Math.max(12000, job.text.length * 130 / u.rate + 6000)));
        synth.speak(u);
      } catch {
        if (current(job) && job.channel === 'native') {
          if (useDeviceFallback(job, 'failed')) return;
          notice(`native-play-${job.lang}`, 'Device narration could not start. Try another voice in Settings.'); finish(job, false);
        }
      }
    }

    async function start(job) {
      if (!current(job)) return;
      if (!enabled()) {finish(job, false); return;}
      const s = currentSettings(), usePack = pack && s.voiceSource !== 'device';
      if (usePack) {
        const clip = pack.clips[`${job.lang}|${job.text}`];
        if (clip) {playClip(job, clip); return;}
        notice(`clip-missing-${job.lang}`, `The voice pack does not include this ${labels[job.lang] || job.lang} phrase. Read it on screen, or select a device voice in Settings.`);
        finish(job, false); return;
      }
      if (!synth?.speak || typeof window.SpeechSynthesisUtterance !== 'function') {
        if (useDeviceFallback(job)) return;
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
        if (useDeviceFallback(job)) return;
        notice(`missing-${job.lang}`, `No ${labels[job.lang] || job.lang} voice is available on this device. Use the recorded voice pack, or add a device voice in language settings.`);
        finish(job, false); return;
      }
      if (nativeFailures.get(job.lang) === voiceIdentity(voice)) {
        job.nativeVoice = voice;
        if (useDeviceFallback(job, 'failed')) return;
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
      if (options.interrupt) {
        stop();
        // A deliberate retry must show its own playback error instead of failing silently.
        for (const key of [...warned]) if (key.endsWith(`-${normalizedLang}`) || key.includes(`-${normalizedLang}-`)) warned.delete(key);
      }
      // Duplicate automatic cues do not interrupt or echo a phrase already in flight.
      if (!options.interrupt && active?.text === cleaned && active.lang === normalizedLang) return active.promise;
      let resolve;
      const promise = new Promise(done => {resolve = done;});
      const job = {id: ++serial, epoch, text: cleaned, lang: normalizedLang, resolve, promise, finished: false, speaking: false};
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
      const count = pack ? Object.keys(pack.clips).filter(k => k.startsWith(`${normalizedLang}|`)).length : 0;
      if (usePack) {
        return {source: 'pack', available: count > 0, voice: pack.voices[normalizedLang] || pack.label, label: pack.label, clips: count, loading: false, fallback: false};
      }
      const v = synth?.speak && typeof window.SpeechSynthesisUtterance === 'function' ? chooseVoice(normalizedLang) : undefined;
      const failed = v && nativeFailures.get(normalizedLang) === voiceIdentity(v);
      if ((!v || failed) && count > 0) {
        return {source: 'pack', requestedSource: 'device', fallback: true, available: true, voice: pack.voices[normalizedLang] || pack.label,
          fallbackReason: failed ? 'device-playback-failed' : 'device-voice-unavailable',
          label: `${pack.label} · ${labels[normalizedLang] || normalizedLang} device voice ${failed ? 'failed' : 'unavailable'}`, clips: count, loading: false};
      }
      return {source: 'device', available: !!v, voice: v?.name || '', clips: 0, loading: !discovered, fallback: false};
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
