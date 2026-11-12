"""Actual bundled-audio integration checks, without installed browser voices.

Serve the project, build the standalone edition, then run:
    python3 tests/narration-browser.py
Requires Python Playwright, Chromium, and ffmpeg. BASE_URL, CHROMIUM_PATH,
and SKIP_STANDALONE=1 may be supplied. Speech quality is not subjectively graded;
these tests verify real MP3 decoding/playback, coverage, serialization and controls.
"""
from array import array
import json
import os
from pathlib import Path
import random
import subprocess
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = os.environ.get('BASE_URL', 'http://127.0.0.1:8000')
KEY = 'faroug-galaxy-academy-v1'
PASS = []

INSTRUMENT = r'''(() => {
  window.__mediaLog = [];
  window.__audioPlayers = [];
  window.__nativeSpeechCalls = 0;
  if (window.speechSynthesis) {
    Object.defineProperty(window.speechSynthesis, 'getVoices', {value: () => [], configurable:true});
    Object.defineProperty(window.speechSynthesis, 'speak', {value: () => {
      window.__nativeSpeechCalls++;
      throw new Error('Native speech must not be used for bundled narration.');
    }, configurable:true});
  }
  const OriginalAudio = window.Audio;
  let serial = 0;
  const sourceKey = src => {
    const clips = window.GALAXY_VOICE_PACK?.clips || {};
    for (const key in clips) if (clips[key] === src) return key;
    return src ? 'other' : 'empty';
  };
  window.Audio = function(...args) {
    const a = new OriginalAudio(...args), id = ++serial;
    window.__audioPlayers.push(a);
    const log = event => window.__mediaLog.push({event, id, at:performance.now(), key:sourceKey(a.src),
      volume:a.volume, rate:a.playbackRate, time:a.currentTime, duration:Number.isFinite(a.duration)?a.duration:null});
    const play = a.play.bind(a), pause = a.pause.bind(a);
    a.play = () => {log('play-call');return play();};
    a.pause = () => {log('pause-call');return pause();};
    ['playing','ended','pause','error','loadedmetadata'].forEach(event => a.addEventListener(event, () => log(event)));
    return a;
  };
  window.Audio.prototype = OriginalAudio.prototype;
})();'''


def mark(message):
    PASS.append(message)
    print('PASS ' + message, flush=True)


def normalized(text):
    import unicodedata
    return ' '.join(unicodedata.normalize('NFKC', text).split())


def key(text, lang):
    return lang + '|' + normalized(text)


def logs(page):
    return page.evaluate('window.__mediaLog')


def reset_logs(page):
    page.evaluate('window.__mediaLog = []')


def wait_event(page, event, source, count=1, timeout=30000):
    page.wait_for_function('''([event,key,count]) => window.__mediaLog.filter(e =>
      e.event===event && e.key===key && e.volume>0).length >= count''', arg=[event, source, count], timeout=timeout)


def settings(page):
    page.locator('.profile-button').click()
    expect(page.locator('[data-setting=voiceSource]')).to_be_visible()


def assert_no_native(page):
    assert page.evaluate('window.__nativeSpeechCalls') == 0


def identify_question(page):
    return page.evaluate('''() => {
      const title=document.querySelector('#question-title').textContent;
      const visual=document.querySelector('.question-visual');
      const dots=visual.querySelector('.dots');
      const value=dots?dots.getAttribute('aria-label').split(' ')[0]:visual.textContent.trim();
      return GALAXY_CONTENT.questions.find(q=>q.prompt===title&&String(q.visual.value)===value);
    }''')


def verify_waveforms():
    corpus = json.loads((ROOT / 'voice-lines.json').read_text())
    # Every narrated line must have a produced audio file; actual PCM checks sample both languages.
    for line in corpus:
        p = ROOT / 'assets' / 'narration' / (line['id'] + '.mp3')
        assert p.is_file() and p.stat().st_size > 500, str(p)
    sample = random.Random(91)
    selected = []
    for lang in ('en', 'ar'):
        subset = [line for line in corpus if line['lang'] == lang]
        selected.extend(sample.sample(subset, min(5, len(subset))))
    for line in selected:
        p = ROOT / 'assets' / 'narration' / (line['id'] + '.mp3')
        decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-f', 'f32le', '-ac', '1', '-'],
                                 check=True, capture_output=True).stdout
        pcm = array('f'); pcm.frombytes(decoded)
        assert len(pcm) > 2000, (line['key'], len(pcm))
        assert max(abs(v) for v in pcm) > .01, line['key']
    mark(f'{len(corpus)} audio files present; ten English/Arabic MP3s decode to non-silent PCM')
    return corpus


