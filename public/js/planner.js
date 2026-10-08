// ===== planner.js: 全路線をつなぐ経路探索（画面・グローバル状態に依存しない）=====
// ブラウザでは window.Planner，Node では module.exports として使える．
// 使い方（詳細は docs/route-planner.md）:
//   const net = await Planner.load('data/');             // 静的ファイルを読む（fetch）
//   await net.ensureDate('2026-10-09');                  // その日のダイヤを組む
//   const res = Planner.plan(net, { date, from, to, depart: '08:30', priority: 'time' });
// RAPTOR（乗車回数ごとの最早到着）を，出発時刻ごとに繰り返して候補（プロファイル）を作り，
// 乗換回数・到着・出発が他に劣る候補を除いて，重視する条件で並べ替える．
(function (root) {
  'use strict';

  const API_VERSION = 1;
  const DEFAULTS = {
    maxTransfers: 3,        // 乗換回数の上限（null = 無制限）
    maxWaitMin: 120,        // 乗換での待ちの上限（分）
    window: 180,            // 出発（到着）指定から探す幅（分）
    results: 5,             // 返す候補の数
    walk: { enabled: true, maxMin: 5, speed: 80, margin: 2, detour: 1.3 },
    minGainPerTransfer: 3,  // 乗換 1 回増えるごとに，これ以上短縮しない候補は除く（0 で無効）
    priority: 'time',       // time | transfers | wait | ride | fare
  };
  const UNLIMITED_ROUNDS = 8;
  const DAY = 1440;

  // ---------- 時刻・日付 ----------
  function parseTime(s) {
    if (s === null || s === undefined || s === '') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function fmtTime(min) {
    const m = ((min % DAY) + DAY) % DAY;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  function dateParts(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d); }

  // ---------- 既存の getDayType・pickRegularEntry と同じ規則 ----------
  function pickRegularEntry(entries, today) {
    if (!entries || !entries.length) return undefined;
    const cover = entries.filter(e => e.valid_from <= today && (e.valid_until === null || today <= e.valid_until));
    if (cover.length) return cover.reduce((a, b) => (a.valid_from > b.valid_from ? a : b));
    const expired = entries.filter(e => e.valid_from <= today && e.valid_until !== null && e.valid_until < today);
    if (expired.length) return expired.reduce((a, b) => (a.valid_from > b.valid_from ? a : b));
    return undefined;
  }
  function matchesPeriods(dateStr, periods) {
    return Array.isArray(periods) && periods.some(p => p.from <= dateStr && dateStr <= p.until);
  }
  // base: manifest のキー（例 shuttle_komatsu）．戻り値 {key, specialFile?}
  function dayKeyFor(base, dateStr, manifest, holidays) {
    for (const e of (manifest.special && manifest.special[base]) || []) {
      if (matchesPeriods(dateStr, e.apply_periods)) {
        if (e.fallback_to) return { key: e.fallback_to };
        if (e.schedule_key) return { key: e.schedule_key, specialFile: e.file };
      }
    }
    const d = dateParts(dateStr).getDay();
    if (d === 0 || d === 6 || holidays.has(dateStr)) return { key: 'weekend' };
    return { key: 'weekday' };
  }

  // ---------- 停留所名の正規化 ----------
  function normName(s) { return String(s).replace(/\(折り返し\)/g, '').trim(); }
  function kindOf(base) { return /^(ir_|ishikawa_line)/.test(base) ? 'train' : 'bus'; }

  // ---------- ネットワーク ----------
  // raw: { manifest, routes, holidays:[], stopsExtra, fares, regular:{file:json}, special:{file:json} }
  function createNetwork(raw) {
    const net = {
      raw, fares: raw.fares || null, days: {},
      stopsExtra: raw.stopsExtra || { stops: {}, links: [] },
      needFiles(dateStr) {
        const holidays = new Set(raw.holidays || []);
        const reg = [], spe = [];
        for (const base of Object.keys(raw.manifest.regular || {})) {
          const e = pickRegularEntry(raw.manifest.regular[base], dateStr);
          if (e) reg.push(e.file);
          const dk = dayKeyFor(base, dateStr, raw.manifest, holidays);
          if (dk.specialFile) spe.push(dk.specialFile);
        }
        return { regular: reg, special: spe };
      },
      day(dateStr) {
        if (!net.days[dateStr]) net.days[dateStr] = buildDay(net, dateStr);
        return net.days[dateStr];
      },
    };
    return net;
  }

  function buildDay(net, dateStr) {
    const { manifest, routes: rcfg } = net.raw;
    const holidays = new Set(net.raw.holidays || []);
    const placeIdx = new Map(), places = [];
    const place = name => {
      const n = normName(name);
      if (!placeIdx.has(n)) { placeIdx.set(n, places.length); places.push({ name: n }); }
      return placeIdx.get(n);
    };
    const patterns = [];
    for (const base of Object.keys(manifest.regular || {})) {
      const entry = pickRegularEntry(manifest.regular[base], dateStr);
      if (!entry) continue;
      const json = net.raw.regular[entry.file];
      if (!json) continue;
      const dk = dayKeyFor(base, dateStr, manifest, holidays);
      const spJson = dk.specialFile ? net.raw.special[dk.specialFile] : null;
      for (const r of json.routes) {
        let trips;
        if (spJson) {
          const sr = spJson.routes.find(x => x.id === r.id);
          trips = sr && sr.schedules && sr.schedules.default;
          if (!trips) continue;
        } else {
          trips = r.schedules && r.schedules[dk.key];
        }
        if (!trips || !trips.length) continue;
        const stops = r.stops.map(place);
        const tl = [];
        for (const raw of trips) {
          const times = []; let prev = -1, add = 0;
          for (let i = 0; i < stops.length; i++) {
            let v = parseTime(raw[i]);
            if (v === null) { times.push(null); continue; }
            v += add;
            if (v < prev) { add += DAY; v += DAY; }   // 日またぎ
            prev = v; times.push(v);
          }
          if (times.filter(x => x !== null).length >= 2) tl.push(times);
        }
        if (!tl.length) continue;
        // 停車する停留所の組が同じ便ごとに系統（pattern）を分ける（通過する便を同じ系統に混ぜると，最早の便が目的地に止まらない場合を誤る）
        const groups = new Map();
        for (const times of tl) {
          const mask = times.map(x => (x === null ? 0 : 1)).join('');
          if (!groups.has(mask)) groups.set(mask, []);
          groups.get(mask).push(times);
        }
        for (const [mask, list] of groups) {
          const keep = [];
          for (let i = 0; i < mask.length; i++) if (mask[i] === '1') keep.push(i);
          const trimmed = list.map(times => keep.map(i => times[i])).sort((a, b) => a[0] - b[0]);
          // 追い越しのない列（どの停留所でも前の便より遅い便の並び）に分ける（最早の便に乗れば最先着になる前提を成り立たせる）
          const chains = [];
          for (const tr of trimmed) {
            const ch = chains.find(c => { const last = c[c.length - 1]; return tr.every((v, i) => v >= last[i]); });
            if (ch) ch.push(tr); else chains.push([tr]);
          }
          for (const ch of chains) {
            patterns.push({ id: r.id, name: r.name, base, kind: kindOf(base), stops: keep.map(i => stops[i]), trips: ch });
          }
        }
      }
    }
    // 停留所ごとの「通る系統」
    const byPlace = places.map(() => []);
    patterns.forEach((p, pi) => {
      const seen = new Set();
      p.stops.forEach((s, i) => { if (!seen.has(s)) { seen.add(s); byPlace[s].push(pi); } });
    });
    // 座標
    const coords = places.map(p => {
      const s = net.stopsExtra.stops[p.name];
      return s && s.lat != null ? { lat: s.lat, lon: s.lon } : null;
    });
    // 徒歩・乗換の表
    const explicit = []; // {a,b,min}
    const defMin = (rcfg && rcfg.default_transfer_min) || 5;
    const sameMin = places.map(() => defMin);
    for (const t of (rcfg && rcfg.transfers) || []) {
      if (t.from === t.to) { if (placeIdx.has(t.from)) sameMin[placeIdx.get(t.from)] = t.min; }
      else if (t.walk && placeIdx.has(t.from) && placeIdx.has(t.to)) explicit.push({ a: placeIdx.get(t.from), b: placeIdx.get(t.to), min: t.min });
    }
    for (const l of net.stopsExtra.links || []) {
      if (placeIdx.has(l.a) && placeIdx.has(l.b)) {
        explicit.push({ a: placeIdx.get(l.a), b: placeIdx.get(l.b), min: l.min });
        explicit.push({ a: placeIdx.get(l.b), b: placeIdx.get(l.a), min: l.min });
      }
    }
    return { dateStr, places, placeIdx, patterns, byPlace, coords, sameMin, explicit };
  }

  function distM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // 設定に応じた徒歩の隣接表: adj[p] = [{q, walk(分)}]
  function buildWalks(day, w) {
    const adj = day.places.map(() => []);
    if (!w.enabled) return adj;
    const best = new Map();
    const put = (a, b, min) => {
      const k = a * 100000 + b;
      if (!best.has(k) || best.get(k) > min) best.set(k, min);
    };
    const fixed = new Set();
    for (const e of day.explicit) { fixed.add(e.a * 100000 + e.b); if (e.min <= w.maxMin) put(e.a, e.b, e.min); }
    const idx = day.coords.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
    const maxStraight = (w.maxMin * w.speed) / w.detour;
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
      const a = idx[x], b = idx[y];
      const d = distM(day.coords[a], day.coords[b]);
      if (d > maxStraight) continue;
      const m = Math.max(1, Math.ceil((d * w.detour) / w.speed));
      if (m <= w.maxMin) {
        if (!fixed.has(a * 100000 + b)) put(a, b, m);   // routes.json 等で決めた徒歩の分は，直線距離の近似で上書きしない
        if (!fixed.has(b * 100000 + a)) put(b, a, m);
      }
    }
    for (const [k, min] of best) adj[Math.floor(k / 100000)].push({ q: k % 100000, walk: min });
    return adj;
  }

  // ---------- RAPTOR（1 回分）----------
  // srcs: [{p, t, access}]（出発地の候補．t はそこで乗れる時刻）
  // dests: Map(place -> egress 分)
  // 戻り値: 乗車回数 k（1..K）ごとの，目的地への最良ラベル（transit で到着したもの）
  function raptor(day, walks, srcs, dests, K, o) {
    const P = day.places.length;
    const lab = [], wlabs = [], arrRec = [];
    const bestReady = new Float64Array(P).fill(Infinity);
    lab.push(new Array(P).fill(null));
    wlabs.push(new Array(P).fill(null));
    let marked = new Set();
    for (const s of srcs) {
      const l = { kind: 'org', p: s.p, arr: s.t, ready: s.t, access: s.access || 0, prev: null };
      if (l.ready < bestReady[s.p]) { bestReady[s.p] = l.ready; lab[0][s.p] = l; marked.add(s.p); }
    }
    for (let k = 1; k <= K; k++) {
      const cur = new Array(P).fill(null);
      const arrK = new Array(P).fill(null);
      const curW = new Array(P).fill(null);
      lab.push(cur); wlabs.push(curW); arrRec.push(arrK);
      const prevT = lab[k - 1], prevW = wlabs[k - 1];
      // 通る系統ごとの，最初の印付き位置
      const q = new Map();
      for (const p of marked) for (const pi of day.byPlace[p]) {
        const pat = day.patterns[pi];
        let first = Infinity;
        for (let i = 0; i < pat.stops.length; i++) if (pat.stops[i] === p) { first = i; break; }
        if (!q.has(pi) || q.get(pi) > first) q.set(pi, first);
      }
      const newMarked = new Set();
      for (const [pi, from] of q) {
        const pat = day.patterns[pi];
        let trip = null, tripBoard = null, bPos = -1;
        for (let i = from; i < pat.stops.length; i++) {
          const p = pat.stops[i];
          if (trip) {
            const arr = trip[i];
            if (arr !== null) {
              const ready = arr + day.sameMin[p];
              const l = { kind: 'trip', p, arr, ready, pat: pi, trip, bPos, aPos: i, prev: tripBoard };
              if (dests.has(p) && (!arrK[p] || arr < arrK[p].arr)) {
                let better = true;
                for (let kk = 0; kk < k - 1; kk++) { const o2 = arrRec[kk][p]; if (o2 && o2.arr <= arr) { better = false; break; } }
                if (better) arrK[p] = l;
              }
              if (ready < bestReady[p]) { bestReady[p] = ready; cur[p] = l; newMarked.add(p); }
            }
          }
          const a1 = prevT[p], a2 = prevW[p];
          const pl = a1 && a2 ? (a2.ready < a1.ready ? a2 : a1) : (a1 || a2);
          if (pl && marked.has(p)) {
            const r = pl.ready;
            let bt = null, bd = Infinity;
            for (const tr of pat.trips) {
              const d = tr[i];
              if (d === null || d < r) continue;
              if (pl.kind !== 'org' && d - r > o.maxWaitMin) continue;
              if (d < bd) { bd = d; bt = tr; }
            }
            if (bt && (!trip || bd < trip[i])) { trip = bt; tripBoard = pl; bPos = i; }
          }
        }
      }
      // 徒歩の乗換（この round で到着した停留所から 1 回だけ）
      for (const p of [...newMarked]) {
        const l = cur[p];
        if (!l || l.kind !== 'trip') continue;
        for (const w of walks[p]) {
          const arr = l.arr + w.walk;
          const ready = arr + o.walk.margin;
          if (ready < bestReady[w.q]) {
            bestReady[w.q] = ready;
            curW[w.q] = { kind: 'walk', p: w.q, from: p, walk: w.walk, arr, ready, prev: l };
            newMarked.add(w.q);
          }
        }
      }
      marked = newMarked;
      if (!marked.size) break;
    }
    arrRec.lab = lab; arrRec.wlabs = wlabs;
    return arrRec;
  }

  // ラベル鎖から行程を作る
  function legsFrom(day, label) {
    const chain = [];
    for (let l = label; l; l = l.prev) chain.push(l);
    chain.reverse();
    const legs = [];
    for (const l of chain) {
      if (l.kind === 'trip') {
        const pat = day.patterns[l.pat];
        const stopsPassed = [];
        for (let i = l.bPos; i <= l.aPos; i++) if (l.trip[i] !== null) stopsPassed.push({ name: day.places[pat.stops[i]].name, time: l.trip[i] });
        legs.push({
          type: 'trip', kind: pat.kind, routeId: pat.id, routeName: pat.name, base: pat.base,
          from: day.places[pat.stops[l.bPos]].name, to: day.places[pat.stops[l.aPos]].name,
          dep: l.trip[l.bPos], arr: l.trip[l.aPos], stops: stopsPassed,
        });
      } else if (l.kind === 'walk') {
        legs.push({ type: 'walk', from: day.places[l.from].name, to: day.places[l.p].name, minutes: l.walk, dep: l.arr - l.walk, arr: l.arr });
      }
    }
    return legs;
  }

  // ---------- 運賃 ----------
  // data/fares.json（docs/fares.md）: segments.<名前>.kind = flat(fare) | matrix(fares[出発][到着]) | table(pairs["出発>到着"])
  const FARE_SEGMENT = base => (/^nomi_/.test(base) ? 'nomibus' : base === 'ir_ishikawa' ? 'ir_ishikawa_south' : base);
  function legFare(fares, leg) {
    if (!fares || !fares.segments) return null;
    const seg = fares.segments[FARE_SEGMENT(leg.base)];
    if (!seg) return null;
    if (seg.kind === 'flat') return typeof seg.fare === 'number' ? seg.fare : null;
    if (seg.kind === 'matrix') {
      const v = seg.fares && seg.fares[leg.from] && seg.fares[leg.from][leg.to];
      return typeof v === 'number' ? v : null;
    }
    if (seg.kind === 'table') {
      const p = seg.pairs || {};
      const v = p[leg.from + '>' + leg.to];
      return typeof v === 'number' ? v : null;
    }
    return null;
  }
  // 運賃の合計．のみバス同士の乗継は 2 本目が無料（乗継券．同日・降車時に申し出）．不明な区間があれば null
  function journeyFare(fares, legs) {
    if (!fares) return null;
    let sum = 0, prev = null;
    for (const l of legs) {
      if (l.type !== 'trip') continue;
      const f = legFare(fares, l);
      if (f === null) return null;
      const free = prev && /^nomi_/.test(prev.base) && /^nomi_/.test(l.base);
      sum += free ? 0 : f;
      prev = l;
    }
    return sum;
  }

  // ---------- 候補の指標 ----------
  function summarize(day, legs, net, accessMin, egressMin) {
    const trips = legs.filter(l => l.type === 'trip');
    const first = legs[0], last = legs[legs.length - 1];
    const dep = first.dep - accessMin;
    const arr = last.arr + egressMin;
    let wait = 0, ride = 0, walk = accessMin + egressMin;
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i];
      if (l.type === 'trip') ride += l.arr - l.dep; else walk += l.minutes;
      if (i > 0) wait += Math.max(0, l.dep - legs[i - 1].arr - (l.type === 'walk' ? 0 : 0));
    }
    // 徒歩の前後の待ち: 徒歩の leg は到着直後に歩き始めるものとして dep を置いているため，上の差は待ちを含む乗換の隙間のみ
    const fare = journeyFare(net.fares, legs);
    return { dep, arr, total: arr - dep, transfers: trips.length - 1, wait, ride, walk, fare, depStr: fmtTime(dep), arrStr: fmtTime(arr) };
  }

  function sigOf(legs) { return legs.filter(l => l.type === 'trip').map(l => l.routeId + '@' + l.dep + '>' + l.to).join('/'); }

  function dominated(a, b) { // b が a を支配する（出発が遅く，到着が早く，乗換が少ない．どれかは厳密に良い）
    return b.dep >= a.dep && b.arr <= a.arr && b.transfers <= a.transfers &&
      (b.dep > a.dep || b.arr < a.arr || b.transfers < a.transfers);
  }

  // ---------- 探索（公開）----------
  // q: { date, from, to, depart|arrive ('HH:MM'), priority, maxTransfers, walk:{...}, results, window, maxWaitMin }
  //   from / to: 停留所名 | {lat, lon} | 配列（複数候補）．座標は徒歩 15 分以内の近い 5 つを候補にする
  function plan(net, q) {
    const o = Object.assign({}, DEFAULTS, q);
    o.walk = Object.assign({}, DEFAULTS.walk, q.walk || {});
    const day = net.day(q.date);
    const walks = buildWalks(day, o.walk);
    const src = resolvePlaces(day, q.from, o.walk), dst = resolvePlaces(day, q.to, o.walk);
    if (!src.length || !dst.length) return { apiVersion: API_VERSION, date: q.date, journeys: [], error: 'unknown-place' };
    const dests = new Map(dst.map(d => [d.p, d.walk]));
    const K = o.maxTransfers === null || o.maxTransfers === undefined || o.maxTransfers === Infinity ? UNLIMITED_ROUNDS : o.maxTransfers + 1;
    const arriveMode = q.arrive !== undefined && q.arrive !== null;
    const T = parseTime(arriveMode ? q.arrive : (q.depart !== undefined ? q.depart : '00:00'));
    // 出発時刻の候補: 出発地の停留所で乗れる便の出発時刻
    const lo = arriveMode ? Math.max(0, T - o.window) - 0 : T;
    const hi = arriveMode ? T : T + o.window;
    const depSet = new Map(); // t -> srcs
    for (const s of src) {
      for (const pi of day.byPlace[s.p]) {
        const pat = day.patterns[pi];
        pat.stops.forEach((sp, i) => {
          if (sp !== s.p) return;
          for (const tr of pat.trips) {
            const d = tr[i];
            if (d === null) continue;
            const t = d - s.walk;            // 出発地を出る時刻
            if (t < lo - 0 || t > hi) continue;
            if (!depSet.has(t)) depSet.set(t, []);
          }
        });
      }
    }
    const times = [...depSet.keys()].sort((a, b) => b - a);
    const found = new Map();
    for (const t of times) {
      const srcs = src.map(s => ({ p: s.p, t: t + s.walk, access: s.walk }));
      const recs = raptor(day, walks, srcs, dests, K, o);
      recs.forEach(arrK => {
        // この round の，目的地候補ごとの最良ラベルから最も早く着くものを 1 つ採る
        let best = null;
        for (const [d, eg] of dests) {
          const l = arrK[d];
          if (l && (!best || l.arr + eg < best.l.arr + best.eg)) best = { l, eg };
        }
        if (!best) return;
        const legs = legsFrom(day, best.l);
        const org = (function () { let x = best.l; while (x.prev) x = x.prev; return x; })();
        const access = org.access || 0;
        const first = legs[0];
        if (!first) return;
        const s = summarize(day, legs, net, access, best.eg);
        // 出発地側の徒歩（座標指定）を行程に加える
        const out = [];
        if (access) out.push({ type: 'walk', from: '出発地', to: first.from, minutes: access, dep: first.dep - access, arr: first.dep });
        out.push(...legs);
        if (best.eg) { const lastL = legs[legs.length - 1]; out.push({ type: 'walk', from: lastL.to, to: '目的地', minutes: best.eg, dep: lastL.arr, arr: lastL.arr + best.eg }); }
        const key = sigOf(legs);
        if (!found.has(key)) found.set(key, Object.assign({ legs: out }, s));
      });
    }
    let list = [...found.values()];
    list = list.filter(j => arriveMode ? (j.arr <= T && j.arr >= T - o.window - 240) : (j.dep >= T && j.dep <= T + o.window));
    // 出発・到着・乗換の 3 点で他に劣る候補を除く（待ち時間・乗車時間・金額を重視するときは，その差が出るため除かない）
    if (o.priority === 'time' || o.priority === 'transfers') list = list.filter(j => !list.some(x => x !== j && dominated(j, x)));
    if (o.minGainPerTransfer > 0 && (o.priority === 'time' || o.priority === 'transfers')) {
      // 乗換が増えても 3 分/回 以上は短くならない候補を除く
      list = list.filter(j => !list.some(x => x.transfers < j.transfers && j.total > x.total - o.minGainPerTransfer * (j.transfers - x.transfers)));
    }
    const pr = o.priority;
    const keyOf = j => {
      const first = pr === 'transfers' ? j.transfers : pr === 'wait' ? j.wait : pr === 'ride' ? j.ride : pr === 'fare' ? (j.fare === null ? Infinity : j.fare) : j.total;
      return [first, j.total, j.transfers, j.fare === null ? Infinity : j.fare, arriveMode ? -j.dep : -j.dep];
    };
    list.sort((a, b) => { const x = keyOf(a), y = keyOf(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
    const journeys = list.slice(0, o.results);
    // 徒歩なしの最良との比較（徒歩を使う候補だけに付ける）
    return { apiVersion: API_VERSION, date: q.date, dayKind: null, journeys, count: list.length };
  }

  function resolvePlaces(day, spec, w) {
    const arr = Array.isArray(spec) ? spec : [spec];
    const out = new Map();
    for (const s of arr) {
      if (typeof s === 'string') {
        const n = normName(s);
        if (day.placeIdx.has(n)) out.set(day.placeIdx.get(n), 0);
      } else if (s && typeof s.lat === 'number') {
        const cand = [];
        day.coords.forEach((c, i) => {
          if (!c) return;
          const d = distM(s, c);
          const m = Math.max(1, Math.ceil((d * w.detour) / w.speed));
          if (m <= 15) cand.push({ p: i, walk: m, d });
        });
        cand.sort((a, b) => a.d - b.d).slice(0, 5).forEach(c => out.set(c.p, Math.min(c.walk, out.has(c.p) ? out.get(c.p) : Infinity)));
      }
    }
    return [...out].map(([p, walk]) => ({ p, walk }));
  }

  // 運行のある停留所名（画面の選択肢用）
  function listPlaces(net, dateStr) {
    const day = net.day(dateStr);
    return day.places.map(p => p.name);
  }

  // ---------- 読み込み（ブラウザ・Node 共通．fetchJson を差し替え可）----------
  async function load(base, fetchJson) {
    const fj0 = fetchJson || (async url => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
    // データのバージョン（tools/route/build_version.py）．あれば ?v= を付けて更新後の古いキャッシュを避ける
    const ver = await fj0(base + 'route/version.json').catch(() => null);
    const fj = ver && ver.version ? url => fj0(url + '?v=' + ver.version) : fj0;
    const opt = async url => { try { return await fj(url); } catch (e) { return null; } };
    const [manifest, routes, holidays, stopsExtra, fares] = await Promise.all([
      fj(base + 'manifest.json'), fj(base + 'routes.json'), opt(base + 'holidays.json'),
      opt(base + 'route/stops.json'), opt(base + 'fares.json'),
    ]);
    const net = createNetwork({ manifest, routes, holidays: holidays || [], stopsExtra: stopsExtra || { stops: {}, links: [] }, fares, regular: {}, special: {} });
    net.ensureDate = async function (dateStr) {
      const need = net.needFiles(dateStr);
      await Promise.all([
        ...need.regular.filter(f => !net.raw.regular[f]).map(async f => { net.raw.regular[f] = await fj(base + 'regular/' + f); }),
        ...need.special.filter(f => !net.raw.special[f]).map(async f => { net.raw.special[f] = await fj(base + 'special/' + f); }),
      ]);
      return net.day(dateStr);
    };
    return net;
  }

  const Planner = { _raptor: raptor, _buildWalks: buildWalks, API_VERSION, DEFAULTS, load, createNetwork, plan, listPlaces, parseTime, fmtTime, pickRegularEntry, dayKeyFor, normName };
  if (typeof module !== 'undefined' && module.exports) module.exports = Planner;
  else root.Planner = Planner;
})(typeof window !== 'undefined' ? window : globalThis);
