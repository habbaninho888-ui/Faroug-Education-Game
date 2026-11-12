# Review and validation · 12 November 2026

This implementation review uses parent, child, game developer, and education perspectives, supported by automated checks and visual inspection. It is not a study with recruited families or a certified educational assessment.

## Findings and revisions

| Perspective | Finding | Revision |
| --- | --- | --- |
| Parent | Game rewards can be mistaken for learning evidence. | Runs/coins are separate from learning attempts, completions, and independent answers. Collisions never penalize learning scores. |
| Parent | Playback speed cannot turn synthetic Arabic into a human recording. | Added recording import, per-phrase files, previews, script/recording exports, local persistence, and fallback coverage. Enhanced local Arabic voices are preferred when available. |
| Parent | Background audio and exports need phone behavior. | Speech/recitation stop on background; games pause. Native share sheets support drawings, progress, and voice backups. No microphone permission or cloud upload. |
| Child | The supplied archive had Orbit Flight, but no runner. | Added Starlight Run with a tutorial, 12 finite encounters, large Jump/Duck buttons, swipe/keyboard control, and a gentle pace. |
| Child | Actions need distinct reactions. | Jump arc, articulated limbs, landing squash, duck silhouette, coin glow/sparkles, recoil and facial reaction, distinct sound patterns, and varied English/MSA coach captions. |
| Child | Motion and time pressure can exclude players. | Reduced-motion play waits for each action, offers retries, and has no lives to lose. Pause, exit, mute, and replay remain available. |
| Game developer | Frame rate/navigation can cause double hits or lingering activity. | Fixed-step simulation, one encounter per obstacle, buffered jump, bounded steps, one completion callback, and listener/animation cleanup. |
| Game developer | One embedded HTML was hard to maintain/package. | Separate content, UI, audio, runner, and voice-library modules; reproducible build, offline cache, native projects, and automated checks. |
| Education | Repeating one easy item could raise difficulty. | Automatic levels now require independent answers across at least four distinct items; the highest level requires ten, plus sufficient attempts/accuracy. Unfinished attempts remain in the denominator. These are practice heuristics, not mastery claims. |
| Education | Arabic pronunciation and presentation need care. | MSA coach script, language/direction metadata, whole-phrase recordings, and an educator review workflow. Existing phonics/recitation limitations remain explicit. |
| Accessibility | Small utility buttons and faint supporting text. | Minimum 44px utility targets, darker supporting text, larger runner controls, and a still alternative. Drawing retains a word-builder keyboard alternative. |

## Verified

- **34 browser scenarios** across desktop Chromium and an iPhone-sized Chromium viewport (17 per viewport). This is emulation, not Safari or a physical iPhone.
- **14 focused tests**: runner physics/collisions/frame rate/pause/completion; narrator priority, queuing, cancellation, mute, missing voices and validation; native share/lifecycle adapter.
- All **108 questions** checked for unique IDs and valid choices; original question/hint/explanation narration coverage checked. All four worlds complete full missions including a wrong answer and hint, with correct rewards/persistence.
- Mixed missions/partial exit, collection, builder tiles/hints/removal/next, drawing tools/export/clear, settings, parent gate, progress export/reset.
- Orbit Flight selection/hint/pause/completion; runner animated controls, Arabic captions, background pause, static full trail, retries, replay, and separate rewards.
- Voice import, preview, export, persistence, removal, malformed-file rejection. Tests use existing audio fixtures, **not** a new human voice pack.
- Real embedded Arabic and English playback completed with browser voices disabled; stop/mute verified. Offline reload and main-page mobile overflow checks passed.
- Android `assembleDebug` succeeded with Java 21 and SDK 35. APK signatures verified; embedded web modules match the final source. The APK has not been installed on a physical device here. iOS sources were generated/synced but not compiled on this Linux host.
- Direct file-URL testing is blocked by the managed browser policy here. The standalone HTML ran successfully through a local HTTP server on both layouts without script errors; opening it from disk remains a user-device check.
- Qur’an surah selection/repeat controls and a simulated offline audio failure. Live EveryAyah playback/repeat sequencing was not verified here.

The first run found test selectors that confused repeated question prompts and short numeric answers; selectors now use stable question IDs and exact values. A subsequent full 32-scenario run passed. The added adaptive-learning scenario passed on both viewports; affected voice/offline and flight/runner checks were rerun after final changes.

## Remaining acceptance work

The bundled Arabic clips are still synthetic. No human recording session or subjective naturalness evaluation has been completed. Supply/import cleared MSA recordings and have a fluent adult/educator review every line, especially letter names and vowel marks. New runner vocal cues fall back to captions without a matching recording/device voice; effects remain available.

Native installation, audio interruptions, file providers, real iOS rendering, VoiceOver/TalkBack, and device frame-rate/latency checks remain pending. See `MOBILE.md`. Browser tests do not certify every device or every setting combination.
