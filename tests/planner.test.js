// Node の自動試験: node --test tests/planner.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Planner = require('../public/js/planner.js');

const BASE = path.join(__dirname, '..', 'public', 'data') + '/';
const readJson = async url => JSON.parse(fs.readFileSync(url.split('?')[0], 'utf8'));
let netP;
const getNet = () => (netP = netP || Planner.load(BASE, readJson));
const WK = '2026-10-09'; // 金
const WE = '2026-10-10'; // 土

test('既存 6 経路: JAIST → 小松駅 は直通 1 本で，時刻表の便と一致する', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const r = Planner.plan(net, { date: WK, from: 'JAIST', to: '小松駅', depart: '08:00', results: 20, minGainPerTransfer: 0 });
  assert.ok(r.journeys.length > 0);
  const sched = JSON.parse(fs.readFileSync(BASE + 'regular/shuttle_komatsu_2026-10-01_2026-10-31.json'));
  const out = sched.routes.find(x => x.id === 'komatsu_outbound').schedules.weekday;
  const deps = new Set(out.map(t => t[0]));
  const direct = r.journeys.filter(j => j.transfers === 0);
  assert.ok(direct.length > 0);
  for (const j of direct) {
    assert.equal(j.legs.length, 1);
    assert.ok(deps.has(Planner.fmtTime(j.legs[0].dep).replace(/^0/, '')), 'dep ' + j.depStr);
  }
});

test('JAIST → 金沢駅（小松経由 / 鶴来経由）が見つかる', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const r = Planner.plan(net, { date: WK, from: 'JAIST', to: '金沢駅', depart: '08:00', minGainPerTransfer: 0, maxTransfers: 3 });
  assert.ok(r.journeys.length > 0);
  for (const j of r.journeys) { assert.ok(j.arr > j.dep); assert.ok(j.transfers >= 1); }
});

test('のみバス: 辰口福祉会館 → 岩本（循環系統の往路）', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const r = Planner.plan(net, { date: WK, from: '辰口福祉会館', to: '岩本', depart: '08:00' });
  assert.ok(r.journeys.length > 0);
  assert.equal(r.journeys[0].legs[0].routeId.startsWith('nomi_'), true);
});

test('乗換の最小時間: 到着直後の便には乗り換えない', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const r = Planner.plan(net, { date: WK, from: 'JAIST', to: '金沢駅', depart: '06:00', results: 30, minGainPerTransfer: 0 });
  for (const j of r.journeys) {
    for (let i = 1; i < j.legs.length; i++) {
      const a = j.legs[i - 1], b = j.legs[i];
      assert.ok(b.dep - a.arr >= (b.type === 'walk' ? 0 : 1), 'gap ' + (b.dep - a.arr));
    }
    const trips = j.legs.filter(l => l.type === 'trip');
    for (let i = 1; i < trips.length; i++) assert.ok(trips[i].dep - trips[i - 1].arr >= 1);
  }
});

test('乗換上限 0 では乗換のある経路を返さない', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const r = Planner.plan(net, { date: WK, from: 'JAIST', to: '金沢駅', depart: '08:00', maxTransfers: 0 });
  assert.equal(r.journeys.length, 0);
});

test('到着指定: 到着時刻以前に着く', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const r = Planner.plan(net, { date: WK, from: 'JAIST', to: '小松駅', arrive: '12:00' });
  assert.ok(r.journeys.length > 0);
  for (const j of r.journeys) assert.ok(j.arr <= 12 * 60);
});

test('土曜はのみバス観光ルート（土日祝のみ）が走る', async () => {
  const net = await getNet(); await net.ensureDate(WE);
  const day = net.day(WE);
  assert.ok(day.patterns.some(p => p.id === 'nomi_matsui'));
  const wk = net.day(WK);
  assert.ok(!wk.patterns.some(p => p.id === 'nomi_matsui'));
});

