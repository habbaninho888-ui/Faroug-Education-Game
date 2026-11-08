"""Meaningful browser integration checks. Start: python3 -m http.server 8000.
Run: python3 tests/smoke.py (BASE_URL and CHROMIUM_PATH are optional).
Test profiles are isolated; no application state is written through JavaScript.
The only direct storage mutation is clearing the initially empty test profile.
Optional online recitation is mocked; these tests make no claim about the live provider.
"""
import io
import json
import os
import re
import wave
from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get('BASE_URL', 'http://127.0.0.1:8000')
KEY = 'faroug-galaxy-academy-v1'
passed = []


def mark(text):
    passed.append(text)
    print('PASS ' + text, flush=True)


def stored(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)


def nav(page, name):
    button = page.locator(f'.nav-button[data-view="{name}"]')
    if button.is_visible():
        button.click()
    elif name == 'settings':
        page.locator('.profile-button').click()
    elif name == 'parents':
        page.locator('.profile-button').click()
        page.locator('[data-action=parent-gate]').click()
    else:
        raise AssertionError('No visible navigation route for ' + name)


def question(page, flight=False):
    return page.evaluate('''(flight) => {
      const title = document.querySelector(flight ? '.orbit-question' : '#question-title').textContent;
      const v = document.querySelector(flight ? '.orbit-qvisual' : '.question-visual');
      const dot = v.querySelector('.dots');
      const value = dot ? dot.getAttribute('aria-label').split(' ')[0] :
        v.classList.contains('orbit-dots') ? v.getAttribute('aria-label').split(' ')[0] : v.textContent.trim();
      return window.GALAXY_CONTENT.questions.find(q => q.prompt === title && String(q.visual.value) === value);
    }''', flight)


def answer_button(page, answer):
    choices = page.locator('.choice')
    for i in range(choices.count()):
        b = choices.nth(i)
        if b.get_attribute('data-answer') == answer:
            return b
    raise AssertionError('No choice for ' + answer)


def fill_word(page, letters):
    for letter in letters:
        page.get_by_role('button', name='Letter ' + letter, exact=True).filter(visible=True).first.click()


