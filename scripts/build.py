"""Build a dependency-free, self-contained HTML edition from the maintained sources."""
from pathlib import Path
import base64
import json
import re

ROOT = Path(__file__).resolve().parents[1]

def asset_uri(name):
    path = ROOT / name
    return 'data:image/svg+xml;base64,' + base64.b64encode(path.read_bytes()).decode()


def inline_assets(text):
    return re.sub(r'assets/[a-z-]+\.svg', lambda m: asset_uri(m.group()), text)


def build():
    pack_source = (ROOT / 'voice-pack.js').read_text()
    manifest = json.loads(re.search(r'window\.GALAXY_VOICE_PACK\s*=\s*(\{.*\});', pack_source, re.S).group(1))
    corpus = json.loads((ROOT / 'voice-lines.json').read_text())
    missing = [item['key'] for item in corpus if item['key'] not in manifest['clips']]
    if missing:
        raise ValueError(f'Incomplete narration pack: {len(missing)} missing lines')
    html = (ROOT / 'index.html').read_text()
    css = inline_assets((ROOT / 'styles.css').read_text())
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
    for name in ['content.js', 'orbit.js', 'vendor/three.min.js', 'runner.js', 'quran-data.js', 'quran.js', 'feedback.js', 'voice-pack.js', 'narration.js', 'app.js']:
        js = (ROOT / name).read_text()
        if name == 'app.js':
            assets = {p.name: asset_uri('assets/' + p.name) for p in (ROOT / 'assets').glob('*.svg')}
            js = 'const GALAXY_ASSETS = ' + json.dumps(assets) + ';\n' + re.sub(r'assets/\$\{([^}]+)\}', r'${GALAXY_ASSETS[\1]}', js)
        js = inline_assets(js)
        js = re.sub(r'</script', r'<\\/script', js, flags=re.I)
        html = html.replace(f'<script src="{name}"></script>', '<script>\n' + js + '\n</script>')
    html = inline_assets(html)
    notices = []
    for relative in ['vendor/THREE-LICENSE.txt', 'assets/quran/license', 'NARRATION-LICENSES.md']:
        path = ROOT / relative
        if path.is_file(): notices.append(relative + '\n' + path.read_text().replace('-->', '-- >'))
    html = html.replace('</head>', '<!-- THIRD-PARTY ATTRIBUTION AND LICENSE NOTICES\n' + '\n\n'.join(notices) + '\n-->\n</head>')
    out = ROOT / 'dist' / 'Farougs-Learning-Galaxy.html'
    out.parent.mkdir(exist_ok=True)
    out.write_text(html)
    edition = out.with_name('Farougs-Learning-Galaxy-Adventure-Edition.html')
    edition.write_text(html)
    print(f'Built {edition.name}: {out.stat().st_size:,} bytes')
    return out

if __name__ == '__main__':
    build()
