#!/usr/bin/env python3
"""Build offline data and a single-file game using only Python's standard library."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / 'game'

def build():
    data = json.loads((GAME / 'content.json').read_text(encoding='utf-8'))
    assert data['actions'] and data['situations'] and data['difficulty']
    payload = json.dumps(data, ensure_ascii=False, indent=2).replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    (GAME / 'js/content.js').write_text('/* Generated from content.json by scripts/build.py. No network required. */\nwindow.GAME_CONTENT = ' + payload + ';\n', encoding='utf-8')
    html = (GAME / 'index.html').read_text(encoding='utf-8')
    def style(match):
        css = (GAME / match[1].split('?')[0]).read_text(encoding='utf-8')
        return '<style>\n' + css + '\n</style>'
    def script(match):
        js = (GAME / match[1].split('?')[0]).read_text(encoding='utf-8')
        js = re.sub(r'</script', r'<\\/script', js, flags=re.IGNORECASE)
        return '<script>\n' + js + '\n</script>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/>', style, html)
    html = re.sub(r'<script src="([^"]+)"></script>', script, html)
    assert not re.search(r'<script\s+src=|<link rel="stylesheet"', html)
    (ROOT / 'play.html').write_text(html, encoding='utf-8')
    return len(data['situations']), len(html.encode('utf-8'))

if __name__ == '__main__':
    count, size = build()
    print(f'Built game/js/content.js and play.html: {count} situations, {size:,} bytes, no network dependencies.')
