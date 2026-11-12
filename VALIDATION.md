# Validation report

- JavaScript syntax checks passed for app.js, content.js and orbit.js.
- Content integrity: 108 activities with unique IDs and valid answer choices; 16 builder words; three surah structures. Structural validation is not religious-text certification.
- Browser integration: all 12 groups in tests/smoke.py passed in Chromium. Coverage includes complete missions, wrong answers and hints, independent versus supported credit, once-only rewards, persisted settings/progress, parent gate and export, drawing PNG export, collection, Orbit Flight, keyboard controls and mobile layouts. No uncaught JavaScript errors.
- Standalone HTML verified with all external requests blocked: images load and Arabic quiz runs. No external requests were made by core gameplay.
- Additional layout checks passed at 320px, 390px and 1440px widths, with larger text enabled and a short desktop viewport.
- Recitation playback, three repeats, and failure UI were validated with mocked audio; live EveryAyah availability was not verified. Optional device English/Arabic narration depends on installed voices and browser support. The current default uses bundled neural audio; see the voice repair checks below.
- No classroom trial, formal accessibility certification, pronunciation evaluation, or measured learning-outcome claim.

## Voice repair edition

The previous release's tests did not establish natural voice quality or working Arabic on a device without an installed Arabic voice. That limitation is resolved architecturally by shipping the narration as generated MP3 audio. Playback and synthesis quality are separate checks: no claim is made that these synthetic voices are human actors or error-free pronunciation models.

- All 282 narration keys (224 English, 58 Arabic) have embedded MP3 clips and matching source files. No runtime narration line relies on a device voice by default.
- All generated MP3 clips decoded and contained finite, non-silent audio. Ten independently sampled English/Arabic clips also passed FFmpeg PCM decoding checks.
- All 12 narration-engine test groups passed: delayed Arabic discovery, natural voice ranking, complete phrases, bounded feedback queue, manual replay, stale-event protection, gesture unlock, pace, and cancellation.
- All 9 real-audio browser integration groups passed with browser voices forced empty. English and Arabic previews played to completion at normal speed; automatic feedback waited for the question; replay, mute, navigation and backgrounding stopped audio correctly.
- The complete standalone HTML played real Arabic audio offline at a 390px viewport. No native speech calls, external requests, or uncaught JavaScript errors occurred in these tests.
- The existing 12 gameplay integration groups passed again after the voice changes, including scoring, persistence, all worlds, exports, recitation controls, flight and mobile layout.
- Legacy default rate `.86` migrates to `1` and the included neural pack without resetting learning statistics.
- Voice quality is not subjectively graded by these tests. These are neural-generated voices, not human actor recordings. Qur’an recitation remains separate authentic online audio.
- English model: Kokoro v1.0 (Apache 2.0). Arabic model: SA miro V2 high (CC BY-NC-SA 4.0), supplied for personal/noncommercial use. See NARRATION-LICENSES.md.

## Adventure Edition 3 final verification

- Complete app: `tests/smoke.py` passed all 13 integration groups, including the corrected visual-aware runner question matching and shared scoring/results.
- Arabic recovery: `tests/edition3-audio.py` passed five groups. Arabic was the FIRST click in a fresh browser without any installed voices. The real MP3 completed and produced measurable non-silent browser audio-graph PCM. Voice-off/mute recovery, missing-native-Arabic fallback and version-two settings migration also passed.
- Narration: 300 exact keys, including 67 Arabic clips and bilingual encouragement; all included MP3s are present. `tests/narration-browser.py` passed nine groups, including real offline Arabic in the standalone edition. `tests/voice-engine.test.cjs` passed 17 groups including stalled-clip watchdogs and unavailable/failed native voice fallback.
- Runner module: 12 browser groups passed with actual WebGL and High-detail shader rendering, controls, collision, untimed gates, reduced-motion still route and canvas fallback.
- Qur’an module: all 114 chapters and 6,236 verse strings preserve the pinned source; eight browser groups passed for library choices, reciters, repeat order, pause/stop, watchdogs, focus and small-screen layout. Recitation audio in automated tests used deterministic WAV fixtures; live EveryAyah access was not verified.
- Progression: 32 checks pass against actual app code and content, including subject-specific reachable thresholds and recent varied independent evidence.
- Distribution includes original art, Three.js MIT notice, Quran source/license and neural-voice credits.
- Arabic acoustic playback and independent ASR are evidence of function, not a fluent human listening certification. Generated narration is not ChatGPT Interactive Voice or a human actor recording. Original browser graphics are not a claim of PS4 production parity.

## Publication evidence

The Adventure Edition source, reviewed standalone website and ZIP were published to GitHub. The actual ZIP download returned HTTP200 and5,462,653 bytes. SHA256 matched the tested local ZIP: `ab1540460901d0b4e66235bf9e166bcfe670bd59cc1dd65aeac857175f6d6d52`; CRC and embedded-module checks passed.

A standard GitHub Pages workflow was also pushed, but deployment run42479739536 failed during site creation with `Resource not accessible by integration`. Live hosting is not claimed. The repository owner must enable Pages with GitHub Actions as the source and run the workflow. This hosting permission failure does not affect the verified downloadable game.
