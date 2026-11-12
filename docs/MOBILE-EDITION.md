# Faroug’s Learning Galaxy · Adventure Edition

An offline family learning platform for web, Android and iOS: 108 questions across four worlds, 16 word-building activities, drawing, Orbit Flight, Starlight Run, a Qur’an garden, and parent progress controls.

## Play

Extract `downloads/Farougs-Learning-Galaxy-Adventure.zip` and open `Farougs-Learning-Galaxy.html` in Chrome or Edge. The hosted web version runs with `npm start` at http://localhost:4173. Lessons and bundled narration work offline; optional Qur’an recitation needs EveryAyah internet access.

Open **My adventures → Starlight Run**. Jump over rocks, duck under barriers, and collect coins using buttons, ↑/↓, or vertical swipes. Space jumps when a button is not focused; P pauses. Turn off **Gentle animations** for a still trail that waits for each action. Runs end after 12 encounters. Coins never change learning scores.

## Arabic narration

The requested style is **Modern Standard Arabic**. “Best available” prioritizes imported recordings, then an enhanced local Arabic voice if installed, then the original synthesized clips. The bundled clips have **not** been replaced with human recordings.

Open **Settings → Grown-up corner → A familiar Arabic voice** to import a pack or add recordings phrase by phrase. Export the script there, or use `artifacts/narration-script.json`. Record whole phrases with a native speaker and review pronunciation with an Arabic educator. Recordings persist locally and can be exported. No microphone permission, cloud upload, or API key is needed.

Runner feedback has varied English/MSA captions and optional spoken cues. New cues require imported recordings or a matching device voice; captions and effects work without them. The bundled 282 clips still cover the original learning narration.

## Develop

Requires Node 22+ and Python 3. Android needs a full Java 21 JDK and SDK 35; iOS needs Xcode and CocoaPods on macOS.

```sh
npm ci
npm run build
npm start
npm run test:unit
npm test
npm run mobile:sync
```

Tests use `/usr/bin/chromium`; set `CHROMIUM_PATH` for another installation. Source is in `app/`. The build creates `dist/`, a versioned offline cache, narration script, and standalone HTML.

Native projects: [Android](../android/) and [iOS](../ios/). Read the [mobile build instructions](MOBILE.md) and [review/test report](REVIEW.md). The original Voice Fix ZIP remains as a historical release.

## Data and rights

Nickname, progress, preferences, and imported recordings stay on this device/browser. No analytics, ads, or accounts. Selecting an online device voice or recitation may contact external services. Parent exports contain the nickname and practice history. Learning observations do not establish mastery or diagnose learning needs.

Bundled Arabic audio is **CC BY-NC-SA 4.0**, for personal, noncommercial use. Commercial/store distribution needs cleared replacement audio or permission. Importing recordings does not remove bundled assets from the build. See [voice attribution](../app/VOICE-LICENSES.md) and included licenses. Capacitor is MIT licensed.
