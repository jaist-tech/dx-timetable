// ===== route.html: 経路検索ページの画面処理 =====
// 探索は planner.js（画面に依存しない）．この画面は入力・表示・記憶・URL 引数だけを扱う．
(function () {
  'use strict';

  // ---- 翻訳（既存の辞書に，このページ用のキーだけを足す．既存ページは影響を受けない）----
  Object.assign(TRANSLATIONS.ja, {
    'route.title': '経路検索（試験公開）', 'route.beta': '試験公開: のみバスを含む全路線から経路を探します',
    'route.from': '出発', 'route.to': '到着', 'route.date': '日付', 'route.mode': '時刻の指定', 'route.time': '時刻',
    'route.depart': '出発', 'route.arrive': '到着', 'route.priority': '重視する条件',
    'route.prio.time': '早：到着時刻順', 'route.prio.transfers': '楽：乗換回数順', 'route.prio.wait': '待ち時間順',
    'route.prio.ride': '乗車時間順', 'route.prio.fare': '安：安い順', 'route.prio.fareOff': '安：安い順（運賃表の準備中）',
    'route.advanced': '詳細設定', 'route.maxTransfers': '乗換回数の上限', 'route.unlimited': '無制限',
    'route.walk': '徒歩の乗換', 'route.walk.none': '使わない', 'route.speed': '歩く速さ',
    'route.speed.slow': 'ゆっくり', 'route.speed.normal': '普通', 'route.speed.fast': '速い',
    'route.maxWait': '待ちの上限', 'route.gain': '乗換を増やして 3 分/回 以上縮まない経路は除く',
    'route.search': '検索',
    'route.note': '時刻表のデータに基づく静的な案内です．遅延・運休は反映されません．のみバスの停留所の座標が未確認の箇所があり，徒歩の乗換は一部の停留所のみ使えます．',
    'route.unknownPlace': '停留所が見つかりません: ${name}', 'route.loading': '時刻表を読み込み中…',
    'route.none': '条件に合う経路がありません．時刻・日付・乗換回数の上限を変えてみてください．',
    'route.count': '${n} 件の候補のうち上位 ${m} 件', 'route.transfers': '乗換${n}回', 'route.direct': '直通',
    'route.total': '合計', 'route.wait': '待ち', 'route.ride': '乗車', 'route.walkMin': '徒歩', 'route.fare': '運賃',
    'route.walkLeg': '徒歩', 'route.waitMin': '待ち${n}分', 'route.tight': '乗り遅れに注意',
    'route.walkFaster': '徒歩なしの最良より ${n} 分速い', 'route.walkSame': '徒歩なしの最良と同じ時間',
    'route.best': '最上位', 'route.today': '今日', 'route.min': '分', 'route.yen': '円', 'route.fareUnknown': '運賃は未収集の区間を含みます',
    'route.dayErr': 'この日のダイヤを読み込めませんでした',
  });
  Object.assign(TRANSLATIONS.en, {
    'route.title': 'Route search (trial)', 'route.beta': 'Trial: route search across all lines including Nomi Bus',
    'route.from': 'From', 'route.to': 'To', 'route.date': 'Date', 'route.mode': 'Time is', 'route.time': 'Time',
    'route.depart': 'Departure', 'route.arrive': 'Arrival', 'route.priority': 'Priority',
    'route.prio.time': 'Fast: by arrival time', 'route.prio.transfers': 'Easy: by transfers', 'route.prio.wait': 'By waiting time',
    'route.prio.ride': 'By riding time', 'route.prio.fare': 'Cheap: by fare', 'route.prio.fareOff': 'Cheap: by fare (fare table pending)',
    'route.advanced': 'Advanced', 'route.maxTransfers': 'Max transfers', 'route.unlimited': 'Unlimited',
    'route.walk': 'Walking transfers', 'route.walk.none': 'None', 'route.speed': 'Walking speed',
    'route.speed.slow': 'Slow', 'route.speed.normal': 'Normal', 'route.speed.fast': 'Fast',
    'route.maxWait': 'Max wait', 'route.gain': 'Hide routes that add a transfer but save under 3 min',
    'route.search': 'Search',
    'route.note': 'Static guidance from timetable data. Delays and cancellations are not reflected. Some Nomi Bus stop coordinates are unconfirmed, so walking transfers are available at only some stops.',
    'route.unknownPlace': 'Stop not found: ${name}', 'route.loading': 'Loading timetables…',
    'route.none': 'No route found. Try changing the time, date or transfer limit.',
    'route.count': 'Top ${m} of ${n} candidates', 'route.transfers': '${n} transfer(s)', 'route.direct': 'Direct',
    'route.total': 'Total', 'route.wait': 'Waiting', 'route.ride': 'Riding', 'route.walkMin': 'Walking', 'route.fare': 'Fare',
    'route.walkLeg': 'Walk', 'route.waitMin': 'Wait ${n} min', 'route.tight': 'Tight connection',
    'route.walkFaster': '${n} min faster than the best without walking', 'route.walkSame': 'Same time as the best without walking',
    'route.best': 'Top', 'route.today': 'Today', 'route.min': 'min', 'route.yen': 'JPY', 'route.fareUnknown': 'Fare is unknown for some sections',
    'route.dayErr': 'Could not load the timetable for this day',
  });

  const $ = id => document.getElementById(id);
  const MEMORY_KEY = 'routeLastSelection';
  const MEMORY_TTL_MIN = 30;
  let net = null, places = [];

  // ---- 日付・時刻 ----
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const nowDate = () => (typeof _getDebugDatetimeNow === 'function' && _getDebugDatetimeNow()) || new Date();
  function buildDateSelect(keep) {
    const sel = $('rt-date'); sel.innerHTML = '';
    const base = nowDate();
    for (let i = 0; i < 8; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const o = document.createElement('option');
      o.value = ymd(d);
      const dow = t('header.dow.' + d.getDay());
      o.textContent = (i === 0 ? t('route.today') + ' ' : '') + (d.getMonth() + 1) + '/' + d.getDate() + ' (' + dow + ')';
      sel.appendChild(o);
    }
    if (keep) sel.value = keep;
  }

  // ---- 停留所の入力 ----
  function fillStops() {
    const dl = $('rt-stops'); dl.innerHTML = '';
    for (const n of places) {
      const o = document.createElement('option');
      o.value = n;
      if (currentLang !== 'ja' && tStop(n) !== n) o.label = tStop(n);
      dl.appendChild(o);
    }
  }
  // 入力を停留所名（または座標）に解決する．曖昧なときは null
  function resolveInput(text) {
    const s = text.trim();
    const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s);
    if (m) return { lat: +m[1], lon: +m[2] };
    if (places.includes(s)) return s;
    const low = s.toLowerCase();
    const en = places.filter(n => tStop(n).toLowerCase() === low);
    if (en.length === 1) return en[0];
    const pre = places.filter(n => n.startsWith(s) || tStop(n).toLowerCase().startsWith(low));
    if (pre.length === 1) return pre[0];
    return null;
  }

  // ---- 記憶（直近の選択．30 分以内に戻ったときだけ復元）----
  function saveMemory() {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify({
        from: $('rt-from').value, to: $('rt-to').value, dateOffset: $('rt-date').selectedIndex,
        mode: $('rt-mode').value, time: $('rt-time').value, prio: $('rt-prio').value,
        maxtr: $('rt-maxtr').value, walk: $('rt-walk').value, speed: $('rt-speed').value,
        maxwait: $('rt-maxwait').value, gain: $('rt-gain').checked,
        savedDate: ymd(nowDate()), savedAt: Date.now(),
      }));
    } catch (e) { /* 保存できない環境では何もしない */ }
  }
  function restoreMemory() {
    try {
      const v = JSON.parse(localStorage.getItem(MEMORY_KEY) || 'null');
      if (!v || Date.now() - v.savedAt > MEMORY_TTL_MIN * 60000 || v.savedDate !== ymd(nowDate())) return false;
      $('rt-from').value = v.from || ''; $('rt-to').value = v.to || '';
      if (v.dateOffset >= 0 && v.dateOffset < $('rt-date').options.length) $('rt-date').selectedIndex = v.dateOffset;
      for (const [id, key] of [['rt-mode', 'mode'], ['rt-prio', 'prio'], ['rt-maxtr', 'maxtr'], ['rt-walk', 'walk'], ['rt-speed', 'speed'], ['rt-maxwait', 'maxwait']]) {
        const el = $(id);
        if (v[key] !== undefined && [...el.options].some(o => o.value === v[key] && !o.disabled)) el.value = v[key];
      }
      if (v.time) $('rt-time').value = v.time;
      $('rt-gain').checked = v.gain !== false;
      return true;
    } catch (e) { return false; }
  }

  // ---- URL 引数（マップアプリなどからの起動）----
  // ?from=名前|緯度,経度 &to=… &date=YYYY-MM-DD &depart=HH:MM | &arrive=HH:MM &prio=time|transfers|wait|ride|fare &auto=1
  function applyUrlParams() {
    const q = new URLSearchParams(location.search);
    if (![...q.keys()].length) return false;
    if (q.get('from')) $('rt-from').value = q.get('from');
    if (q.get('to')) $('rt-to').value = q.get('to');
    if (q.get('date') && [...$('rt-date').options].some(o => o.value === q.get('date'))) $('rt-date').value = q.get('date');
    if (q.get('arrive')) { $('rt-mode').value = 'arrive'; $('rt-time').value = q.get('arrive'); }
    else if (q.get('depart')) { $('rt-mode').value = 'depart'; $('rt-time').value = q.get('depart'); }
    if (q.get('prio') && [...$('rt-prio').options].some(o => o.value === q.get('prio') && !o.disabled)) $('rt-prio').value = q.get('prio');
    return q.get('from') && q.get('to') && q.get('auto') !== '0';
  }

  // ---- 検索の実行 ----
  function options() {
    const walkMax = +$('rt-walk').value;
    const mt = $('rt-maxtr').value;
    return {
      priority: $('rt-prio').value,
      maxTransfers: mt === 'unlimited' ? null : +mt,
      maxWaitMin: +$('rt-maxwait').value,
      minGainPerTransfer: $('rt-gain').checked ? 3 : 0,
      walk: { enabled: walkMax > 0, maxMin: walkMax || 5, speed: +$('rt-speed').value },
    };
  }

  async function search() {
    const st = $('rt-status'), out = $('rt-results');
    const from = resolveInput($('rt-from').value), to = resolveInput($('rt-to').value);
    out.innerHTML = '';
    if (!from) { st.textContent = t('route.unknownPlace', { name: $('rt-from').value }); return; }
    if (!to) { st.textContent = t('route.unknownPlace', { name: $('rt-to').value }); return; }
    const date = $('rt-date').value;
    st.textContent = t('route.loading');
    try { await net.ensureDate(date); } catch (e) { st.textContent = t('route.dayErr'); return; }
    const o = options();
    const q = Object.assign({ date, from, to }, o);
    const time = $('rt-time').value || '00:00';
    if ($('rt-mode').value === 'arrive') q.arrive = time; else q.depart = time;
    const r = Planner.plan(net, q);
    if (r.error === 'unknown-place') { st.textContent = t('route.unknownPlace', { name: $('rt-from').value + ' / ' + $('rt-to').value }); return; }
    st.textContent = r.journeys.length ? t('route.count', { n: r.count, m: r.journeys.length }) : '';
    if (!r.journeys.length) { out.innerHTML = '<p class="rt-note">' + esc(t('route.none')) + '</p>'; saveMemory(); return; }
    // 徒歩を使う候補には，徒歩なしの最良との差を添える
    let noWalk = null;
    if (o.walk.enabled && r.journeys.some(j => j.legs.some(l => l.type === 'walk' && l.from !== '出発地' && l.to !== '目的地'))) {
      const r2 = Planner.plan(net, Object.assign({}, q, { walk: Object.assign({}, o.walk, { enabled: false }), results: 1 }));
      noWalk = r2.journeys[0] || null;
    }
    out.innerHTML = r.journeys.map((j, i) => renderJourney(j, i, noWalk, q)).join('');
    saveMemory();
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dur = m => (m >= 60 ? Math.floor(m / 60) + (currentLang === 'ja' ? '時間' : 'h ') : '') + (m % 60) + t('route.min');
  const placeName = n => (n === '出発地' ? (currentLang === 'ja' ? '出発地' : 'Origin') : n === '目的地' ? (currentLang === 'ja' ? '目的地' : 'Destination') : tStop(n));

  function renderJourney(j, i, noWalk, q) {
    const hasWalk = j.legs.some(l => l.type === 'walk');
    const tags = [
      `<span class="rt-tag${i === 0 ? ' best' : ''}">${i === 0 ? esc(t('route.best')) + ' · ' : ''}${esc(j.transfers === 0 ? t('route.direct') : t('route.transfers', { n: j.transfers }))}</span>`,
      `<span class="rt-tag">${esc(t('route.total'))} ${dur(j.total)}</span>`,
      `<span class="rt-tag">${esc(t('route.wait'))} ${dur(j.wait)}</span>`,
      `<span class="rt-tag">${esc(t('route.ride'))} ${dur(j.ride)}</span>`,
    ];
    if (j.walk) tags.push(`<span class="rt-tag">${esc(t('route.walkMin'))} ${dur(j.walk)}</span>`);
    if (j.fare !== null) tags.push(`<span class="rt-tag">${esc(t('route.fare'))} ${j.fare}${esc(t('route.yen'))}</span>`);
    let cmp = '';
    if (noWalk && hasWalk && i === 0) {
      const d = noWalk.arr - j.arr;
      cmp = `<div class="rt-wait">${esc(d > 0 ? t('route.walkFaster', { n: d }) : t('route.walkSame'))}</div>`;
    }
    const legs = j.legs.map((l, k) => {
      const prev = j.legs[k - 1];
      let gap = '';
      if (prev && l.dep - prev.arr > 0) {
        const w = l.dep - prev.arr;
        gap = `<div class="rt-wait">${esc(t('route.waitMin', { n: w }))}${w <= 3 && l.type === 'trip' && prev.type === 'trip' ? ' <span class="rt-warn">' + esc(t('route.tight')) + '</span>' : ''}</div>`;
      }
      if (l.type === 'walk') {
        return gap + `<div class="rt-leg walk"><span class="rt-name">${esc(t('route.walkLeg'))} ${l.minutes}${esc(t('route.min'))}</span> ${esc(placeName(l.from))} → ${esc(placeName(l.to))}<small>${Planner.fmtTime(l.dep)} → ${Planner.fmtTime(l.arr)}</small></div>`;
      }
      const rname = currentLang === 'ja' ? (l.routeName || l.routeId) : (typeof SEG_ROUTE_NAMES_EN !== 'undefined' && SEG_ROUTE_NAMES_EN[l.routeName]) || l.routeName;
      const via = l.stops.length > 2 ? l.stops.slice(1, -1).map(s => tStop(s.name)).join(' → ') : '';
      return gap + `<div class="rt-leg"><span class="rt-name">${Planner.fmtTime(l.dep)} ${esc(placeName(l.from))}</span> → ${Planner.fmtTime(l.arr)} ${esc(placeName(l.to))}<small>${esc(rname)}${via ? ' · ' + l.stops.length + ' ' + (currentLang === 'ja' ? '停車' : 'stops') : ''}</small></div>`;
    }).join('');
    return `<div class="rt-j"><div class="rt-j-head"><span class="rt-j-time">${j.depStr} → ${j.arrStr}</span><span class="rt-j-total">${esc(dur(j.total))}</span></div><div class="rt-tags">${tags.join('')}</div>${cmp}<div class="rt-legs">${legs}</div></div>`;
  }

  // ---- 起動 ----
  function updateFareOption(hasFare) {
    const o = $('rt-prio-fare');
    o.disabled = !hasFare;
    o.textContent = t(hasFare ? 'route.prio.fare' : 'route.prio.fareOff');
  }
  function updateClock() {
    const n = nowDate();
    $('header-time').textContent = pad(n.getHours()) + ':' + pad(n.getMinutes());
  }
  // 言語切替の再描画（i18n.js の refreshUI を上書き）
  window.refreshUI = function () {
    applyStaticTranslations();
    const keep = $('rt-date').value; buildDateSelect(keep);
    fillStops(); updateFareOption(!!(net && net.fares));
    if ($('rt-results').children.length) search();
  };

  async function init() {
    initSettingsDropdown();
    buildDateSelect();
    const n = nowDate();
    $('rt-time').value = pad(n.getHours()) + ':' + pad(n.getMinutes());
    applyStaticTranslations();
    updateClock(); setInterval(updateClock, 10000);
    $('rt-status').textContent = t('route.loading');
    try {
      net = await Planner.load('data/');
      await net.ensureDate($('rt-date').value);
    } catch (e) { $('rt-status').textContent = t('route.dayErr'); return; }
    // 停留所の選択肢は，今日から 7 日分の和集合（日により走らない路線があるため）
    const set = new Set();
    for (const o of $('rt-date').options) {
      try { await net.ensureDate(o.value); Planner.listPlaces(net, o.value).forEach(x => set.add(x)); } catch (e) { /* その日だけ飛ばす */ }
    }
    places = [...set].sort((a, b) => a.localeCompare(b, 'ja'));
    fillStops(); updateFareOption(!!net.fares);
    $('rt-status').textContent = '';
    const fromUrl = applyUrlParams();
    if (!fromUrl) restoreMemory();
    RoutePicker.init({
      getNet: () => net, getDate: () => $('rt-date').value,
      apply: (which, name) => { const el = $(which === 'from' ? 'rt-from' : 'rt-to'); el.value = name; saveMemory(); },
    });
    $('rt-form').addEventListener('submit', e => { e.preventDefault(); search(); });
    $('rt-swap').addEventListener('click', () => { const a = $('rt-from').value; $('rt-from').value = $('rt-to').value; $('rt-to').value = a; });
    document.querySelectorAll('#rt-form select, #rt-form input').forEach(el => el.addEventListener('change', saveMemory));
    const hasParams = [...new URLSearchParams(location.search).keys()].length > 0;
    if (fromUrl || (!hasParams && $('rt-from').value && $('rt-to').value)) search();
    window.JaistRoute = { plan: q => Planner.plan(net, q), net, Planner };
  }
  init();
})();
