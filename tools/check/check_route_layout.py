# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.58.0"]
# ///
"""route.html の検索欄を 3 つの幅で撮り，文字の切れ・欄どうしの重なり・横はみ出しを検査する．
使い方: uv run tools/check/check_route_layout.py [出力先ディレクトリ]
ヘッドレス Chrome の置き場は環境変数 CHROME_DIR（chrome-linux64 と chromelibs がある場所）で指定する．"""
import functools, http.server, os, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2] / "public"
S = Path(os.environ.get("CHROME_DIR", "/tmp/claude-1004/-home-msato-project-claude-dev/f4ddcead-9f56-40a4-a7b0-5371f8dacef1/scratchpad"))
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/route-layout")
OUT.mkdir(parents=True, exist_ok=True)
env = {**os.environ, "LD_LIBRARY_PATH": f"{S}/chromelibs/usr/lib/x86_64-linux-gnu:{S}/chromelibs/lib/x86_64-linux-gnu"}

JS = """() => {
  const bad = [];
  const card = document.querySelector('#rt-form');
  const cr = card.getBoundingClientRect();
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('ページが横にはみ出す');
  const boxes = [...card.querySelectorAll('input:not([type=checkbox]),select,button,summary')]
    .filter(e => e.checkVisibility()).map(e => ({e, r: e.getBoundingClientRect()}));
  for (const {e, r} of boxes) {
    const n = e.id || e.className || e.tagName;
    if (r.left < cr.left - 1 || r.right > cr.right + 1) bad.push('カードからはみ出す: ' + n);
    if (e.tagName === 'INPUT' && e.scrollWidth > e.clientWidth + 1) bad.push('入力欄の文字が切れる: ' + n);
    if (e.tagName === 'SELECT') {            // 選択中の文字が切れていないか
      const cs = getComputedStyle(e), c = document.createElement('canvas').getContext('2d');
      c.font = cs.font;
      const w = c.measureText(e.options[e.selectedIndex].text).width;
      const avail = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (w > avail + 1) bad.push('選択の文字が切れる: ' + n + ' ' + Math.round(w) + '>' + Math.round(avail));
    }
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r;
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 1 && oy > 1) bad.push('重なる: ' + (boxes[i].e.id || boxes[i].e.className) + ' × ' + (boxes[j].e.id || boxes[j].e.className));
  }
  // 出発・到着の入力欄と地図ボタンの上下の中心がそろっているか
  for (const k of ['from', 'to']) {
    const i = document.getElementById('rt-' + k).getBoundingClientRect(), p = document.querySelector('[data-pick=' + k + ']').getBoundingClientRect();
    if (Math.abs((i.top + i.bottom) / 2 - (p.top + p.bottom) / 2) > 2) bad.push('地図ボタンが入力欄とずれる: ' + k);
  }
  return bad;
}"""

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
port = srv.server_address[1]

fail = 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=str(S / "chrome-linux64/chrome"), env=env, args=["--no-sandbox", "--disable-gpu"])
    for name, w, h in (("sp320", 320, 700), ("sp375", 375, 800), ("tablet", 768, 900), ("pc", 1280, 800)):
        for theme in ("light", "dark"):
            pg = b.new_page(viewport={"width": w, "height": h})
            pg.add_init_script(f"localStorage.setItem('theme','{theme}')")
            pg.goto(f"http://127.0.0.1:{port}/route.html"); pg.wait_for_timeout(1500)
            bad = pg.evaluate(JS)
            pg.screenshot(path=str(OUT / f"{name}-{theme}.png"))
            print(f"{name} {w}px {theme}: {'OK' if not bad else bad}")
            fail += len(bad)
            pg.close()
    b.close()
srv.shutdown()
print("画像:", OUT)
sys.exit(1 if fail else 0)
