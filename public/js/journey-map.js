// ===== route.html: 経路の地図（バス・電車・人の記号が時刻に合わせて動く）=====
// 時刻は 1 つの時計（行程の出発〜到着，分単位）で進め，バス・電車・徒歩・待機のどれも同じ縮尺にする．
// 徒歩の区間の長さは planner が歩く速さから決めた分数（leg.minutes）であるため，その時間で線に沿って進む．
// 乗換の待ちの間は，人の記号が直前の停留所・駅に止まる．
(function () {
  'use strict';
  Object.assign(TRANSLATIONS.ja, { 'route.map': '地図で見る', 'route.mapPlay': '再生', 'route.mapPause': '停止' });
  Object.assign(TRANSLATIONS.en, { 'route.map': 'Show on map', 'route.mapPlay': 'Play', 'route.mapPause': 'Pause' });
  const SEC_PER_MIN = 0.5, MIN_SEC = 8; // 1 分を 0.5 秒で再生（短い行程は 8 秒以上）
  const COLORS = { bus: '#43A047', train: '#1976D2', walk: '#E65100' };
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4v16l14-8z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

  function coordOf(day, name, q) {
    if (name === '出発地' && q.from && typeof q.from.lat === 'number') return [q.from.lat, q.from.lon];
    if (name === '目的地' && q.to && typeof q.to.lat === 'number') return [q.to.lat, q.to.lon];
    const i = day.placeIdx.get(name), c = i != null ? day.coords[i] : null;
    return c ? [c.lat, c.lon] : null;
  }
  const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

  // 停留所の隣り合う組ごとの道・線路に沿った形（data/route/shapes.json．tools/route/build_shapes.py が作る）．無いときは直線
  let shapesP = null;
  function loadShapes() {
    if (!shapesP) shapesP = fetch('data/route/shapes.json').then(r => (r.ok ? r.json() : null)).then(d => (d && d.legs) || {}).catch(() => ({}));
    return shapesP;
  }
  const dkm = (a, b) => Math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * Math.cos(a[0] * Math.PI / 180));
  // 隣り合う 2 停留所 a→b（時刻 ta→tb）の間を形に沿った点列にする．時刻は道のりに比例して割り振る（形が無ければ直線の 2 点）
  // 通過する停留所がある便（a と b が時刻表で隣り合わない）は，隣り合う組の形を幅優先でつなぐ（バスは 6 区間まで）
  const adjCache = new WeakMap();
  function chain(kind, a, b, shapes) {
    let adj = adjCache.get(shapes); if (!adj) adjCache.set(shapes, adj = {});
    if (!adj[kind]) {
      const m = adj[kind] = new Map();
      for (const k of Object.keys(shapes)) {
        const [kd, x, y] = k.split('|'); if (kd !== kind) continue;
        (m.get(x) || m.set(x, []).get(x)).push([y, k, false]);
        if (kind === 'train') (m.get(y) || m.set(y, []).get(y)).push([x, k, true]);
      }
    }
    const prev = new Map([[a, null]]), q = [a], lim = kind === 'train' ? 99 : 6, depth = new Map([[a, 0]]);
    while (q.length && !prev.has(b)) {
      const u = q.shift(); if (depth.get(u) >= lim) continue;
      for (const [v, k, rev] of adj[kind].get(u) || []) if (!prev.has(v)) { prev.set(v, [u, k, rev]); depth.set(v, depth.get(u) + 1); q.push(v); }
    }
    if (!prev.has(b)) return null;
    const parts = []; for (let v = b; prev.get(v); v = prev.get(v)[0]) { const [, k, rev] = prev.get(v); parts.unshift(rev ? shapes[k].slice().reverse() : shapes[k]); }
    return parts.reduce((acc, p) => acc.concat(acc.length ? p.slice(1) : p), []);
  }
  function expand(kind, a, b, shapes) {
    let path = shapes[`${kind}|${a.name}|${b.name}`];
    if (!path) { const r = shapes[`${kind}|${b.name}|${a.name}`]; path = r && kind === 'train' ? r.slice().reverse() : null; }   // 鉄道は往復で同じ線路
    if (!path) path = chain(kind, a.name, b.name, shapes);
    if (!path) { const r = shapes[`${kind}|${b.name}|${a.name}`]; path = r && r.slice().reverse(); }   // バスは一方通行があるため最後の手段（道が少し違っても直線よりよい）
    if (!path || path.length < 2) return [[b.time, b.c]];
    path = [a.c].concat(path.slice(1, -1), [b.c]);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dkm(path[i - 1], path[i]));
    const tot = cum[cum.length - 1] || 1;
    return path.slice(1).map((c, i) => [a.time + (b.time - a.time) * (cum[i + 1] / tot), c]);
  }

  // 区間ごとに，[時刻, 座標] の折れ線（時刻の昇順）を作る．座標の無い停留所は前後から補間される
  function buildTracks(j, day, q, shapes) {
    return j.legs.map(l => {
      let pts;
      if (l.type === 'walk') pts = [[l.dep, coordOf(day, l.from, q)], [l.arr, coordOf(day, l.to, q)]];
      else {
        pts = l.stops.map(s => [s.time, coordOf(day, s.name, q)]);
        if (!pts.length) pts = [[l.dep, coordOf(day, l.from, q)], [l.arr, coordOf(day, l.to, q)]];
      }
      let known = pts.filter(p => p[1]);
      if (l.type === 'trip' && l.stops.length && known.length >= 2) {   // 道・線路の形に沿わせる
        const st = l.stops.map(x => ({ name: x.name, time: x.time, c: coordOf(day, x.name, q) })).filter(x => x.c);
        known = [[st[0].time, st[0].c]];
        for (let i = 1; i < st.length; i++) known.push(...expand(l.kind, st[i - 1], st[i], shapes));
      }
      return { leg: l, pts: known.length >= 2 ? known : null, all: pts };
    });
  }
  function posAt(track, t) {
    const p = track.pts;
    if (!p) return null;
    if (t <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (t <= p[i][0]) { const d = p[i][0] - p[i - 1][0]; return lerp(p[i - 1][1], p[i][1], d > 0 ? (t - p[i - 1][0]) / d : 1); }
    }
    return p[p.length - 1][1];
  }
  function endPos(tracks, k) {          // k 番目の区間の終点（待機中の位置）
    const p = tracks[k].pts; return p ? p[p.length - 1][1] : null;
  }

  function attach(box, j, net, date, q, onFail) {
    let inner = null, dead = false;
    loadShapes().then(shapes => { if (!dead) inner = attachWith(box, j, net, date, q, onFail, shapes); });
    return { destroy() { dead = true; if (inner) inner.destroy(); } };
  }
  function attachWith(box, j, net, date, q, onFail, shapes) {
    const day = net.day(date), tracks = buildTracks(j, day, q, shapes);
    const t0 = j.legs[0].dep, t1 = j.legs[j.legs.length - 1].arr;
    const dur = Math.max(MIN_SEC, (t1 - t0) * SEC_PER_MIN) * 1000;
    box.innerHTML = '<div class="jm-map"></div><div class="jm-bar"><button type="button" class="jm-play"></button><input type="range" class="jm-slider" min="0" max="1000" value="0"><span class="jm-clock"></span></div>';
    const el = box.querySelector('.jm-map'), btn = box.querySelector('.jm-play'), sl = box.querySelector('.jm-slider'), clk = box.querySelector('.jm-clock');
    const map = L.map(el, { center: [36.5, 136.57], zoom: 11, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 18 }).addTo(map);
    const all = [];
    tracks.forEach(tr => {
      if (!tr.pts) return;
      const kind = tr.leg.type === 'walk' ? 'walk' : tr.leg.kind;
      const ll = tr.pts.map(p => p[1]); all.push(...ll);
      L.polyline(ll, { color: COLORS[kind], weight: kind === 'walk' ? 3 : 5, opacity: .75, dashArray: kind === 'walk' ? '2 7' : kind === 'train' ? '8 4' : null }).addTo(map);
      if (tr.leg.type === 'trip') {
        [tr.pts[0][1], ll[ll.length - 1]].forEach(c => L.marker(c, { icon: MapIcons.stop(kind, COLORS[kind], 20), keyboard: false }).addTo(map));
      }
    });
    if (!all.length) { onFail && onFail(); return { destroy() { map.remove(); } }; }
    map.fitBounds(all, { padding: [30, 30], maxZoom: 15 });
    setTimeout(() => map.invalidateSize(), 50);

    let state = '', marker = null, frac = 0, playing = false, last = 0, raf = 0;
    function render(f) {
      const t = t0 + (t1 - t0) * f;
      let st = 'wait', pos = null;
      for (let k = 0; k < tracks.length; k++) {
        const tr = tracks[k], l = tr.leg;
        if (t >= l.dep && t <= l.arr && tr.pts) { st = l.type === 'walk' ? 'walk' : l.kind; pos = posAt(tr, t); break; }
        if (t > l.arr) pos = endPos(tracks, k) || pos;           // 直前の区間の終点で待つ
        else if (k === 0) pos = tr.pts ? tr.pts[0][1] : pos;
      }
      if (!pos) return;
      if (st !== state) {
        state = st;
        const icon = st === 'bus' ? MapIcons.bus(COLORS.bus, 38) : st === 'train' ? MapIcons.train(COLORS.train, 38) : MapIcons.person(st === 'walk', 32);
        if (marker) marker.setIcon(icon); else marker = L.marker(pos, { icon, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      }
      marker.setLatLng(pos);
      clk.textContent = Planner.fmtTime(Math.round(t));
      sl.value = Math.round(f * 1000);
    }
    function tick(ts) {
      if (!playing) return;
      if (last && ts - last < 33) { raf = requestAnimationFrame(tick); return; }   // 約 30fps（スマホの負荷を抑える）
      frac = Math.min(1, frac + (last ? ts - last : 0) / dur); last = ts;
      render(frac);
      if (frac >= 1) return setPlaying(false);
      raf = requestAnimationFrame(tick);
    }
    function setPlaying(p) {
      playing = p; last = 0;
      btn.innerHTML = p ? ICON_PAUSE : ICON_PLAY; btn.title = t(p ? 'route.mapPause' : 'route.mapPlay');
      if (p) { if (frac >= 1) frac = 0; raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
    }
    btn.addEventListener('click', () => setPlaying(!playing));
    sl.addEventListener('input', () => { frac = sl.value / 1000; render(frac); });
    render(0); setPlaying(true);
    return { destroy() { playing = false; cancelAnimationFrame(raf); map.remove(); } };
  }
  window.JourneyMap = { attach };
})();
