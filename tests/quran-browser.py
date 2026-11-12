"""Real-browser Quran module tests with deterministic short WAV recordings.

Run: python3 tests/quran-browser.py
No external recordings are fetched. These checks verify playback sequencing,
not the live EveryAyah service or religious text certification.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import io
import json
import os
import threading
import wave
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
PASS = []


def mark(message):
    PASS.append(message)
    print('PASS '+message, flush=True)


def wav(seconds=.4):
    out=io.BytesIO()
    with wave.open(out,'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000)
        w.writeframes(b'\0\0'*round(16000*seconds))
    return out.getvalue()


HARNESS='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f6f8f1;font-family:Arial,sans-serif}main{padding:24px;max-width:1200px;margin:auto}@media(max-width:650px){main{padding:12px}}</style></head><body><main id="quran"></main><script>
window.__settings=JSON.parse(localStorage.getItem('quran-test-settings')||'{"voiceVolume":0.7,"mute":false}');
window.__fastQuranTimeout=false;const nativeSetTimeout=window.setTimeout;window.setTimeout=(fn,delay,...args)=>nativeSetTimeout(fn,delay===18000&&window.__fastQuranTimeout?160:delay,...args);
window.__patches=[];window.__notes=[];window.__narrationStops=0;window.__plays=[];window.__played=[];window.__ended=[];window.__audios=[];
const NativeAudio=window.Audio;window.Audio=function(...args){const a=new NativeAudio(...args);window.__audios.push(a);a.addEventListener('playing',()=>window.__played.push(a.src));a.addEventListener('ended',()=>window.__ended.push(a.src));return a;};window.Audio.prototype=NativeAudio.prototype;
const nativePlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__plays.push(this.src);return nativePlay.call(this)};
</script><script src="/quran-data.js"></script><script src="/quran.js"></script><script>
window.__mount=()=>window.__quran=window.startQuran({container:document.querySelector('#quran'),settings:()=>window.__settings,onSettingsChange:patch=>{window.__patches.push(patch);Object.assign(window.__settings,patch);localStorage.setItem('quran-test-settings',JSON.stringify(window.__settings))},stopNarration:()=>window.__narrationStops++,notify:text=>window.__notes.push(text)});window.__mount();
</script></body></html>'''


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)

    def do_GET(self):
        if self.path=='/__quran_harness__':
            body=HARNESS.encode();self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else:super().do_GET()

    def log_message(self,*args):pass


def q(page,name):return page.locator('[data-quran-'+name+']')
def status(page):return q(page,'status').inner_text()
def no_overflow(page):assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),page.evaluate('[innerWidth,document.documentElement.scrollWidth]')


def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base='http://127.0.0.1:'+str(server.server_port)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-crash-reporter','--disable-breakpad'])
        context=browser.new_context(viewport={'width':1440,'height':1000})
        audio={'fail':False,'duration':.4}
        def recording(route):
            if audio['fail']:route.abort('failed')
            else:route.fulfill(status=200,content_type='audio/wav',headers={'cache-control':'no-store'},body=wav(audio['duration']))
        context.route('https://everyayah.com/**',recording)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/__quran_harness__',wait_until='load')
        expect(q(page,'current')).to_have_value('112')
        assert page.evaluate('window.__settings.quranSurahs')==[112,113,114]
        assert q(page,'ayah-row').count()==4
        no_overflow(page)
        q(page,'manage').first.click()
        expect(q(page,'search')).to_be_focused()
        assert q(page,'add').count()==114
        q(page,'search').fill('الفاتحة')
        assert q(page,'add').count()==1
        q(page,'add').check()
        assert page.evaluate('window.__settings.quranSurahs')==[1,112,113,114]
        expect(q(page,'add')).to_be_focused()
        q(page,'read').click()
        expect(q(page,'heading')).to_be_focused()
        assert q(page,'ayah-row').count()==7
        assert page.locator('.qg-bismillah').count()==0 # Fatihah verse 1 is already numbered.
        page.reload(wait_until='load')
        expect(q(page,'current')).to_have_value('1')
        assert page.evaluate('window.__settings.quranSurahs')==[1,112,113,114]
        mark('All 114 offline chapters, Arabic search, add/read selection, keyboard focus and persistence')

        q(page,'manage').first.click();q(page,'search').fill('');page.locator('[data-quran-preset="all"]').click()
        assert len(page.evaluate('window.__settings.quranSurahs'))==114
        expect(q(page,'search')).to_be_focused()
        q(page,'current').select_option('2')
        expect(q(page,'current')).to_be_focused()
        assert q(page,'ayah-row').count()==25
        assert '286 verses' in page.locator('.qg-reader-head').inner_text()
        assert page.locator('.qg-bismillah').count()==1
        for _ in range(11):page.locator('[data-quran-page="next"]').click()
        assert q(page,'ayah-row').count()==11
        assert q(page,'ayah-row').first.get_attribute('data-quran-ayah-row')=='275'
        expect(page.locator('[data-quran-page="previous"]')).to_be_focused()
        q(page,'current').select_option('9')
        assert page.locator('.qg-bismillah').count()==0 # At-Tawbah has no opening basmalah.
        q(page,'manage').last.click();expect(q(page,'manage').last).to_be_focused()
        mark('Add all chapters, long-surah pagination, basmalah handling and focus restoration')

        q(page,'current').select_option('112');q(page,'reciter').select_option('husary');q(page,'repeat').select_option('3')
        page.evaluate('window.__plays=[];window.__played=[];window.__ended=[]')
        q(page,'play-all').click()
        page.wait_for_function('window.__ended.length===12',timeout=15000)
        expect(q(page,'stop')).to_be_disabled()
        plays=page.evaluate('window.__plays');played=page.evaluate('window.__played')
        expected=[f'https://everyayah.com/data/Husary_128kbps/112{n:03}.mp3' for n in range(1,5) for _ in range(3)]
        assert plays==expected,plays
        assert played==expected,played
        assert page.evaluate('window.__narrationStops')>=1
        assert 'peaceful moment' in status(page)
        assert page.evaluate('window.__settings.quranReciter')=='husary' and page.evaluate('window.__settings.quranRepeat')==3
        mark('Native browser audio plays all four verses three times in exact order with chosen reciter and narration interruption')

        audio['duration']=1.2
        q(page,'repeat').select_option('1');q(page,'verse').first.click()
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.startsWith('Listening')")
        q(page,'pause').click();expect(q(page,'pause')).to_have_text('Resume')
        paused=page.evaluate('window.__audios[0].currentTime')
        page.wait_for_timeout(180)
        assert abs(page.evaluate('window.__audios[0].currentTime')-paused)<.01
        preserved=status(page)
        q(page,'manage').first.click();assert status(page)==preserved
        q(page,'pause').click()
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.startsWith('Listening')")
        q(page,'stop').click();expect(q(page,'pause')).to_be_disabled()
        assert page.evaluate('window.__audios[0].paused')
        before=page.evaluate('window.__plays.length');page.wait_for_timeout(1300)
        assert page.evaluate('window.__plays.length')==before
        mark('Pause/resume uses the real media element, manager redraw preserves status, Stop cancels repeat/all queue')

        # Trigger native media buffering events and accelerate only the 18-second watchdog.
        q(page,'verse').first.click()
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.startsWith('Listening')")
        page.evaluate("window.__fastQuranTimeout=true;window.__audios[0].dispatchEvent(new Event('stalled'))")
        assert 'Buffering' in status(page)
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.includes('could not play')")
        assert page.evaluate('window.__audios[0].paused')
        page.evaluate("window.__audios[0].dispatchEvent(new Event('playing'))")
        assert 'could not play' in status(page), 'Late playing events must not revive failed playback'
        page.evaluate('window.__fastQuranTimeout=false')
        q(page,'verse').first.click()
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.startsWith('Listening')")
        q(page,'pause').click()
        page.evaluate("window.__fastQuranTimeout=true;window.__savedPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=()=>new Promise(()=>{});void 0")
        q(page,'pause').click()
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.includes('could not play')")
        page.evaluate('window.__fastQuranTimeout=false;HTMLMediaElement.prototype.play=window.__savedPlay;void 0')
        q(page,'stop').click()
        mark('Buffering and stalled Resume recover through a bounded watchdog; late media events cannot restart failed playback')

        audio['fail']=True
        q(page,'verse').first.click()
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.includes('could not play')")
        assert 'reading offline' in status(page)
        audio['fail']=False;audio['duration']=.4
        q(page,'reciter').select_option('abdulbasit');q(page,'verse').first.click()
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.startsWith('Listening')")
        assert 'Abdul_Basit_Murattal_192kbps/112001.mp3' in page.evaluate('window.__plays.at(-1)')
        q(page,'stop').click()
        page.evaluate('window.__settings.mute=true;window.__quran.updateSettings()')
        before=page.evaluate('window.__plays.length');q(page,'play-all').click()
        assert page.evaluate('window.__plays.length')==before
        assert 'muted' in status(page)
        page.evaluate('window.__settings.mute=false;window.__quran.updateSettings()')
        assert status(page).startswith('Reading works offline')
        q(page,'play-all').click()
        page.wait_for_function("document.querySelector('[data-quran-status]').textContent.startsWith('Listening')")
        page.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
        expect(q(page,'pause')).to_have_text('Resume');assert 'while you were away' in status(page)
        page.evaluate('window.__quran.destroy()')
        before=page.evaluate('window.__plays.length');page.wait_for_timeout(650)
        assert page.evaluate('window.__plays.length')==before and page.evaluate('window.__audios[0].paused')
        q(page,'play-all').click();assert page.evaluate('window.__plays.length')==before
        mark('Offline audio error recovers with another reciter; mute, background pause and destroy stop playback safely')

        # Small-screen offline reading and library editing require no remote API.
        mobile=browser.new_context(viewport={'width':320,'height':800},is_mobile=True,has_touch=True)
        mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
        mobile.route('https://**/*',lambda route:route.abort())
        mp.goto(base+'/__quran_harness__',wait_until='load');no_overflow(mp)
        q(mp,'manage').first.tap();mp.locator('[data-quran-preset="short"]').tap()
        assert mp.evaluate('window.__settings.quranSurahs')==list(range(93,115))
        no_overflow(mp);q(mp,'current').select_option('96');no_overflow(mp)
        mp.screenshot(path='/tmp/quran-mobile.png',full_page=True)
        # Removing the current chapter must choose another saved chapter and stay usable.
        q(mp,'search').fill('Al-Alaq');q(mp,'add').uncheck()
        assert 96 not in mp.evaluate('window.__settings.quranSurahs')
        assert mp.evaluate('window.__settings.quranCurrent')==93
        assert q(mp,'ayah-row').count()==11
        assert status(mp).startswith('Reading works offline')
        mp.evaluate('window.__quran.destroy();window.__settings.quranSurahs=[112];window.__settings.quranCurrent=112;window.__mount();void 0')
        q(mp,'manage').first.tap();q(mp,'search').fill('112');q(mp,'add').click()
        expect(q(mp,'add')).to_be_checked()
        assert mp.evaluate('window.__settings.quranSurahs')==[112]
        assert mp.evaluate('window.__notes.at(-1)')=='Keep at least one surah in your library.'
        mark('320px offline reading, short-surah preset, current removal, last-surah guard and no horizontal overflow')
        assert not errors,errors
        mark('No uncaught Quran module errors')
        mobile.close();context.close();browser.close()
    server.shutdown()
    print(f'PASS all {len(PASS)} Quran integration groups',flush=True)


if __name__=='__main__':main()
