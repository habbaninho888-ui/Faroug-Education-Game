# Embedded neural narration — attribution and use

These clips are synthetic neural speech generated locally from the game's own educational text. They are not a human actor recording. The game plays complete, pre-generated MP3 files, so no device voice, installed Arabic language pack, internet speech endpoint, API key, or microphone is required for its bundled English and Arabic narration. Qur'an recitation is a separate authentic-recording feature and was not synthesized.

## English

- Model: **Kokoro-82M v1.0**, by **hexgrad and Kokoro contributors**.
- Voice: **af_heart**, speaker ID 3 in the official Sherpa-ONNX voice map; US English.
- Model source: <https://huggingface.co/hexgrad/Kokoro-82M>.
- Verified conversion/build input: <https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2>.
- SHA-256: `60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4`.
- Model license: **Apache License 2.0**. Copy: [Kokoro-Apache-2.0.txt](assets/narration/licenses/Kokoro-Apache-2.0.txt).

## Arabic

- Model: **SA miro V2 high**, maintained by **OpenVoiceOS / TigreGotico** and converted for Sherpa-ONNX.
- Source model: <https://huggingface.co/OpenVoiceOS/phoonnx_ar-SA_miro_espeak_V2>.
- Source dataset metadata: `TigreGotico/tts-train-synthetic-miro_ar-diacritics`.
- Verified conversion/build input: <https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ar_JO-SA_miro_V2-high.tar.bz2>.
- SHA-256: `2afdb963a8e314a31362faf197ce6c25eb659d9279061616645e2452d22054de`.
- License stated in the archive: **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**. Copy: [Arabic-CC-BY-NC-SA-4.0.txt](assets/narration/licenses/Arabic-CC-BY-NC-SA-4.0.txt).
- This personalized family-game edition includes the Arabic audio for **personal, noncommercial use**, retaining attribution and the same notice. Commercial distribution requires replacing this voice with one cleared for commercial use or obtaining the necessary rights. The model weights are not distributed with the game.

## Processing and playback

The generation scripts use **Sherpa-ONNX 1.13.8** (Apache 2.0), a model-compatible CPU runtime. MP3 audio is encoded at 64 kbps mono with FFmpeg. English uses synthesis speed 1.0 and Arabic uses 0.9; samples receive limited peak normalization to leave headroom. Each clip corresponds to a complete question, hint, explanation, model example, preview, coaching message, or builder word in `voice-lines.json`.

Revision 3 contains 300 complete clips (233 English and 67 Arabic). The Arabic build uses vocalized pronunciation inputs for previews and coaching messages, and reads named target letters as their full names, such as `حرف الباء`. Isolated letter/vowel sound exercises retain their syllable inputs. The generation-only overrides are recorded in `scripts/generate_voices.py`; the original displayed text remains the lookup key. These pronunciation inputs are not used for Qur'an text or recitation.

Model archives were fetched through the configured platform proxy with TLS verification enabled, and each archive was checked against its SHA-256 digest published on the official GitHub release before use. Models and generation dependencies are build inputs outside the repository and are not included in the downloadable game.

Neural narration can still make pronunciation errors, especially isolated letter/vowel fragments or punctuation-heavy patterns. It is not a phonics recording, a pronunciation grader, or a formal Arabic-recitation tool. Review both language previews and learning examples with a grown-up.