def main():
    corpus = verify_waveforms()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
            args=['--no-sandbox','--disable-crash-reporter','--disable-breakpad'])
        context = browser.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce')
        context.add_init_script(INSTRUMENT)
        unexpected_requests = []
        source_host = urlparse(BASE_URL).netloc
        def block_external(route):
            if urlparse(route.request.url).netloc == source_host:
                route.continue_()
            else:
                unexpected_requests.append(route.request.url)
                route.abort()
        context.route('**/*', block_external)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE_URL, wait_until='networkidle')
        assert page.evaluate('speechSynthesis.getVoices().length') == 0
        pack_keys = page.evaluate('Object.keys(GALAXY_VOICE_PACK.clips)')
        assert set(pack_keys) == {line['key'] for line in corpus}
        mark('Every exact narrated game line is bundled; no installed browser voices are available')

        settings(page)
        expect(page.locator('[data-setting=voiceSource]')).to_have_value('pack')
        expect(page.locator('[data-setting=rate]')).to_have_value('1')
        for lang, action, text in [
            ('en', 'test-en', 'Hello, explorer! I’m Nova. Let’s make a little discovery together.'),
            ('ar', 'test-ar', 'مرحبًا يا صديقي. هيا نتعلم معًا.')]:
            reset_logs(page)
            page.locator(f'[data-action={action}]').click()
            source = key(text, lang)
            wait_event(page, 'playing', source)
            wait_event(page, 'ended', source)
            events = logs(page)
            assert not any(e['event'] == 'error' for e in events), events
            starts = [e for e in events if e['event'] == 'playing' and e['key'] == source and e['volume'] > 0]
            assert starts and all(e['rate'] == 1 for e in starts)
            assert_no_native(page)
        mark('Real English and Arabic previews start and finish at normal speed with no native speech')

        # Automatic narration should finish the question before explanatory feedback starts.
        page.locator('[data-view=home]').first.click()
        reset_logs(page)
        page.locator('[data-action=start-mixed]').click()
        q = identify_question(page)
        assert q
        prompt_key = key(q.get('spoken') or q['prompt'], q['lang'])
        explanation_key = key(q['explanation'], q['lang'])
        wait_event(page, 'playing', prompt_key)
        buttons = page.locator('.choice')
        good = next(buttons.nth(i) for i in range(buttons.count()) if buttons.nth(i).get_attribute('data-answer') == q['answer'])
        good.click()
        wait_event(page, 'ended', prompt_key)
        wait_event(page, 'playing', explanation_key)
        events = logs(page)
        first_start = next(i for i,e in enumerate(events) if e['event']=='playing' and e['key']==prompt_key and e['volume']>0)
        first_end = next(i for i,e in enumerate(events) if e['event']=='ended' and e['key']==prompt_key and e['volume']>0)
        feedback_start = next(i for i,e in enumerate(events) if e['event']=='playing' and e['key']==explanation_key and e['volume']>0)
        assert first_start < first_end < feedback_start, events
        assert not any(e['event']=='pause-call' and e['key']==prompt_key for e in events[first_start:first_end]), events
        mark('Automatic answer feedback waits for the full question instead of cutting it off')

        # A manual replay should deliberately stop the previous phrase and reuse one audio element.
        page.locator('[data-action=next-question]').click()
        q = identify_question(page); source = key(q.get('spoken') or q['prompt'], q['lang'])
        reset_logs(page)
        page.locator('[data-action=hear-question]').click()
        wait_event(page, 'playing', source)
        page.locator('[data-action=hear-question]').click()
        wait_event(page, 'playing', source, 2)
        events = logs(page)
        starts = [i for i,e in enumerate(events) if e['event']=='playing' and e['key']==source and e['volume']>0]
        assert any(e['event']=='pause-call' for e in events[starts[0]+1:starts[1]])
        assert len({e['id'] for e in events if e['key']==source and e['volume']>0}) == 1
        mark('Manual replay interrupts deliberately, with one persistent audio element and no overlap')

        page.locator('#quick-sound').click()
        stop_count = len(logs(page))
        page.wait_for_timeout(350)
        assert not any(e['event']=='playing' and e['volume']>0 for e in logs(page)[stop_count:])
        assert page.evaluate('window.__audioPlayers.every(a=>a.paused||a.ended)')
        page.locator('#quick-sound').click()
        reset_logs(page)
        page.locator('[data-action=hear-question]').click()
        wait_event(page, 'playing', source)
        page.locator('[data-view=home]').first.click()
        snapshot = logs(page)
        assert any(e['event']=='pause-call' and e['key']==source for e in snapshot)
        count = len(snapshot); page.wait_for_timeout(350)
        assert not any(e['event']=='playing' and e['volume']>0 for e in logs(page)[count:])
        mark('Master mute and navigation stop narration and discard pending lines')

        settings(page)
        reset_logs(page)
        page.locator('[data-action=test-ar]').click()
        ar_key = key('مرحبًا يا صديقي. هيا نتعلم معًا.', 'ar')
        wait_event(page, 'playing', ar_key)
        page.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
        snapshot=logs(page)
        assert any(e['event']=='pause-call' and e['key']==ar_key for e in snapshot)
        count=len(snapshot);page.wait_for_timeout(350)
        assert not any(e['event']=='playing' and e['volume']>0 for e in logs(page)[count:])
        page.evaluate("Object.defineProperty(document,'hidden',{value:false,configurable:true})")
        assert_no_native(page)
        assert not unexpected_requests, unexpected_requests
        assert not errors, errors
        mark('Backgrounding stops real Arabic audio; core narration makes no external requests or browser errors')

        # Controlled legacy fixture verifies upgrade migration without resetting learning data.
        old = {'version':1,'settings':{'name':'Existing explorer','rate':.86,'voice':True},
               'stats':{'stardust':35,'attempted':8,'completed':7,'independent':6,'flights':0,'words':1},
               'history':{},'sessions':[],'daily':{'date':'old','count':0}}
        page.evaluate('([key,state])=>localStorage.setItem(key,JSON.stringify(state))', [KEY,old])
        page.reload(wait_until='networkidle')
        settings(page)
        expect(page.locator('[data-setting=rate]')).to_have_value('1')
        expect(page.locator('[data-setting=voiceSource]')).to_have_value('pack')
        expect(page.locator('[data-setting=name]')).to_have_value('Existing explorer')
        page.locator('[data-setting=name]').fill('Existing explorer saved')
        upgraded=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)
        assert upgraded['stats']==old['stats']
        assert upgraded['settings']['voiceRevision']==3
        mark('Legacy voice settings migrate to natural bundled speech while learning progress is preserved')

        if not os.environ.get('SKIP_STANDALONE'):
            standalone = (ROOT/'dist/Farougs-Learning-Galaxy.html').read_text()
            assert 'GALAXY_VOICE_PACK' in standalone and 'GalaxyNarrator' in standalone, 'Rebuild standalone edition before testing.'
            offline = browser.new_context(viewport={'width':390,'height':844}, offline=True, reduced_motion='reduce')
            offline.add_init_script(INSTRUMENT)
            offline_page = offline.new_page()
            offline_errors=[]; offline_requests=[]
            offline_page.on('pageerror', lambda error: offline_errors.append(str(error)))
            def offline_document(route):
                if route.request.is_navigation_request():
                    route.fulfill(status=200,content_type='text/html',body=standalone)
                else:
                    offline_requests.append(route.request.url);route.abort()
            offline.route('**/*',offline_document)
            offline_page.goto('https://offline-galaxy.example/game.html',wait_until='load')
            settings(offline_page)
            offline_page.locator('[data-action=test-ar]').click()
            wait_event(offline_page,'playing',ar_key)
            wait_event(offline_page,'ended',ar_key)
            assert_no_native(offline_page)
            assert not offline_requests,offline_requests
            assert not offline_errors,offline_errors
            mark('Downloadable standalone plays actual Arabic offline on a phone layout with no device voices')
            offline.close()
        context.close();browser.close()
    print(f'PASS all {len(PASS)} bundled narration integration groups',flush=True)


if __name__=='__main__':
    main()