def no_overflow(page, label):
    overflow = page.evaluate('''() => ({w: innerWidth, doc:document.documentElement.scrollWidth,
      body:document.body.scrollWidth, bad:[...document.querySelectorAll('main *')].filter(e=>{
        const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+2;
      }).slice(0,5).map(e=>e.tagName+'.'+e.className)})''')
    assert max(overflow['doc'], overflow['body']) <= overflow['w'] + 2, f'{label} overflows: {overflow}'


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True,
            args=['--no-sandbox', '--disable-crash-reporter', '--disable-breakpad'])
        context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce', accept_downloads=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE_URL, wait_until='networkidle')
        page.evaluate('localStorage.clear()')
        page.reload(wait_until='networkidle')
        expect(page.locator('.hero')).to_be_visible()
        expect(page.locator('.world-card')).to_have_count(4)
        assert page.evaluate('GALAXY_CONTENT.questions.length') >= 100
        mark('Home and complete offline content load')

        # A six-item mission: one second-try correct, one hint-assisted correct, four independent.
        page.locator('[data-action=start-mixed]').click()
        for i in range(6):
            q = question(page)
            assert q, 'Question must be identifiable from visible prompt and stimulus'
            expect(page.locator('[data-action=next-question]')).to_be_hidden()
            before = stored(page)
            if i == 0:
                wrong = next(x for x in q['choices'] if x != q['answer'])
                answer_button(page, wrong).click()
                expect(answer_button(page, wrong)).to_be_disabled()
                assert stored(page)['stats']['completed'] == 0
                assert stored(page)['stats']['attempted'] == 1
            if i == 1:
                page.locator('[data-action=hint]').click()
                expect(page.locator('[data-action=hint]')).to_be_disabled()
                assert stored(page)['stats']['attempted'] == 2
            good = answer_button(page, q['answer'])
            # Exercise the documented number-key shortcut with focus on the heading.
            nth = good.locator('.choice-key').inner_text()
            page.locator('#question-title').focus()
            page.keyboard.press(nth)
            expect(good).to_have_class(re.compile('correct'))
            after = stored(page)
            assert after['stats']['completed'] == i+1
            assert after['stats']['stardust'] == 5*(i+1)
            page.keyboard.press(nth)
            assert stored(page)['stats'] == after['stats'], 'Repeated submission must not duplicate a reward'
            page.locator('[data-action=next-question]').click()
        expect(page.locator('.result-panel')).to_be_visible()
        state = stored(page)
        assert state['stats'] == dict(stardust=30, attempted=6, completed=6, independent=4, flights=0, words=0), state['stats']
        assert state['daily']['count'] == 6
        assert len(state['sessions']) == 1 and state['sessions'][0]['first'] == 4
        page.reload(wait_until='networkidle')
        assert stored(page)['stats'] == state['stats']
        expect(page.locator('#star-total')).to_have_text('30')
        mark('Mixed mission, keyboard answers, wrong/hint accounting, duplicate prevention and reload persistence')

        # Every world must teach before its own correctly scoped question set.
        for world in ('letters','numbers','arabic','discovery'):
            nav(page, 'worlds')
            page.locator(f'[data-world="{world}"]').click()
            expect(page.locator('.lesson-model')).to_be_visible()
            page.locator('[data-action=quiz-world]').click()
            assert question(page)['world'] == world
            page.locator('[data-action=leave-quiz]').click()
        assert stored(page)['stats'] == state['stats'], 'Merely viewing questions is not an attempt'
        mark('All four lesson-to-mission routes with correctly scoped content')

        # Builder: an incomplete check is not an attempt; independent completion cannot be farmed.
        nav(page, 'studio')
        page.locator('[data-action=word-check]').click()
        expect(page.locator('#word-feedback')).to_have_text('Give every space a letter first.')
        assert stored(page)['stats'] == state['stats']
        words = page.evaluate('GALAXY_CONTENT.words')
        fill_word(page, words[0]['letters'])
        page.locator('[data-action=word-check]').click()
        expect(page.locator('[data-action=word-check]')).to_be_disabled()
        current = stored(page)
        assert current['stats']['words'] == 1 and current['stats']['independent'] == 5
        page.keyboard.press('Enter') # focus is Next little word: move to a fresh task
        expect(page.locator('[data-action=word-check]')).to_be_enabled()
        assert stored(page)['stats'] == current['stats']
        # Wrong order, clear, reveal support, then solve the second word.
        bad = list(reversed(words[1]['letters']))
        fill_word(page, bad)
        page.locator('[data-action=word-check]').click()
        expect(page.locator('#word-feedback')).to_contain_text('different order')
        page.locator('[data-action=word-clear]').click()
        page.locator('[data-action=word-hint]').click()
        expect(page.locator('#studio-word')).to_have_text(words[1]['word'])
        fill_word(page, words[1]['letters'])
        page.locator('[data-action=word-check]').click()
        stats = stored(page)['stats']
        assert stats['words'] == 2 and stats['completed'] == 8 and stats['independent'] == 5 and stats['stardust'] == 40, stats
        assert stored(page)['history']['build-'+words[1]['word']]['hints'] == 1
        mark('Word builder independent/support accounting, tile correction and one reward per completion')

        # Drawing is meaningful and unscored. Download produces a PNG rather than an empty link.
        page.locator('[data-action=studio-draw]').click()
        page.locator('#draw-guide').select_option('ب')
        canvas = page.locator('#drawing')
        box = canvas.bounding_box()
        page.mouse.move(box['x']+80,box['y']+80)
        page.mouse.down()
        page.mouse.move(box['x']+180,box['y']+120,steps=12)
        page.mouse.up()
        with page.expect_download() as download_info:
            page.locator('[data-action=draw-save]').click()
        download = download_info.value
        assert download.suggested_filename.endswith('.png')
        assert open(download.path(),'rb').read(8) == b'\x89PNG\r\n\x1a\n'
        assert stored(page)['stats'] == stats
        mark('Optional drawing, Arabic guide and real PNG export without learning rewards')

        nav(page, 'settings')
        page.locator('[data-setting=name]').fill('Little Nova')
        page.locator('[data-setting=length]').select_option('4')
        page.locator('[data-setting=level]').select_option('3')
        page.locator('[data-setting=motion]').uncheck()
        page.locator('[data-setting=contrast]').check()
        page.locator('[data-setting=largeText]').check()
        page.locator('[data-setting=rate]').select_option('0.72')
        page.locator('[data-setting=music]').check()
        page.reload(wait_until='networkidle')
        expect(page.locator('.welcome h1')).to_contain_text('Little Nova')
        assert page.locator('body').evaluate('(e)=>e.classList.contains("reduce-motion") && e.classList.contains("large-text") && e.classList.contains("high-contrast")')
        settings = stored(page)['settings']
        assert settings['length']==4 and settings['level']=='3' and settings['rate']==.72 and settings['music']
        mark('Nickname, mission length, challenge, voice pace and accessibility settings survive reload')

        # Native dialog keyboard containment and Escape. Then solve the randomized adult check.
        nav(page, 'parents')
        expect(page.locator('#dialog')).to_be_visible()
        for _ in range(6):
            page.keyboard.press('Tab')
            assert page.evaluate('document.activeElement === document.body || document.activeElement.closest("dialog") !== null'), 'Focus must not reach a background app control while modal is open'
        page.keyboard.press('Escape')
        expect(page.locator('#dialog')).to_be_hidden()
        nav(page, 'parents')
        text = page.locator('#dialog').inner_text()
        a,b = map(int,re.search(r'What is (\d+) \+ (\d+)\?',text).groups())
        page.locator('#adult-answer').fill(str(a+b))
        page.get_by_role('button',name='Open grown-up corner',exact=True).click()
        expect(page.locator('.parent-stats')).to_be_visible()
        assert page.locator('.parent-stat strong').all_text_contents() == ['8','8','5','3']
        with page.expect_download() as exported:
            page.locator('[data-action=export-progress]').click()
        report = json.load(open(exported.value.path()))
        assert report['stats'] == stats and report['settings']['name']=='Little Nova'
        mark('Grown-up gate, modal keyboard containment/Escape, observed statistics and JSON export')

        nav(page, 'collection')
        expect(page.locator('.badge')).to_have_count(6)
        expect(page.locator('.badge').filter(has_text='First little light')).not_to_have_class(re.compile('locked'))
        mark('Earned collection milestone is visible')

        # Exercise recitation sequencing with a short valid locally generated audio fixture.
        audio_data = io.BytesIO()
        with wave.open(audio_data,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0\0'*1600)
        requested=[]
        def recite_ok(route):
            requested.append(route.request.url)
            route.fulfill(status=200,content_type='audio/wav',body=audio_data.getvalue(),headers={'Access-Control-Allow-Origin':'*'})
        context.route('https://everyayah.com/**',recite_ok)
        nav(page, 'garden')
        expect(page.locator('[data-quran-ayah-row]')).to_have_count(4)
        page.locator('[data-quran-repeat]').select_option('3')
        page.locator('[data-quran-verse="0"]').click()
        expect(page.locator('[data-quran-status]')).to_contain_text('A peaceful moment',timeout=15000)
        assert len(requested)==3, f'Expected 3 actual verse play requests; got {requested}'
        page.locator('[data-quran-current]').select_option('113')
        expect(page.locator('[data-quran-ayah-row]')).to_have_count(5)
        expect(page.locator('[data-quran-repeat]')).to_have_value('3')
        context.unroute('https://everyayah.com/**',recite_ok)
        context.route('https://everyayah.com/**',lambda route:route.abort('failed'))
        page.locator('[data-quran-play-all]').click()
        expect(page.locator('[data-quran-status]')).to_contain_text('could not play',timeout=15000)
        assert stored(page)['stats']==stats, 'Listening never changes achievement statistics'
        page.locator('[data-quran-stop]').click()
        expect(page.locator('[data-quran-status]')).to_contain_text('Stopped')
        mark('Garden surah selection, actual three-play repeat sequence, graceful media failure and unscored listening')

        # Reduced-motion flight reaches gates immediately, including keyboard selection and pause.
        nav(page,'journey')
        page.locator('[data-action=start-orbit]').click()
        expect(page.locator('.orbit-game')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('.orbit-pause-screen')).to_have_class(re.compile('visible'))
        page.locator('[data-orbit=resume]').click()
        for i in range(4):
            q=question(page,True)
            assert q
            if i==0:
                page.locator('[data-orbit=hint]').click()
            n=q['choices'].index(q['answer'])+1
            page.keyboard.press(str(n))
            page.locator('[data-orbit=collect]').click()
            expect(page.locator('[data-orbit=collect]')).to_be_hidden()
            page.locator('[data-orbit=next]').click()
        expect(page.locator('.result-panel')).to_be_visible()
        stats=stored(page)['stats']
        assert stats['flights']==1 and stats['completed']==12 and stats['independent']==8 and stats['stardust']==60,stats
        mark('Complete reduced-motion flight, pause/resume, keyboard gates and shared scoring')

        # Integrated still runner: every module result must reach the shared parent state.
        nav(page,'journey');page.locator('[data-action=start-runner]').first.click()
        page.locator('[data-runner=start]').click()
        for i in range(4):
            title=page.locator('.runner-question').inner_text()
            q=page.evaluate('''(title)=>{const v=document.querySelector('.runner-gate-visual'),dots=v.querySelector('.runner-gate-dots'),value=dots?dots.getAttribute('aria-label').split(' ')[0]:v.textContent.trim();return GALAXY_CONTENT.questions.find(q=>q.prompt===title&&String(q.visual.value)===value);}''',title)
            assert q
            if i==0:page.locator('[data-runner=hint]').click()
            choices=page.locator('.runner-gate-choices [data-answer]')
            for j in range(choices.count()):
                if choices.nth(j).get_attribute('data-answer')==q['answer']:
                    choices.nth(j).click();break
            page.locator('[data-runner=continue]').click()
        page.locator('[data-runner=complete]').click()
        expect(page.locator('.result-panel')).to_be_visible()
        runstats=stored(page)['stats']
        assert runstats['runs']==1 and runstats['completed']==16 and runstats['stardust']==80,runstats
        mark('Complete integrated still runner preserves shared hints, rewards and parent results')

        # Phone layout: navigation, lesson, question, builder, drawing, settings, reports, garden and flight.
        page.set_viewport_size({'width':390,'height':844})
        for v in ('home','journey','worlds','studio','garden','collection','settings','parents'):
            nav(page,v)
            no_overflow(page,v)
        nav(page,'worlds')
        page.locator('[data-world=arabic]').click();no_overflow(page,'Arabic lesson')
        page.locator('[data-action=quiz-world]').click();no_overflow(page,'Arabic quiz')
        page.locator('[data-action=leave-quiz]').click()
        nav(page,'studio');page.locator('[data-action=studio-draw]').click();no_overflow(page,'drawing')
        nav(page,'journey');page.locator('[data-action=start-orbit]').click();no_overflow(page,'Orbit Flight')
        page.locator('[data-orbit=exit]').click()
        mark('390px mobile layout without page overflow across all major activities and reports')
        assert not errors,'Browser script errors: '+repr(errors)
        mark('No uncaught browser script errors')
        browser.close()
    print(f'\n{len(passed)} integration groups passed.',flush=True)


if __name__ == '__main__':
    main()
