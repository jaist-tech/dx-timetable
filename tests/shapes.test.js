// 地図の線の形（public/data/route/shapes.json）の整合: 時刻表で隣り合う座標つきの停留所の組すべてに形があり，両端が停留所の座標から 400 m 以内（小松空港は道に結べる最寄りの点が約 300 m 離れる）こと
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..', 'public', 'data');
const J = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const stops = J('route/stops.json').stops, shapes = J('route/shapes.json').legs, aliases = J('routes.json').place_aliases || {};
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111200, (a[1] - b[1]) * 111200 * Math.cos(a[0] * Math.PI / 180));
const norm = n => String(n).replace(/\(折り返し\)/g, '').trim();

test('隣り合う停留所の組すべてに形があり，端が停留所の座標から 400 m 以内（小松空港は道に結べる最寄りの点が約 300 m 離れる）', () => {
  const man = J('manifest.json').regular, missing = [], far = [];
  for (const lst of Object.values(man)) {
    const f = lst.slice().sort((a, b) => a.valid_from < b.valid_from ? -1 : 1).pop().file;
    for (const r of J('regular/' + f).routes) {
      const kind = /^(ir_|ishikawa_)/.test(r.id) ? 'train' : 'bus';
      const al = (Object.entries(aliases).find(([k]) => r.id.startsWith(k.split('_')[0] + '_')) || [0, {}])[1];
      const ns = r.stops.map(norm).map(n => al[n] || n).filter(n => stops[n] && stops[n].lat != null);
      for (let i = 1; i < ns.length; i++) {
        const [a, b] = [ns[i - 1], ns[i]]; if (a === b) continue;
        let s = shapes[`${kind}|${a}|${b}`];
        if (!s && kind === 'train') s = (shapes[`${kind}|${b}|${a}`] || []).slice().reverse();
        if (!s || s.length < 2) { missing.push(`${kind}|${a}|${b}`); continue; }
        const A = [stops[a].lat, stops[a].lon], B = [stops[b].lat, stops[b].lon];
        if (dist(s[0], A) > 400 || dist(s[s.length - 1], B) > 400) far.push(`${kind}|${a}|${b}`);
      }
    }
  }
  assert.deepStrictEqual(missing, []);
  assert.deepStrictEqual(far, []);
});
