# Faroug’s Learning Galaxy — Adventure Edition 3

**[Download the latest complete game ZIP](https://github.com/habbaninho888-ui/Faroug-Education-Game/raw/refs/heads/main/downloads/Farougs-Learning-Galaxy-Adventure-Edition.zip)**

Extract the ZIP, then open the HTML in Chrome or Edge. Use **Enable & test Arabic** in Settings if narration is silent.


An original rebuild of the supplied V8 prototype for ages 4–6. A responsive space academy, four learning worlds, 108 curated practice activities, 16 CVC word-building prompts, drawing, Orbit Flight, a real cel-shaded 3D runner, all 114 surahs as offline text, and a parent progress view.

## Play

Open `dist/Farougs-Learning-Galaxy.html` in a modern browser. It is a self-contained HTML file with all artwork, content, styles and code embedded. No installation, account or external fonts are needed. For reliable progress persistence, keep using the same browser and location; file-based storage behavior varies by browser. Drawing export needs a browser that allows file downloads.

For development, serve this directory:

```sh
python3 -m http.server 8000
```

Open the local server in your browser. Classic scripts are used so the downloadable edition also works directly from a file. There are no production package dependencies. Use the existing checkout in this isolated environment; no Git worktree is needed.

## What changed

- Coherent responsive interface, original vector worlds and Nova character; no franchise character presets.
- Teach → practise → reflect flow, untimed decisions, meaningful hints, explanations, keyboard controls and reduced-motion support.
- Orbit Flight integrates answer choice into ship navigation, with calm arrival and no lost lives.
- First-attempt, supported completion and unfinished attempts are recorded separately; drawing and religious listening are not scored. Each answered item awards once in a session.
- Browser-generated sound effects and original procedural ambience have independent controls. Music pauses in the garden. A master mute stops audio.
- All 300 English and Arabic narration lines are now bundled as offline neural MP3 audio. Arabic no longer depends on an installed language voice, and English uses a consistent Kokoro voice. Automatic lines finish before feedback starts; replay, navigation and mute deliberately stop current speech. Device voices remain an optional alternative, with delayed loading and natural-voice selection fixed. Rate and volume are adjustable. The voices are synthesized, not human recordings or reviewed pure-phoneme recordings; pronunciation grading and speech recognition are not provided.
- A parent check, local progress export/reset, configurable challenge/session length/goals, break reminders, contrast and text-size controls.

## Audio and privacy

Core activities, art, text, sound effects, ambience and the included English/Arabic narration work offline. The included voice pack needs no API key, language installation, or speech service. Tap an activity or voice preview to enable audio if the browser requires a gesture. Optional device voices depend on the browser/OS and may use online services. This game does not request microphone access or upload recordings. Qur’an audio is optional and uses `https://everyayah.com/data/Alafasy_128kbps/` (Mishary Rashid Alafasy); it needs internet and permission to reach `everyayah.com`. No recording is downloaded into the project or synthesized as recitation. The last-three-surah text is preserved from the supplied game, not certified against a particular mushaf edition. Use a trusted mushaf and teacher for formal study.

Progress and nickname are saved to `localStorage` under `faroug-galaxy-academy-v1`. No analytics, trackers, accounts, ads, external fonts, or video embeds. A storage-denied browser still permits play and shows a notice. Exported progress includes the nickname. The grown-up arithmetic check is a child friction step, not authentication.

## Source layout

- `index.html`, `styles.css`, `app.js`: interface, state, audio and activities.
- `content.js`: reviewed practice bank, CVC words and short-surah text.
- `narration.js`: single-channel clip/device narration, asynchronous voice discovery and cancellation guards.
- `voice-pack.js`, `voice-lines.json`, `assets/narration/`: all 300 exact narration lines and their embedded MP3 clips.
- `NARRATION-LICENSES.md`: model sources, checksums, credits and voice-use terms. Arabic assets are for personal/noncommercial use.
- `scripts/export_voice_lines.cjs`, `scripts/generate_voices.py`: reproducible narration corpus and audio generation. Models are separate build inputs and are not distributed in the source archive.
- `orbit.js`: standalone canvas learning-flight module.
- `runner.js`, `vendor/three.min.js`: original three-lane 3D Skybound Trails runner, jump/slide, untimed learning lanterns, mobile controls, reduced-motion still journey and honest canvas fallback.
- `quran.js`, `quran-data.js`: searchable library of all 114 surahs and 6,236 offline verses, three authentic online reciters and repeat/pause/stop controls.
- `feedback.js`: warm English/Arabic encouragement for independent success, supported completion and retry.
- `REVIEW-V2.md`: second game-production and early-learning review, applied findings and remaining acceptance limits.
- `assets/`: seven original SVG illustrations.
- `REVIEW.md`: professional review of the supplied V8 source.
- `tests/smoke.py`: browser integration checks (Python Playwright + Chromium).
- `scripts/build.py`: generates the self-contained edition; only Python's standard library is required.

## Build and validate

```sh
node --check app.js
node --check content.js
node --check orbit.js
node tests/content.test.cjs
node tests/voice-engine.test.cjs
node tests/voice-pack.test.cjs
python3 scripts/build.py
# With the development server running and Playwright + Chromium installed:
python3 tests/smoke.py
python3 tests/narration-browser.py
```

The browser suite expects Chromium at `/usr/bin/chromium` by default. Set `CHROMIUM_PATH` or `BASE_URL` to override. In managed cloud environments, browser and server socket operations may need execution permission outside the restricted sandbox.

The learning bank is informal practice, not a standardized assessment. The adaptation rule increases the available level after enough completed items and an independent-answer threshold; recent items needing support receive priority. Counts reflect practice events and can include replays. An educator should validate age fit, dialect/accent and curriculum alignment with actual learners before classroom deployment. Tracing guides are optional motor exploration; handwriting accuracy is not assessed. Full Arabic UI localization and reviewed pure-phoneme packs are future work. Included Arabic neural voice assets carry noncommercial terms; see `NARRATION-LICENSES.md` before redistribution. Learning content and layout are unchanged by the voice repair.

## Voice repair edition

Use `dist/Farougs-Learning-Galaxy-Adventure-Edition.html` to distinguish the new download from the previous browser-voice edition. In Settings, keep **Included neural voices** selected and **Natural** pace for the intended delivery. Existing practice progress is preserved when the browser/location provides the same storage; the earlier default `.86` speech rate is migrated to `1`. A downloaded file opened under a different path can have separate storage; export progress from the old copy if needed.

The English voice uses Kokoro v1.0 (`af_heart`, Apache 2.0). The Arabic high-quality model uses CC BY-NC-SA 4.0 and is included for this personalized game’s noncommercial use. These are generated neural voices, not actors’ recordings. All game narration is included; Qur’an recitation remains separate authentic online audio and is never synthesized.

## Adventure Edition 3 validation status

Implemented: first-click Arabic restore/test, automatic included-voice fallback, clip watchdogs, English/Arabic spoken encouragement, all-surah library with offline text, original 3D runner, still reduced-motion journey, and world-specific recent-evidence progression. The review is an internal production/education review; no affiliation with Ubisoft, EA or Capcom and no measured classroom-outcome claim. The browser art is original cel-shaded 3D, not a claim of console-level fidelity. ChatGPT Interactive Voice is not embedded or impersonated.

Passed checks: 13 complete app integration groups (including the runner’s shared progress), 17 narration-engine groups, 32 progression checks, 12 runner module browser groups, 8 Quran module browser groups, 9 real-narration integration groups, 5 first-Arabic/recovery browser groups, content integrity and exact Quran-source structure. The previously blocked integration check has completed successfully. A fluent Arabic speaker has not certified pronunciation or human-like quality.

The voice pack uses fully vocalized pronunciation overrides, explicit Arabic letter names and a steadier synthesis pace. Representative independent speech-recognition checks improved over the original pack, but do not establish error-free pronunciation. An alternative model was evaluated and kept out of this release because its exact model license was not confirmed.

`docs/index.html` is the complete self-contained web platform. The GitHub Pages workflow can publish it when GitHub permits Pages configuration. Downloaded play does not depend on Pages being enabled.

## Online play — one-time repository setting

The reviewed website is committed at `docs/index.html`. Automatic Pages creation was rejected by GitHub with `Resource not accessible by integration`; the workflow's repository token cannot enable a new Pages site.

The repository owner can finish online hosting:

1. Open [Settings → Pages](https://github.com/habbaninho888-ui/Faroug-Education-Game/settings/pages).
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
3. Open [Publish Learning Galaxy](https://github.com/habbaninho888-ui/Faroug-Education-Game/actions/workflows/pages.yml), select **Run workflow**, then run it on `main` (or rerun the failed deployment).

The online URL should only be shared as live after the deployment succeeds. The complete game ZIP above is already published and verified and does not depend on Pages.
