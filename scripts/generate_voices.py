"""Generate the complete offline narration pack from the game's reviewed text corpus.

Requires sherpa-onnx==1.13.8, soundfile and ffmpeg. Models are separate build inputs;
they are never shipped with the game. The high Arabic voice is noncommercial.

Example: PYTHONPATH=/path/to/python-tools python3 scripts/generate_voices.py \
  --models /workspace/neural-models --lang ar
Run once per language, then --pack-only to rebuild the inlined manifest.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
import time
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SOURCE = {
    'en': {
        'model': 'kokoro-multi-lang-v1_0',
        'archive': 'kokoro.tar.bz2',
        'url': 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2',
        'sha256': '60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4',
        'voice': 'Kokoro v1.0 · af_heart · American English',
        'license': 'Apache-2.0',
    },
    'ar': {
        'model': 'vits-piper-ar_JO-SA_miro_V2-high',
        'archive': 'miro-high.tar.bz2',
        'url': 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ar_JO-SA_miro_V2-high.tar.bz2',
        'sha256': '2afdb963a8e314a31362faf197ce6c25eb659d9279061616645e2452d22054de',
        'voice': 'SA miro V2 high · Arabic',
        'license': 'CC-BY-NC-SA-4.0',
    },
}

# The manifest still keys the exact displayed/requested line. These are build-time
# pronunciation inputs, not extra answers or changes to the lesson wording.
ARABIC_PRONUNCIATION = {
    'مرحبًا يا صديقي. هيا نتعلم معًا.': 'مَرْحَبًا يَا صَدِيقِي. هَيَّا نَتَعَلَّمُ مَعًا.',
    'بَطَّة. تبدأ كلمة بَطَّة بحرف الباء. بَ.': 'بَطَّةٌ. تَبْدَأُ كَلِمَةُ بَطَّةٍ بِحَرْفِ الْبَاءِ. بَ.',
    'أحسنت! لقد وجدت الإجابة.': 'أَحْسَنْتَ! لَقَدْ وَجَدْتَ الْإِجَابَةَ.',
    'رائع! فكرت جيدًا.': 'رَائِعٌ! فَكَّرْتَ جَيِّدًا.',
    'عمل جميل! لنكمل الاكتشاف.': 'عَمَلٌ جَمِيلٌ! لِنُكْمِلِ الِاكْتِشَافَ.',
    'أحسنت! واصلت المحاولة حتى وجدت الإجابة.': 'أَحْسَنْتَ! وَاصَلْتَ الْمُحَاوَلَةَ حَتَّى وَجَدْتَ الْإِجَابَةَ.',
    'بعض المساعدة واكتشاف جديد. عمل جميل!': 'بَعْضُ الْمُسَاعَدَةِ وَاكْتِشَافٌ جَدِيدٌ. عَمَلٌ جَمِيلٌ!',
    'محاولة جيدة. لننظر إلى التلميح معًا.': 'مُحَاوَلَةٌ جَيِّدَةٌ. لِنَنْظُرْ إِلَى التَّلْمِيحِ مَعًا.',
    'لا بأس. لنجرب فكرة أخرى.': 'لَا بَأْسَ. لِنُجَرِّبْ فِكْرَةً أُخْرَى.',
    'خذ وقتك. يمكنك المحاولة مرة أخرى.': 'خُذْ وَقْتَكَ. يُمْكِنُكَ الْمُحَاوَلَةُ مَرَّةً أُخْرَى.',
    'لقد تعلمت أشياء جميلة! كانت مغامرة رائعة معًا.': 'لَقَدْ تَعَلَّمْتَ أَشْيَاءَ جَمِيلَةً! كَانَتْ مُغَامَرَةً رَائِعَةً مَعًا.',
}
ARABIC_LETTER_NAMES = {
    'ب':'الْبَاءِ', 'ت':'التَّاءِ', 'م':'الْمِيمِ', 'س':'السِّينِ',
    'ف':'الْفَاءِ', 'ن':'النُّونِ', 'د':'الدَّالِ',
}


def pronunciation_text(text, lang):
    if lang != 'ar':
        return text
    overrides = {normalize(k): v for k, v in ARABIC_PRONUNCIATION.items()}
    result = overrides.get(normalize(text), text)
    # Expand a named target letter, preserving isolated vowel/sound exercises.
    return re.sub(r'(حَرْف[ُِ]?\s+)([بتمسفند])(?=[\s.؟:]|$)',
        lambda m: m[1] + ARABIC_LETTER_NAMES[m[2]], result)


def normalize(text):
    return ' '.join(unicodedata.normalize('NFKC', text).split())


def verify_archive(models, lang):
    spec = SOURCE[lang]
    path = models / spec['archive']
    if not path.is_file():
        raise FileNotFoundError(f'Obtain {spec["url"]} as {path}; expected SHA256 {spec["sha256"]}')
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != spec['sha256']:
        raise ValueError(f'Model archive checksum mismatch: {path}')


def make_engine(models, lang, threads):
    import sherpa_onnx
    spec = SOURCE[lang]
    d = models / spec['model']
    if lang == 'en':
        # Official Sherpa-ONNX generate_voices_bin.py maps af_heart to speaker ID 3.
        voices = (d / 'voices.bin')
        model = sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=str(d / 'model.onnx'), voices=str(voices),
                tokens=str(d / 'tokens.txt'), data_dir=str(d / 'espeak-ng-data'),
                lexicon=str(d / 'lexicon-us-en.txt'), lang='en-us'), num_threads=threads)
    else:
        data = d / 'espeak-ng-data'
        model = sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(d / 'ar_JO-SA_miro_V2-high.onnx'),
                tokens=str(d / 'tokens.txt'), data_dir=str(data)), num_threads=threads)
    config = sherpa_onnx.OfflineTtsConfig(model=model, max_num_sentences=1)
    if not config.validate():
        raise ValueError('Invalid model configuration')
    return sherpa_onnx.OfflineTts(config)


def generate(args):
    import numpy as np
    import soundfile as sf
    verify_archive(args.models, args.lang)
    engine = make_engine(args.models, args.lang, args.threads)
    lines = json.loads((ROOT / 'voice-lines.json').read_text())
    dest = ROOT / 'assets' / 'narration'
    dest.mkdir(parents=True, exist_ok=True)
    chosen = [x for x in lines if x['lang'] == args.lang][args.start:args.end]
    started = time.time()
    for index, item in enumerate(chosen):
        out = dest / (item['id'] + '.mp3')
        if out.is_file() and out.stat().st_size > 500 and not args.overwrite:
            continue
        audio = engine.generate(pronunciation_text(item['text'], args.lang),
            sid=3 if args.lang == 'en' else 0, speed=0.9 if args.lang == 'ar' else 1.0)
        samples = np.asarray(audio.samples, dtype=np.float32)
        if not len(samples) or not np.isfinite(samples).all():
            raise ValueError(f'Invalid audio: {item["key"]}')
        peak = float(np.max(np.abs(samples)))
        if peak < 0.001:
            raise ValueError(f'Silent audio: {item["key"]}')
        # A little headroom prevents clipping; keep neural prosody and tempo intact.
        samples = samples * min(1.8, 0.90 / peak)
        with tempfile.TemporaryDirectory(prefix='.galaxy-voice-', dir=dest) as td:
            wav = Path(td) / 'clip.wav'
            sf.write(wav, samples, audio.sample_rate, subtype='PCM_16')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav),
                '-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-map_metadata', '-1', str(Path(td) / 'clip.mp3')], check=True)
            os.replace(Path(td) / 'clip.mp3', out)
        if (index + 1) % 10 == 0 or index + 1 == len(chosen):
            print(f'{args.lang}: {index+1}/{len(chosen)} clips · {time.time()-started:.1f}s', flush=True)
    print(f'{args.lang}: complete', flush=True)


def pack():
    lines = json.loads((ROOT / 'voice-lines.json').read_text())
    clips = {}
    total_bytes = 0
    for item in lines:
        key = item['lang'] + '|' + normalize(item['text'])
        if key != item['key']:
            raise ValueError('Corpus normalization mismatch')
        data = (ROOT / 'assets' / 'narration' / (item['id'] + '.mp3')).read_bytes()
        if len(data) < 500:
            raise ValueError(f'Empty audio: {item["id"]}')
        clips[key] = 'data:audio/mpeg;base64,' + base64.b64encode(data).decode('ascii')
        total_bytes += len(data)
    result = {'version':1, 'revision':3, 'buildId':'galaxy-voice-2026-11-08-r3', 'provider':'Offline neural synthesis',
        'label':'Nova · embedded English & Arabic neural narration',
        'voices': {lang:info['voice'] for lang,info in SOURCE.items()},
        'licenses': {lang:info['license'] for lang,info in SOURCE.items()},
        'sources':SOURCE, 'pronunciation':{'ar':'Vocalized Arabic; named letters expanded; synthesis speed 0.9'}, 'clips':clips}
    out = ROOT / 'voice-pack.js'
    out.write_text('/* Generated neural narration. Arabic: personal/noncommercial use; see NARRATION-LICENSES.md. */\nwindow.GALAXY_VOICE_PACK = ' + json.dumps(result, ensure_ascii=False, separators=(',',':')) + ';\n')
    print(f'Pack: {len(clips)} clips, {total_bytes:,} MP3 bytes, {out.stat().st_size:,} JS bytes', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--models', type=Path, default=Path('/workspace/neural-models'))
    parser.add_argument('--lang', choices=['en','ar'], default='en')
    parser.add_argument('--threads', type=int, default=2)
    parser.add_argument('--start', type=int, default=0, help='Optional starting item for parallel shard generation')
    parser.add_argument('--end', type=int, default=None, help='Exclusive final item for nonoverlapping parallel shards')
    parser.add_argument('--overwrite', action='store_true')
    parser.add_argument('--pack-only', action='store_true')
    parser.add_argument('--no-pack', action='store_true')
    args = parser.parse_args()
    if not args.pack_only:
        generate(args)
    if args.pack_only or not args.no_pack:
        pack()
