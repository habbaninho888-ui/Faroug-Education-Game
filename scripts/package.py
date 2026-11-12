"""Package the playable edition and reviewable mobile/web source."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import subprocess

root = Path(__file__).resolve().parent.parent
downloads = root / 'downloads'
downloads.mkdir(exist_ok=True)
with ZipFile(downloads / 'Farougs-Learning-Galaxy-Adventure.zip', 'w', ZIP_DEFLATED) as z:
    z.write(root / 'artifacts/Farougs-Learning-Galaxy.html', 'Farougs-Learning-Galaxy.html')
    z.write(root / 'artifacts/narration-script.json', 'narration-script.json')
    z.write(root / 'app/VOICE-LICENSES.md', 'VOICE-LICENSES.md')
    for p in (root / 'app/licenses').iterdir():
        z.write(p, 'licenses/' + p.name)
    for name in ['MOBILE.md', 'MOBILE-EDITION.md', 'REVIEW.md']:
        z.write(root / 'docs' / name, name)
    z.writestr('START-HERE.txt', '''Faroug's Learning Galaxy - Adventure Edition

1. Extract this ZIP. Open Farougs-Learning-Galaxy.html in Chrome or Edge.
2. Open My adventures > Starlight Run to jump, duck, and gather coins.
3. Tap a sound control or activity to enable audio.
4. For still play, turn off Gentle animations in Settings.

Human Modern Standard Arabic recordings are not included. Best available uses
your imported recordings, enhanced local Arabic voices when available, then
the original synthetic clips. In the grown-up corner, add recordings or import
a voice pack. narration-script.json contains the full recording script.

Core games and bundled narration work offline. Qur'an recitation needs internet.
Progress stays in this browser; export from the grown-up corner for backup.
Bundled Arabic clips are for personal, noncommercial use. See VOICE-LICENSES.md.
Read REVIEW.md for changes, tests, and remaining voice/device validation.
''')

files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
with ZipFile(downloads / 'Farougs-Learning-Galaxy-Mobile-Source.zip', 'w', ZIP_DEFLATED) as z:
    for name in sorted(set(files)):
        if not name or name.startswith(('downloads/', 'artifacts/')) or name == 'SHA256SUMS':
            continue
        p = root / name
        if p.is_file():
            z.write(p, 'Farougs-Learning-Galaxy/' + name)

digests = []
for p in sorted(downloads.iterdir()):
    if p.is_file():
        digests.append(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  downloads/{p.name}')
(root / 'SHA256SUMS').write_text('\n'.join(digests) + '\n')
print('\n'.join(digests))
