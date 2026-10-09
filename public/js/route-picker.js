// ===== route.html: 出発地・到着地の選択ウィンドウ（路線→停留所，地図）=====
// キーワード入力は route.js の入力欄が担当する．ここは選んだ停留所名を入力欄へ入れるだけ．
(function () {
  'use strict';
  Object.assign(TRANSLATIONS.ja, {
    'route.pick': '路線・地図から選ぶ', 'route.pickFrom': '出発地を選ぶ', 'route.pickTo': '到着地を選ぶ',
    'route.pickLine': '路線', 'route.pickMap': '地図', 'route.pickClose': '閉じる', 'route.pickBack': '路線一覧へ',
    'route.pickStops': '${n} 停留所', 'route.pickHere': 'ここにする',
    'route.pickMapHint': '停留所を押して選びます．座標が未確認の停留所は地図に出ません（路線から選べます）．',
    'route.pickMapErr': '地図を読み込めませんでした．路線から選んでください．',
  });
  Object.assign(TRANSLATIONS.en, {
    'route.pick': 'Pick by line or map', 'route.pickFrom': 'Choose origin', 'route.pickTo': 'Choose destination',
    'route.pickLine': 'Lines', 'route.pickMap': 'Map', 'route.pickClose': 'Close', 'route.pickBack': 'All lines',
    'route.pickStops': '${n} stops', 'route.pickHere': 'Select',
    'route.pickMapHint': 'Tap a stop to select it. Stops without known coordinates are not on the map (use Lines).',
    'route.pickMapErr': 'Could not load the map. Please pick by line.',
  });

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let ctx = null;       // { getNet, getDate, apply }
  let ov = null, map = null;

  function init(c) {
    ctx = c;
    document.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => open(b.dataset.pick)));
  }

  function close() {
    if (map) { map.remove(); map = null; }
    if (ov) { ov.remove(); ov = null; }
  }

  function open(which) {
    close();
    ov = document.createElement('div');
    ov.className = 'rp-ov';
    ov.innerHTML = `<div class="rp-sheet" role="dialog" aria-modal="true">
      <div class="rp-head"><span class="rp-title">${esc(t(which === 'from' ? 'route.pickFrom' : 'route.pickTo'))}</span>
        <button type="button" class="rp-btn" data-rp="close">${esc(t('route.pickClose'))}</button></div>
      <div class="rp-tabs"><button type="button" class="rp-tab on" data-rp="line">${esc(t('route.pickLine'))}</button>
        <button type="button" class="rp-tab" data-rp="map">${esc(t('route.pickMap'))}</button></div>
      <div class="rp-body" id="rp-body"></div></div>`;
    document.body.appendChild(ov);
    const body = ov.querySelector('#rp-body');
    const tabs = ov.querySelectorAll('.rp-tab');
    const choose = name => { ctx.apply(which, name); close(); };
    const showTab = k => {
      tabs.forEach(b => b.classList.toggle('on', b.dataset.rp === k));
      if (map) { map.remove(); map = null; }
      if (k === 'line') showLines(body, choose); else showMap(body, choose);
    };
    ov.addEventListener('click', e => {
      if (e.target === ov) return close();
      const b = e.target.closest('[data-rp]');
      if (!b) return;
      if (b.dataset.rp === 'close') close(); else showTab(b.dataset.rp);
    });
    document.addEventListener('keydown', function esc1(e) {
      if (!ov) return document.removeEventListener('keydown', esc1);
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc1); }
    });
    showTab('line');
  }

  function lineName(l) {
    return currentLang === 'ja' ? l.name : (typeof SEG_ROUTE_NAMES_EN !== 'undefined' && SEG_ROUTE_NAMES_EN[l.name]) || l.name;
  }

  function showLines(body, choose) {
    const lines = Planner.listLines(ctx.getNet(), ctx.getDate());
    const order = { train: 0, bus: 1 };
    lines.sort((a, b) => (order[a.kind] - order[b.kind]) || a.name.localeCompare(b.name, 'ja'));
    const list = () => {
      body.scrollTop = 0;
      body.innerHTML = lines.map((l, i) => `<button type="button" class="rp-item" data-i="${i}">${esc(lineName(l))}<small>${esc(t('route.pickStops', { n: l.stops.length }))}</small></button>`).join('');
      body.onclick = e => { const b = e.target.closest('[data-i]'); if (b) stops(lines[+b.dataset.i]); };
    };
    const stops = l => {
      body.scrollTop = 0;
      body.innerHTML = `<button type="button" class="rp-item" data-back="1">‹ ${esc(t('route.pickBack'))}</button><div class="rp-sub">${esc(lineName(l))}</div>` +
        l.stops.map((n, i) => `<button type="button" class="rp-item" data-s="${i}">${esc(tStop(n))}</button>`).join('');
      body.onclick = e => {
        if (e.target.closest('[data-back]')) return list();
        const b = e.target.closest('[data-s]'); if (b) choose(l.stops[+b.dataset.s]);
      };
    };
    list();
  }

  function showMap(body, choose) {
    body.innerHTML = '<div class="rp-mapwrap"><div class="rp-map" id="rp-map"></div><div class="rp-maphint"></div></div>';
    body.onclick = null;
    body.querySelector('.rp-maphint').textContent = t('route.pickMapHint');
    if (typeof L === 'undefined') { body.innerHTML = `<div class="rp-sub">${esc(t('route.pickMapErr'))}</div>`; return; }
    const net = ctx.getNet(), day = net.day(ctx.getDate());
    map = L.map('rp-map', { center: [36.50, 136.57], zoom: 10 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18,
    }).addTo(map);
    const pts = [];
    day.places.forEach((p, i) => {
      const c = day.coords[i];
      if (!c) return;
      pts.push([c.lat, c.lon]);
      const m = L.circleMarker([c.lat, c.lon], { radius: 6, weight: 2, color: '#fff', fillColor: '#1565C0', fillOpacity: .9 }).addTo(map);
      const pop = document.createElement('div');
      pop.className = 'rp-pop';
      pop.innerHTML = `<b>${esc(tStop(p.name))}</b><br>`;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = t('route.pickHere');
      btn.addEventListener('click', () => choose(p.name));
      pop.appendChild(btn);
      m.bindPopup(pop);
    });
    if (pts.length) map.fitBounds(pts, { padding: [20, 20] });
    setTimeout(() => map && map.invalidateSize(), 50);
  }

  window.RoutePicker = { init };
})();
