#!/usr/bin/env python3
"""Builds nava/nava-standalone.html: the whole NAVA game in one HTML file with no outside dependencies.

Everything the game loads at runtime (style, scripts, font, logo, piano samples and the on-device
file-to-notes model) is embedded. Binary files are stored base64 in inert <script> blocks and served
to the game through a small fetch() shim, so the game code itself stays unchanged.

Usage:  python3 tools/build_nava_standalone.py
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'nava'
OUT = ROOT / 'nava-standalone.html'

MIME = {
    '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2',
    '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream',
}


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def b64(rel):
    return base64.b64encode((ROOT / rel).read_bytes()).decode('ascii')


def data_uri(rel):
    return f'data:{MIME[pathlib.Path(rel).suffix]};base64,{b64(rel)}'


def main():
    html = read('index.html')

    # links that only make sense next to the rest of the site
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
    html = re.sub(r'\s*<a class="home"[^>]*>.*?</a>', '', html)
    fav = data_uri('brand/favicon.png')
    html = html.replace('href="brand/favicon.png"', f'href="{fav}"')

    # stylesheet with the font inlined
    css = read('style.css').replace('url("fonts/Vazirmatn.woff2")', f'url("{data_uri("fonts/Vazirmatn.woff2")}")')
    html = re.sub(r'<link rel="stylesheet" href="style\.css[^"]*">', lambda _: f'<style>\n{css}</style>', html)

    # images: each file is embedded once and filled in by the shim
    html = re.sub(r'src="(brand/[^"]+)"', r'data-asset="\1"', html)

    assets = sorted(['brand/logo.webp', 'brand/mark.webp', 'vendor/basic-pitch.min.js',
                     'vendor/basic-pitch-model/model.json', 'vendor/basic-pitch-model/group1-shard1of1.bin']
                    + [f'piano/{p.name}' for p in (ROOT / 'piano').glob('*.mp3')])
    blocks = '\n'.join(
        f'<script type="application/x-nava-asset" data-path="{a}" data-mime="{MIME[pathlib.Path(a).suffix]}">{b64(a)}</script>'
        for a in assets)

    shim = r"""<script>
// Serves the embedded files: fetch() for the piano samples and the model, blob URLs for images and scripts.
(() => {
  const store = {}, urls = {};
  document.querySelectorAll('script[type="application/x-nava-asset"]').forEach(el => { store[el.dataset.path] = el; });
  const blob = path => {
    const el = store[path], bin = atob(el.textContent.trim()), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: el.dataset.mime });
  };
  const keyOf = input => {
    let u = typeof input === 'string' ? input : input && input.url;
    if (!u) return null;
    try { u = decodeURIComponent(new URL(u, location.href).pathname); } catch (e) { return null; }
    for (const k in store) if (u === '/' + k || u.endsWith('/' + k)) return k;
    return null;
  };
  window.navaAssetURL = path => urls[path] || (urls[path] = URL.createObjectURL(blob(path)));
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const k = keyOf(input);
    return k ? Promise.resolve(new Response(blob(k), { status: 200, headers: { 'Content-Type': store[k].dataset.mime } })) : realFetch(input, init);
  };
  document.querySelectorAll('img[data-asset]').forEach(img => { img.src = window.navaAssetURL(img.dataset.asset); });
})();
</script>"""

    def inline(m):
        return f'<script>\n{read(m.group(1))}\n</script>'
    scripts = re.findall(r'<script src="[^"]+"></script>', html)
    first = html.index(scripts[0])
    html = html[:first] + blocks + '\n' + shim + '\n' + html[first:]
    html = re.sub(r'<script src="([^"?]+)(?:\?[^"]*)?"></script>', inline, html)

    for js in ('audio.js', 'songs.js', 'convert.js', 'game.js'):
        assert '</script' not in read(js).lower(), js  # would end the inline <script> early
    OUT.write_text(html, encoding='utf-8')
    print(f'{OUT.relative_to(ROOT.parent)}: {OUT.stat().st_size / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
