// ===== route.html: 経路検索ページの画面処理 =====
// 探索は planner.js（画面に依存しない）．この画面は入力・表示・記憶・URL 引数だけを扱う．
(function () {
  'use strict';

  // ---- 翻訳（既存の辞書に，このページ用のキーだけを足す．既存ページは影響を受けない）----
  Object.assign(TRANSLATIONS.ja, {
    'route.title': '経路検索（試験公開）',
    'route.from': '出発', 'route.to': '到着', 'route.date': '日付',
    'route.priority': '表示順',
    'route.prio.time': '早：到着時刻順', 'route.prio.transfers': '楽：乗換回数順', 'route.prio.wait': '待ち時間順',
    'route.prio.ride': '乗車時間順', 'route.prio.fare': '安：安い順', 'route.prio.fareOff': '安：安い順（運賃表の準備中）',
    'route.advanced': '詳細設定', 'route.maxTransfers': '乗換回数の上限', 'route.unlimited': '無制限',
    'route.walk': '歩く距離の上限', 'route.walk.none': '歩かない', 'route.speed': '歩く速さ',
    'route.speed.slow': 'ゆっくり', 'route.speed.normal': '普通', 'route.speed.fast': '速い',
    'route.maxWait': '待ちの上限', 'route.gain': '乗換を増やして 3 分/回 以上縮まない経路は除く',
    'route.search': '検索', 'route.placeholder': '駅、バス停',
    'route.note': '時刻表のデータに基づく静的な案内です．遅延・運休は反映されません．小松空港連絡バスの 6 停留所は座標が無く，徒歩の乗換と座標指定の出発地には使えません．',
    'route.unknownPlace': '停留所が見つかりません: ${name}', 'route.loading': '時刻表を読み込み中…',
    'route.none': '条件に合う経路がありません．時刻・日付・乗換回数の上限を変えてみてください．',
    'route.why.limit': '乗換${n}回以上にすると経路があります（今の上限では出ません）．乗換回数の上限か待ちの上限を上げてください．',
    'route.why.afterLast': 'この日は ${t} 発が最終で，指定の時刻以降に出る便がありません．',
    'route.why.beforeFirst': 'この日は ${t} 着が最も早く，指定の時刻までに着く便がありません．',
    'route.why.unconnected': 'この日のダイヤでは，この 2 地点を結ぶ路線の組み合わせがありません（徒歩の乗換の範囲も含む）．',
    'route.why.nextDay': '翌日（${d}）の始発は ${t} 発 → ${a} 着です．日付を翌日にして探してください．',
    'route.why.window': '指定の時刻から 3 時間以内に便が無いため，範囲を広げて表示しています（最も近い便は ${t}）．',
    'route.count': '${n} 件の候補のうち上位 ${m} 件', 'route.countDay': 'この日の経路 ${n} 件', 'route.countDayNow': 'この日の経路 ${n} 件（${t} 以降は ${m} 件）', 'route.transfers': '乗換${n}回', 'route.direct': '直通',
    'route.total': '合計', 'route.wait': '待ち', 'route.ride': '乗車', 'route.walkMin': '徒歩', 'route.fare': '運賃',
    'route.basis.road': '道のり約 ${m} m（OSM の歩行者の道）', 'route.basis.approx': '直線距離からの概算 約 ${m} m', 'route.basis.fixed': '個別に決めた値',
    'route.walkLeg': '徒歩', 'route.waitMin': '待ち${n}分', 'route.tight': '乗り遅れに注意',
    'route.walkFaster': '徒歩なしの最良より ${n} 分速い', 'route.walkSame': '徒歩なしの最良と同じ時間',
    'route.best': '最上位', 'route.today': '本日', 'route.min': '分', 'route.yen': '円', 'route.fareUnknown': '運賃は未収集の区間を含みます',
    'route.dayErr': 'この日のダイヤを読み込めませんでした',
  });
  Object.assign(TRANSLATIONS.en, {
    'route.title': 'Route search (trial)',
    'route.from': 'From', 'route.to': 'To', 'route.date': 'Date',
    'route.priority': 'Sort by',
    'route.prio.time': 'Fast: by arrival time', 'route.prio.transfers': 'Easy: by transfers', 'route.prio.wait': 'By waiting time',
    'route.prio.ride': 'By riding time', 'route.prio.fare': 'Cheap: by fare', 'route.prio.fareOff': 'Cheap: by fare (fare table pending)',
    'route.advanced': 'Advanced', 'route.maxTransfers': 'Max transfers', 'route.unlimited': 'Unlimited',
    'route.walk': 'Max walking distance', 'route.walk.none': 'None', 'route.speed': 'Walking speed',
    'route.speed.slow': 'Slow', 'route.speed.normal': 'Normal', 'route.speed.fast': 'Fast',
    'route.maxWait': 'Max wait', 'route.gain': 'Hide routes that add a transfer but save under 3 min',
    'route.search': 'Search', 'route.placeholder': 'Station, bus stop',
    'route.note': 'Static guidance from timetable data. Delays and cancellations are not reflected. The 6 Komatsu Airport bus stops have no coordinates, so they cannot be used for walking transfers or coordinate-based origins.',
    'route.unknownPlace': 'Stop not found: ${name}', 'route.loading': 'Loading timetables…',
    'route.none': 'No route found. Try changing the time, date or transfer limit.',
    'route.why.limit': 'A route exists with ${n}+ transfer(s). Raise the transfer or waiting limit.',
    'route.why.afterLast': 'The last departure that day is ${t}; nothing runs at or after your time.',
    'route.why.beforeFirst': 'The earliest arrival that day is ${t}; nothing arrives by your time.',
    'route.why.unconnected': 'No combination of routes (including walking transfers) connects these two places on this date.',
    'route.why.nextDay': 'Next day (${d}): first departure ${t}, arriving ${a}. Change the date to search it.',
    'route.why.window': 'No service within 3 hours of your time, so the search range was widened (nearest: ${t}).',
    'route.count': 'Top ${m} of ${n} candidates', 'route.countDay': '${n} routes on this day', 'route.countDayNow': '${n} routes on this day (${m} from ${t})', 'route.transfers': '${n} transfer(s)', 'route.direct': 'Direct',
    'route.total': 'Total', 'route.wait': 'Waiting', 'route.ride': 'Riding', 'route.walkMin': 'Walking', 'route.fare': 'Fare',
    'route.basis.road': 'about ${m} m on OSM walking paths', 'route.basis.approx': 'estimated from straight-line distance, about ${m} m', 'route.basis.fixed': 'set individually',
    'route.walkLeg': 'Walk', 'route.waitMin': 'Wait ${n} min', 'route.tight': 'Tight connection',
    'route.walkFaster': '${n} min faster than the best without walking', 'route.walkSame': 'Same time as the best without walking',
    'route.best': 'Top', 'route.today': 'Today', 'route.min': 'min', 'route.yen': 'JPY', 'route.fareUnknown': 'Fare is unknown for some sections',
    'route.dayErr': 'Could not load the timetable for this day',
  });

  const $ = id => document.getElementById(id);
  const MEMORY_KEY = 'routeLastSelection';
  const MEMORY_TTL_MIN = 30;
  let net = null, places = [];
  let urlDepart = null, urlArrive = null;   // URL 引数の時刻（最初の検索だけに使う）

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
      o.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' (' + dow + ')' + (i === 0 ? ' ' + t('route.today') : '');
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
        prio: $('rt-prio').value,
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
      for (const [id, key] of [['rt-prio', 'prio'], ['rt-maxtr', 'maxtr'], ['rt-walk', 'walk'], ['rt-speed', 'speed'], ['rt-maxwait', 'maxwait']]) {
        const el = $(id);
        if (key === 'walk' && ['5', '10', '15'].includes(v.walk)) v.walk = { 5: '400', 10: '800', 15: '1200' }[v.walk];   // 旧: 分の選択
        if (v[key] !== undefined && [...el.options].some(o => o.value === v[key] && !o.disabled)) el.value = v[key];
      }
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
    // 画面は選んだ日の経路の一覧．depart= はその時刻の位置まで移る目印，arrive= は最初の 1 回だけ到着指定で探す
    urlDepart = /^\d{1,2}:\d{2}$/.test(q.get('depart') || '') ? q.get('depart') : null;
    urlArrive = /^\d{1,2}:\d{2}$/.test(q.get('arrive') || '') ? q.get('arrive') : null;
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
      walk: { enabled: walkMax > 0, maxMeters: walkMax || 400, speed: +$('rt-speed').value },
    };
  }

  async function search() {
    const st = $('rt-status'), out = $('rt-results');
    const from = resolveInput($('rt-from').value), to = resolveInput($('rt-to').value);
    openMaps.forEach(m => m.destroy()); openMaps = [];
    out.innerHTML = '';
    if (!from) { st.textContent = t('route.unknownPlace', { name: $('rt-from').value }); return; }
    if (!to) { st.textContent = t('route.unknownPlace', { name: $('rt-to').value }); return; }
    const date = $('rt-date').value;
    st.textContent = t('route.loading');
    try { await net.ensureDate(date); } catch (e) { st.textContent = t('route.dayErr'); return; }
    const o = options();
    const q = Object.assign({ date, from, to }, o);
    // 時刻は指定させず，選んだ日の全出発を一覧にする（到着指定の URL 引数だけは最初の 1 回その時刻で探す）
    const arriveAt = urlArrive; urlArrive = null;
    if (arriveAt) q.arrive = arriveAt; else Object.assign(q, { depart: '00:00', window: 2000, results: 1000 });
    const r = Planner.plan(net, q);
    if (r.error === 'unknown-place') { st.textContent = t('route.unknownPlace', { name: $('rt-from').value + ' / ' + $('rt-to').value }); return; }
    // 今日は今の時刻（depart= があればその時刻）より前の出発を薄くし，最初の候補へ移る
    const nd = nowDate();
    const refStr = urlDepart || (date === ymd(nd) ? pad(nd.getHours()) + ':' + pad(nd.getMinutes()) : null);
    const ref = refStr ? Planner.parseTime(refStr) : null;
    if (!arriveAt) q.ref = ref;
    const remain = ref === null ? 0 : r.journeys.filter(j => j.dep >= ref).length;
    st.textContent = !r.journeys.length ? '' : arriveAt ? t('route.count', { n: r.count, m: r.journeys.length })
      : ref === null ? t('route.countDay', { n: r.journeys.length }) : t('route.countDayNow', { n: r.journeys.length, m: remain, t: refStr });
    if (!r.journeys.length) { out.innerHTML = '<p class="rt-note">' + esc(await noneMessage(r, date)) + '</p>'; saveMemory(); return; }
    if (r.widened) out.innerHTML = '<p class="rt-note">' + esc(t('route.why.window', { t: Planner.fmtTime(r.edge) })) + '</p>';
    // 徒歩を使う候補には，徒歩なしの最良との差を添える
    let noWalk = null;
    if (o.walk.enabled && r.journeys.some(j => j.legs.some(l => l.type === 'walk' && l.from !== '出発地' && l.to !== '目的地'))) {
      const r2 = Planner.plan(net, Object.assign({}, q, { walk: Object.assign({}, o.walk, { enabled: false }), results: 1 }));
      noWalk = r2.journeys[0] || null;
    }
    out.innerHTML += r.journeys.map((j, i) => renderJourney(j, i, noWalk, q)).join('');
    bindMaps(out, r.journeys, date, q);
    if (!arriveAt && ref !== null && q.priority === 'time') {
      const first = out.querySelector('.rt-j:not(.rt-past)');
      if (first && first !== out.querySelector('.rt-j')) first.scrollIntoView({ block: 'start' });
    }
    saveMemory();
  }

  // 経路が 0 件のときの理由の文（planner.js の reason）．終発後は翌日の始発も添える
  async function noneMessage(r, date) {
    const w = k => t('route.why.' + k, k === 'limit' ? { n: r.needTransfers } : { t: r.edge === undefined ? '' : Planner.fmtTime(r.edge) });
    if (r.reason === 'limit') return w('limit');
    if (r.reason === 'unconnected') return w('unconnected');
    if (r.reason === 'before-first') return w('beforeFirst');
    if (r.reason !== 'after-last') return t('route.none');
    let msg = w('afterLast');
    const opts = [...$('rt-date').options].map(o => o.value), k = opts.indexOf(date);
    if (k >= 0 && k + 1 < opts.length) {
      try {
        const nd = opts[k + 1]; await net.ensureDate(nd);
        const q = Object.assign({ date: nd, from: resolveInput($('rt-from').value), to: resolveInput($('rt-to').value), depart: '00:00' }, options());
        const n = Planner.plan(net, Object.assign(q, { results: 1, window: 1440 }));
        const j = n.journeys[0];
        if (j) msg += t('route.why.nextDay', { d: nd, t: j.depStr, a: j.arrStr });
      } catch (e) { /* 翌日の探索に失敗したときは終発の案内だけ */ }
    }
    return msg;
  }

  // 候補ごとの地図（押すと開き，もう一度押すと閉じる．開いている間だけ動かす）
  let openMaps = [];
  function bindMaps(out, journeys, date, q) {
    openMaps.forEach(m => m.destroy()); openMaps = [];
    if (typeof L === 'undefined' || typeof JourneyMap === 'undefined') { out.querySelectorAll('.rt-mapbtn').forEach(b => b.remove()); return; }
    out.querySelectorAll('.rt-mapbtn').forEach(b => b.addEventListener('click', () => {
      const card = b.closest('.rt-j'), ex = card.querySelector('.jm-wrap');
      if (ex) {
        const k = openMaps.findIndex(m => m.box === ex); if (k >= 0) { openMaps[k].destroy(); openMaps.splice(k, 1); }
        ex.remove(); b.setAttribute('aria-expanded', 'false'); return;
      }
      const box = document.createElement('div'); box.className = 'jm-wrap';
      card.appendChild(box); b.setAttribute('aria-expanded', 'true');
      const h = JourneyMap.attach(box, journeys[+b.dataset.map], net, date, q, () => { box.remove(); b.setAttribute('aria-expanded', 'false'); });
      h.box = box; openMaps.push(h);
    }));
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dur = m => (m >= 60 ? Math.floor(m / 60) + (currentLang === 'ja' ? '時間' : 'h ') : '') + (m % 60) + t('route.min');
  const placeName = n => (n === '出発地' ? (currentLang === 'ja' ? '出発地' : 'Origin') : n === '目的地' ? (currentLang === 'ja' ? '目的地' : 'Destination') : tStop(n));

  // 徒歩の根拠: road=OSM の歩行者の道のり，approx=直線距離からの概算，fixed=個別に決めた値
  function walkBasis(l) {
    if (!l.basis) return '';
    const key = 'route.basis.' + l.basis;
    return ' · ' + esc(t(key, { m: l.meters == null ? '' : Math.round(l.meters / 10) * 10 }));
  }

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
        return gap + `<div class="rt-leg walk"><span class="rt-name">${esc(t('route.walkLeg'))} ${l.minutes}${esc(t('route.min'))}</span> ${esc(placeName(l.from))} → ${esc(placeName(l.to))}<small>${Planner.fmtTime(l.dep)} → ${Planner.fmtTime(l.arr)}${walkBasis(l)}</small></div>`;
      }
      const rname = currentLang === 'ja' ? (l.routeName || l.routeId) : (typeof SEG_ROUTE_NAMES_EN !== 'undefined' && SEG_ROUTE_NAMES_EN[l.routeName]) || l.routeName;
      const via = l.stops.length > 2 ? l.stops.slice(1, -1).map(s => tStop(s.name)).join(' → ') : '';
      return gap + `<div class="rt-leg"><span class="rt-name">${Planner.fmtTime(l.dep)} ${esc(placeName(l.from))}</span> → ${Planner.fmtTime(l.arr)} ${esc(placeName(l.to))}<small>${esc(rname)}${via ? ' · ' + l.stops.length + ' ' + (currentLang === 'ja' ? '停車' : 'stops') : ''}</small></div>`;
    }).join('');
    return `<div class="rt-j${q.ref != null && j.dep < q.ref ? ' rt-past' : ''}"><div class="rt-j-head"><span class="rt-j-time">${j.depStr} → ${j.arrStr}</span><span class="rt-j-total">${esc(dur(j.total))}</span><button type="button" class="rt-mapbtn" data-map="${i}" aria-expanded="false" title="${esc(t('route.map'))}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/></svg></button></div><div class="rt-tags">${tags.join('')}</div>${cmp}<div class="rt-legs">${legs}</div></div>`;
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
  function setPlaceholders() { $('rt-from').placeholder = $('rt-to').placeholder = t('route.placeholder'); }
  // 言語切替の再描画（i18n.js の refreshUI を上書き）
  window.refreshUI = function () {
    applyStaticTranslations();
    setPlaceholders();
    const keep = $('rt-date').value; buildDateSelect(keep);
    fillStops(); updateFareOption(!!(net && net.fares));
    if ($('rt-results').children.length) search();
  };

  async function init() {
    initSettingsDropdown();
    buildDateSelect();
    applyStaticTranslations(); setPlaceholders();
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
