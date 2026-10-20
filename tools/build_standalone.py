#!/usr/bin/env python3
"""Builds single-file, offline versions of the games — no outside dependencies at all.

Outputs:
  bazikhaneh.html               the whole collection (home page + SPEEDI + UNDEAD + NAVA) in one file
  speedi/speedi-standalone.html
  zombie/zombie-standalone.html
  nava/nava-standalone.html

Everything a page loads (styles, scripts, fonts, logos, NAVA's piano samples and file-to-notes model) is
embedded. Binary files are stored base64 in inert <script> blocks and served to the game through a small
shim (fetch() and blob URLs), so the game code itself stays unchanged.

Usage:  python3 tools/build_standalone.py
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
GAMES = ('speedi', 'zombie', 'nava')

MIME = {
    '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream',
}
# files a game fetches at runtime (paths relative to the game folder)
RUNTIME = {
    'nava': lambda d: sorted(['vendor/basic-pitch.min.js', 'vendor/basic-pitch-model/model.json',
                              'vendor/basic-pitch-model/group1-shard1of1.bin']
                             + [f'piano/{p.name}' for p in (d / 'piano').glob('*.mp3')]),
}
HOME_MSG = 'bazikhaneh:home'

SHIM = r"""<script>
// Serves the embedded files: fetch() for runtime assets, blob URLs for images and scripts.
(() => {
  const store = {}, urls = {};
  document.querySelectorAll('script[type="application/x-asset"]').forEach(el => { store[el.dataset.path] = el; });
  const blob = path => {
    const el = store[path], bin = atob(el.textContent.trim()), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: el.dataset.mime });
  };
  const keyOf = input => {
    let u = typeof input === 'string' ? input : input && input.url;
    if (!u) return null;
    // inside a blob: page relative URLs cannot be resolved, so fall back to the raw string
    try { u = new URL(u, location.href).pathname; } catch (e) { u = u.split(/[?#]/)[0]; }
    try { u = decodeURIComponent(u); } catch (e) {}
    for (const k in store) if (u === k || u === '/' + k || u.endsWith('/' + k)) return k;
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


def b64(path):
    return base64.b64encode(path.read_bytes()).decode('ascii')


def data_uri(path):
    return f'data:{MIME[path.suffix]};base64,{b64(path)}'


def norm(rel):
    return rel.split('?')[0].split('#')[0]


def inline_css(css_path):
    css = css_path.read_text(encoding='utf-8')
    return re.sub(r'url\("([^"):]+)"\)', lambda m: f'url("{data_uri((css_path.parent / m.group(1)).resolve())}")', css)


def asset_block(key, path):
    return f'<script type="application/x-asset" data-path="{key}" data-mime="{MIME[path.suffix]}">{b64(path)}</script>'


def build_page(page, hub_home=False, extra=()):
    """Inline everything one HTML page needs. extra: runtime asset paths relative to the page's folder."""
    d = page.parent
    html = page.read_text(encoding='utf-8')
    html = re.sub(r'\s*<link rel="(?:manifest|preconnect)"[^>]*>', '', html)
    html = re.sub(r'(<link rel="(?:icon|apple-touch-icon)"[^>]*href=")([^"]+)"',
                  lambda m: f'{m.group(1)}{data_uri((d / norm(m.group(2))).resolve())}"', html)
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
                  lambda m: f'<style>\n{inline_css((d / norm(m.group(1))).resolve())}</style>', html)
    if hub_home:
        html = re.sub(r'<a class="home" href="\.\./">',
                      f'<a class="home" href="#" onclick="parent.postMessage(\'{HOME_MSG}\', \'*\'); return false;">', html)
    else:
        html = re.sub(r'\s*<a class="home"[^>]*>.*?</a>', '', html)

    images = sorted(set(norm(x) for x in re.findall(r'<img [^>]*src="([^"]+)"', html)))
    html = re.sub(r'(<img [^>]*)src="([^"]+)"', lambda m: f'{m.group(1)}data-asset="{norm(m.group(2))}"', html)
    blocks = [asset_block(k, (d / k).resolve()) for k in images] + [asset_block(k, d / k) for k in extra]

    scripts = re.findall(r'<script src="([^"]+)"></script>', html)
    for src in scripts:
        js = (d / norm(src)).read_text(encoding='utf-8')
        assert '</script' not in js.lower(), src  # would end the inline <script> early
    if blocks:
        anchor = f'<script src="{scripts[0]}"></script>' if scripts else '</body>'
        html = html.replace(anchor, '\n'.join(blocks) + '\n' + SHIM + '\n' + anchor, 1)
    html = re.sub(r'<script src="([^"]+)"></script>',
                  lambda m: f'<script>\n{(d / norm(m.group(1))).read_text(encoding="utf-8")}\n</script>', html)
    return html


def build_game(name, hub_home=False):
    d = ROOT / name
    return build_page(d / 'index.html', hub_home, RUNTIME.get(name, lambda _: [])(d))


LAUNCHER = r"""<script>
// Opens a game from the embedded copies in a full-screen frame; its "all games" link comes back here.
(() => {
  let frame = null, url = null;
  const open = name => {
    const el = document.querySelector(`script[type="application/x-game"][data-game="${name}"]`);
    if (!el || frame) return;
    const bin = atob(el.textContent.trim()), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: 'text/html;charset=utf-8' }));
    frame = document.createElement('iframe');
    frame.className = 'game-frame';
    frame.allow = 'fullscreen *; autoplay *'; // '*': a blob: frame of a file:// page has an opaque origin
    frame.allowFullscreen = true;
    frame.title = name;
    frame.src = url;
    document.body.appendChild(frame);
    document.body.classList.add('playing');
    frame.addEventListener('load', () => frame && frame.contentWindow.focus());
    if (location.hash !== '#' + name) history.pushState({ game: name }, '', '#' + name);
  };
  const close = () => {
    if (!frame) return;
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    frame.remove(); frame = null;
    URL.revokeObjectURL(url); url = null;
    document.body.classList.remove('playing');
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  };
  document.querySelectorAll('a[data-game]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); open(a.dataset.game); }));
  window.addEventListener('message', e => {
    if (e.data !== '""" + HOME_MSG + r"""' || !frame || e.source !== frame.contentWindow) return;
    if (history.state && history.state.game) history.back(); else close();
  });
  window.addEventListener('popstate', () => { const g = location.hash.slice(1); if (frame && !g) close(); else if (!frame && g) open(g); });
  if (location.hash.length > 1) open(location.hash.slice(1));
})();
</script>"""

FRAME_CSS = """<style>
  .game-frame { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; z-index: 100; background: #000; }
  body.playing { overflow: hidden; }
</style>"""


def build_bundle():
    html = build_page(ROOT / 'index.html')
    for g in GAMES:
        html = html.replace(f'href="{g}/"', f'href="#{g}" data-game="{g}"')
    games = '\n'.join(
        f'<script type="application/x-game" data-game="{g}">{base64.b64encode(build_game(g, True).encode()).decode()}</script>'
        for g in GAMES)
    html = html.replace('</head>', FRAME_CSS + '\n</head>', 1)
    return html.replace('</body>', games + '\n' + LAUNCHER + '\n</body>', 1)


def write(rel, text):
    out = ROOT / rel
    out.write_text(text, encoding='utf-8')
    print(f'{rel}: {out.stat().st_size / 1e6:.2f} MB')


def main():
    for g in GAMES:
        write(f'{g}/{g}-standalone.html', build_game(g))
    write('bazikhaneh.html', build_bundle())


if __name__ == '__main__':
    main()