// 独立実装との突合: 単純な時間展開（全便を時刻順に走査）で最早到着を求め，RAPTOR（乗換上限なし・徒歩なし）と比べる
function bruteEarliest(net, dateStr, from, to, depMin) {
  const day = net.day(dateStr);
  const o = day.placeIdx.get(from), d = day.placeIdx.get(to);
  const arr = new Array(day.places.length).fill(Infinity);   // 乗れる最早時刻（乗換時間込み）
  const real = new Array(day.places.length).fill(Infinity);  // 実到着
  arr[o] = depMin; real[o] = depMin;
  const events = []; // [dep, pat, trip]
  day.patterns.forEach((p, pi) => p.trips.forEach(t => events.push({ pi, t, start: t.find(x => x !== null) })));
  events.sort((a, b) => a.start - b.start);
  for (let round = 0; round < 12; round++) {
    let changed = false;
    for (const e of events) {
      const p = day.patterns[e.pi]; let on = false;
      for (let i = 0; i < p.stops.length; i++) {
        const s = p.stops[i], t = e.t[i];
        if (t === null) continue;
        if (on) {
          if (t < real[s]) { real[s] = t; changed = true; }
          const r = t + day.sameMin[s];
          if (r < arr[s]) { arr[s] = r; changed = true; }
        }
        if (!on && t >= arr[s]) {
          if (s === o || true) on = true;
        }
      }
    }
    if (!changed) break;
  }
  return real[d];
}

test('突合: 最早到着が時間展開の全探索と一致（徒歩なし・乗換上限なし．待ち上限なし）', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const day = net.day(WK);
  const names = day.places.map(p => p.name);
  let seed = 12345; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  let checked = 0;
  for (let i = 0; i < 150; i++) {
    const a = names[rnd(names.length)], b = names[rnd(names.length)];
    if (a === b) continue;
    const dep = 6 * 60 + rnd(14 * 60);
    const want = bruteEarliest(net, WK, a, b, dep);
    const r = Planner.plan(net, { date: WK, from: a, to: b, depart: Planner.fmtTime(dep), maxTransfers: null, walk: { enabled: false }, maxWaitMin: 100000, window: 24 * 60, results: 1000, minGainPerTransfer: 0 });
    const got = r.journeys.length ? Math.min(...r.journeys.filter(j => j.dep >= dep).map(j => j.arr)) : Infinity;
    if (want === Infinity) { assert.equal(got, Infinity, `${a}→${b}@${dep}`); }
    else { assert.equal(got, want, `${a}→${b}@${dep}`); }
    checked++;
  }
  assert.ok(checked > 100);
});

test('性能: 1 回の探索（Node）', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) Planner.plan(net, { date: WK, from: 'JAIST', to: '金沢駅', depart: '08:00' });
  const per = (performance.now() - t0) / 20;
  console.log('plan() 平均', per.toFixed(1), 'ms');
  assert.ok(per < 200);
});

// ---- 合成データでの回帰試験（レビューで指摘された誤りの再発防止）----
function synth(order) {
  const files = {
    r1: { routes: [{ id: 'r1', name: 'r1', stops: ['A', 'B'], schedules: { weekday: [['8:20', '9:00'], ['8:25', '8:40']], weekend: [] } }] },
    r2: { routes: [{ id: 'r2', name: 'r2', stops: ['C', 'D'], schedules: { weekday: [['8:50', '9:10']], weekend: [] } }] },
  };
  const regular = {}, manifest = { regular: {}, special: {} };
  for (const k of order) {
    manifest.regular[k] = [{ file: k + '.json', valid_from: '2020-01-01', valid_until: null }];
    regular[k + '.json'] = files[k];
  }
  return Planner.createNetwork({
    manifest, holidays: [], regular, special: {},
    routes: { default_transfer_min: 5, transfers: [{ from: 'B', to: 'C', min: 3, walk: true }] },
  });
}

test('追い越し: 後発で先着する便に乗る経路を取り逃がさない', () => {
  const net = synth(['r1', 'r2']);
  const r = Planner.plan(net, { date: WK, from: 'A', to: 'B', depart: '08:00', minGainPerTransfer: 0, results: 10 });
  assert.equal(Math.min(...r.journeys.map(j => j.arr)), 8 * 60 + 40);
});

