"""Runner-specific real browser checks, including WebGL and intentional fallback.

Run: python3 tests/runner-browser.py
Requires Python Playwright and Chromium (default /usr/bin/chromium).
The local HTTP server and isolated browser profiles are created by this script.
No application source or stored family progress is changed.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import os
from pathlib import Path
import sys
import threading
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = [
    dict(id='runner-count', world='numbers', level=1, skill='Counting', prompt='How many dots?', spoken='How many dots do you see?', lang='en', visual={'type':'dots','value':3}, choices=['2','3','4'], answer='3', hint='Touch each dot once.', explanation='There are three dots.'),
    dict(id='runner-letter', world='letters', level=1, skill='Letters', prompt='Which letter starts sun?', spoken='Which letter starts sun?', lang='en', visual={'type':'emoji','value':'☀️'}, choices=['m','s','t'], answer='s', hint='Sun starts like sock.', explanation='Sun and sock start with s.'),
    dict(id='runner-arabic', world='arabic', level=1, skill='الحروف', prompt='أَيْنَ حَرْفُ ب؟', spoken='أين حرف الباء؟', lang='ar', visual={'type':'letter','value':'ب'}, choices=['ب','ت','ن'], answer='ب', hint='ابحث عن الباء.', explanation='أحسنت، هذا حرف الباء.'),
]
PASS = []


def mark(message):
    PASS.append(message)
    print('PASS ' + message, flush=True)


def harness(fast=False, reduced=False):
    return '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0}main{max-width:1240px;margin:auto;padding:24px;min-height:0}@media(max-width:650px){main{padding:12px}}</style></head><body><main id="test-runner"></main><script src="/vendor/three.min.js"></script><script src="/runner.js"></script><script>
window.__runnerEvents=[];window.__runnerDone=null;window.__runnerExit=0;
window.__runner=window.startRunner({container:document.querySelector('#test-runner'),questions:''' + json.dumps(QUESTIONS, ensure_ascii=False) + ''',testMode:''' + str(fast).lower() + ''',reducedMotion:''' + str(reduced).lower() + ''',
  onAnswer:(q,a)=>window.__runnerEvents.push({id:q.id,...a}),onHint:q=>window.__runnerEvents.push({id:q.id,hint:true}),
  onFinish:r=>window.__runnerDone=r,onExit:()=>window.__runnerExit++,sfx:()=>{},speak:(text,lang)=>window.__lastRunnerSpeech={text,lang}
});</script></body></html>'''


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/__runner_harness__':
            q = parse_qs(u.query)
            body = harness(q.get('fast') == ['1'], q.get('reduced') == ['1']).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass


def state(page):
    return page.evaluate('window.__runner.getState()')


def wait_phase(page, phase, timeout=20000):
    page.wait_for_function('(phase)=>window.__runner.getState().phase===phase', arg=phase, timeout=timeout)


def control(page, name):
    return page.locator(f'[data-runner="{name}"]')


def answer(page, value):
    matches = page.locator('[data-answer]')
    for i in range(matches.count()):
        b = matches.nth(i)
        if b.get_attribute('data-answer') == value:
            return b
    raise AssertionError('No answer button ' + value)


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), page.evaluate('[innerWidth,document.documentElement.scrollWidth]')


def high_detail_capture(browser, base):
    page=browser.new_page(viewport={'width':1440,'height':1050},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and ('THREE' in m.text or 'Shader' in m.text) else None)
    page.goto(base+'/__runner_harness__',wait_until='load')
    page.locator('.runner-advanced summary').click()
    control(page,'quality').select_option('high')
    page.locator('[data-suit="#78b9ac"]').click()
    control(page,'start').click()
    page.wait_for_function('window.__runner.getState().distance>5',timeout=20000)
    page.screenshot(path='/tmp/runner-high.png',full_page=True)
    current=state(page)
    assert current['quality']=='high' and current['renderer']=='webgl' and current['suit']=='#78b9ac',current
    assert not errors,errors
    page.evaluate('window.__runner.destroy()')
    page.close()
    mark('Explicit High graphics and mint avatar render without shader or page errors; /tmp/runner-high.png')


def main():
    assert (ROOT/'runner.js').is_file(), 'runner.js is required'
    assert (ROOT/'vendor/three.min.js').is_file(), 'Vendored Three.js is required'
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = 'http://127.0.0.1:' + str(server.server_port)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
          args=['--no-sandbox','--disable-crash-reporter','--disable-breakpad','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'])
        if '--high-only' in sys.argv:
            high_detail_capture(browser,base)
            browser.close()
            server.shutdown()
            return
        context = browser.new_context(viewport={'width':1440,'height':1050}, device_scale_factor=1)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda e:errors.append(str(e)))
        page.goto(base+'/__runner_harness__', wait_until='load')
        wait_phase(page,'intro')
        assert state(page)['renderer'] == 'webgl', state(page)
        expect(control(page,'start')).to_be_visible()
        no_overflow(page)
        mark('Original runner creates a real WebGL scene and an operable introduction')

        control(page,'start').click()
        wait_phase(page,'running')
        page.locator('body').evaluate('(e)=>{e.tabIndex=-1;e.focus()}')
        page.keyboard.press('ArrowLeft')
        page.wait_for_timeout(100)
        assert state(page)['lane']==-1, state(page)
        page.keyboard.press('ArrowRight')
        page.wait_for_timeout(100)
        assert state(page)['lane']==0, state(page)
        page.keyboard.press('ArrowUp')
        page.wait_for_function('window.__runner.getState().jump>0',timeout=10000)
        assert state(page)['jump']>0, state(page)
        page.wait_for_function('window.__runner.getState().jump===0',timeout=15000)
        page.keyboard.press('ArrowDown')
        page.wait_for_timeout(100)
        assert state(page)['sliding'], state(page)
        assert state(page)['jumps']>=1 and state(page)['slides']>=1
        mark('Keyboard steering, jump physics and slide actions execute in the running game')
        page.keyboard.press('p')
        wait_phase(page,'paused')
        before=state(page)['distance']
        page.wait_for_timeout(350)
        assert state(page)['distance']==before
        page.keyboard.press('Escape')
        wait_phase(page,'running')
        page.wait_for_function('(before)=>window.__runner.getState().distance>before',arg=before,timeout=10000)
        assert state(page)['distance']>before
        mark('Pause freezes simulation and Escape resumes it')
        control(page,'pause').focus()
        page.keyboard.press('Space')
        wait_phase(page,'paused')
        control(page,'resume').focus()
        page.keyboard.press('Space')
        wait_phase(page,'running')
        page.locator('body').evaluate('(e)=>{e.tabIndex=-1;e.focus()}')
        mark('Space preserves native activation of focused Pause and Resume buttons')
        page.wait_for_function('window.__runner.getState().bumps > 0', timeout=30000)
        assert state(page)['phase']=='running', state(page)
        mark('A real center-lane obstacle collision slows the explorer without losing a life or ending play')
        page.screenshot(path='/tmp/runner-desktop.png',full_page=True)
        page.evaluate('window.__runner.destroy()')
        before=state(page)['distance']
        page.wait_for_timeout(200)
        assert state(page)['phase']=='destroyed' and state(page)['distance']==before
        mark('Destroy stops updates and releases the active game')

        page.goto(base+'/__runner_harness__?fast=1',wait_until='load')
        control(page,'start').click()
        wait_phase(page,'gate')
        gate_distance=state(page)['distance']
        page.wait_for_timeout(300)
        assert state(page)['distance']==gate_distance, 'Learning gate must have no time pressure'
        page.screenshot(path='/tmp/runner-learning-gate.png',full_page=True)
        answer(page,'2').click()
        expect(answer(page,'2')).to_be_disabled()
        control(page,'hint').click()
        control(page,'hear').click()
        assert page.evaluate('window.__lastRunnerSpeech.lang')=='en'
        answer(page,'3').click()
        events=page.evaluate('window.__runnerEvents')
        assert any(e.get('correct') is False for e in events)
        assert any(e.get('hint') is True for e in events)
        solved=[e for e in events if e.get('correct') is True]
        assert len(solved)==1 and solved[0]['firstTry'] is False
        mark('Untimed learning gates preserve wrong answers, hints and supported-completion evidence')
        control(page,'continue').click()
        wait_phase(page,'gate')
        answer(page,'s').click()
        control(page,'continue').click()
        wait_phase(page,'gate')
        no_overflow(page)
        expect(page.locator('[lang="ar"]').first).to_be_visible()
        answer(page,'ب').click()
        control(page,'continue').click()
        wait_phase(page,'finished')
        control(page,'complete').click()
        page.wait_for_function('window.__runnerDone !== null')
        done=page.evaluate('window.__runnerDone')
        assert done['total']==3 and done['correctFirst']==2, done
        assert state(page)['phase'] in ('finished','destroyed')
        assert len([e for e in page.evaluate('window.__runnerEvents') if e.get('correct') is True])==3
        mark('A full three-checkpoint run completes with correct shared first-try scoring')

        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
        mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
        mp.goto(base+'/__runner_harness__',wait_until='load')
        control(mp,'start').tap();wait_phase(mp,'running')
        control(mp,'right').tap();assert state(mp)['lane']==1
        control(mp,'jump').tap();mp.wait_for_function('window.__runner.getState().jump>0',timeout=10000);assert state(mp)['jump']>0
        mp.wait_for_function('window.__runner.getState().jump===0',timeout=15000)
        control(mp,'slide').tap();assert state(mp)['sliding']
        no_overflow(mp)
        mp.screenshot(path='/tmp/runner-mobile.png',full_page=True)
        # Resize while running, then background, without losing game controls.
        mp.set_viewport_size({'width':430,'height':900});mp.wait_for_timeout(150);no_overflow(mp)
        mp.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
        wait_phase(mp,'paused')
        mark('Touch steering, jump/slide, mobile resize and background pause work without page overflow')
        mobile.close()

        fallback=browser.new_context(viewport={'width':390,'height':844})
        fallback.add_init_script('''(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).includes('webgl'))return null;return original.call(this,type,...args)}})();''')
        fp=fallback.new_page();fp.on('pageerror',lambda e:errors.append(str(e)))
        fp.goto(base+'/__runner_harness__?fast=1&reduced=1',wait_until='load')
        assert state(fp)['renderer']=='canvas',state(fp)
        control(fp,'start').click();wait_phase(fp,'gate')
        still_before=state(fp)['distance']
        fp.wait_for_timeout(400)
        assert state(fp)['distance']==still_before==0, state(fp)
        no_overflow(fp)
        fp.screenshot(path='/tmp/runner-mobile-fallback.png',full_page=True)
        answer(fp,'3').click();control(fp,'continue').click()
        wait_phase(fp,'gate')
        assert state(fp)['questionIndex']==1 and state(fp)['distance']==0, state(fp)
        control(fp,'exit').click()
        assert fp.evaluate('window.__runnerExit')==1
        mark('WebGL-unavailable fallback stays playable, reaches learning gates and exits cleanly')
        mark('Reduced-motion mode uses still scenery and advances untimed learning without auto-running')
        fallback.close()
        assert not errors, errors
        mark('No uncaught runner script errors')
        context.close();browser.close()
    server.shutdown()
    print(f'PASS all {len(PASS)} runner integration groups',flush=True)


if __name__=='__main__':
    main()