test('徒歩の乗換は路線の登録順に依存しない', () => {
  for (const order of [['r1', 'r2'], ['r2', 'r1']]) {
    const net = synth(order);
    const r = Planner.plan(net, { date: WK, from: 'A', to: 'D', depart: '08:00', minGainPerTransfer: 0 });
    assert.ok(r.journeys.length > 0, order.join());
    assert.ok(r.journeys[0].legs.some(l => l.type === 'walk' && l.minutes === 3));
    assert.equal(r.journeys[0].arrStr, '09:10');
  }
});

test('徒歩を使わない設定では徒歩の乗換経路を返さない', () => {
  const net = synth(['r1', 'r2']);
  const r = Planner.plan(net, { date: WK, from: 'A', to: 'D', depart: '08:00', walk: { enabled: false } });
  assert.equal(r.journeys.length, 0);
});

test('運賃: JAIST→小松駅→金沢駅は 0+580 円，のみバス同士の乗継は 2 本目が無料', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  assert.ok(net.fares, 'fares.json が読まれる');
  const r = Planner.plan(net, { date: WK, from: 'JAIST', to: '金沢駅', depart: '08:00', results: 30, minGainPerTransfer: 0, priority: 'fare' });
  const viaKomatsu = r.journeys.find(j => j.legs.some(l => l.base === 'shuttle_komatsu') && j.legs.some(l => l.base === 'ir_ishikawa'));
  assert.ok(viaKomatsu);
  assert.equal(viaKomatsu.fare, 580);
  const n = Planner.plan(net, { date: WK, from: '辰口福祉会館', to: '岩本', depart: '08:00', results: 10 });
  for (const j of n.journeys) {
    const trips = j.legs.filter(l => l.type === 'trip');
    assert.ok(j.fare === (trips.length >= 2 && trips.every(l => l.base.startsWith('nomi_')) ? 100 : j.fare));
  }
});

test('データのバージョンがあれば読み込みの URL に ?v= が付き，無くても動く', async () => {
  const urls = [];
  const ver = JSON.parse(fs.readFileSync(BASE + 'route/version.json', 'utf8')).version;
  await Planner.load(BASE, async u => { urls.push(u); return readJson(u); });
  assert.ok(urls.filter(u => !/route\/version\.json$/.test(u)).every(u => u.endsWith('?v=' + ver)));
  const noVer = u => (u.endsWith('route/version.json') ? Promise.reject(new Error('404')) : readJson(u));
  const net = await Planner.load(BASE, noVer);
  assert.ok(net.raw.manifest);
});

test('listLines: 路線ごとの停留所が重複なく並び，全停留所を覆う', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const lines = Planner.listLines(net, WK);
  assert.ok(lines.length >= 10);
  const all = new Set(Planner.listPlaces(net, WK));
  const covered = new Set();
  for (const l of lines) {
    assert.equal(new Set(l.stops).size, l.stops.length, l.name + ' に重複');
    l.stops.forEach(s => covered.add(s));
  }
  assert.deepEqual([...all].filter(s => !covered.has(s)), []);
  const tsurugi = lines.find(l => l.stops[0] === 'JAIST' || l.stops.includes('鶴来駅'));
  assert.ok(tsurugi);
});

test('運賃: 同じ IR の運賃区間を続けて乗るときは通しの運賃（加賀温泉駅 → 津幡駅 = 1130）', async () => {
  const net = await getNet(); await net.ensureDate(WK);
  const r = Planner.plan(net, { date: WK, from: '加賀温泉駅', to: '津幡駅', depart: '08:00', results: 10, minGainPerTransfer: 0 });
  const j = r.journeys.find(x => x.legs.filter(l => l.type === 'trip').every(l => l.base.startsWith('ir_')));
  assert.ok(j, 'IR だけの経路がある');
  assert.equal(j.fare, 1130);
});
