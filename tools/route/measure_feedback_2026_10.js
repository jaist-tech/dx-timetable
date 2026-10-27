// 利用者の意見の検討（docs/user-feedback-2026-10.md）の計測: node tools/route/measure_feedback_2026_10.js
// (1) 停留所名の出発地から隣の停留所へ歩かないことによる長い待ち
// (2) 出発・到着の停留所から 400 m まで歩ける試作（planner.js を実行時に書き換えた写しで試す）と今の探索の比較
// (3) 探索の時間（1 日の一覧・乗換の停留所からの再探索）
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public/js/planner.js'), 'utf8');
const ANCHOR = '    const dests = new Map(dst.map(d => [d.p, d.walk]));';
if (!SRC.includes(ANCHOR)) throw new Error('planner.js の形が変わったため試作を作れない');
// 試作: q.accessWalk が true なら乗換と同じ徒歩の表（上限 400 m），数なら上限をその m にした道のりの表で，
// 名前で指定した出発地・到着地（walk 0）から歩ける停留所も候補にする
const PATCH = '    if (q.accessWalk) { const aw = q.accessWalk === true ? walks : buildWalks(day, Object.assign({}, o.walk, { maxMeters: q.accessWalk })); for (const L of [src, dst]) { const add = []; for (const x of L) if (x.walk === 0) for (const e of aw[x.p]) if (!L.some(y => y.p === e.q)) add.push({ p: e.q, walk: e.walk }); L.push(...add); } }\n';
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'planner-')), 'planner_access.js');
fs.writeFileSync(tmp, SRC.replace(ANCHOR, PATCH + ANCHOR));
const P = require(tmp);
const BASE = path.join(ROOT, 'public/data') + '/';
const rj = async u => JSON.parse(fs.readFileSync(u.split('?')[0], 'utf8'));
const DATE = process.argv[2] || '2026-10-28';
const fmt = j => `${j.depStr}→${j.arrStr} 待ち${j.wait}分 | ` + j.legs.map(l => l.type === 'walk' ? `徒歩${l.minutes}分(${l.from}→${l.to})` : `${l.routeName} ${l.from} ${P.fmtTime(l.dep)}→${l.to} ${P.fmtTime(l.arr)}`).join(' / ');
const stat = js => js.length ? `${js.length}件 待ち最大${Math.max(...js.map(j => j.wait))}分 平均${(js.reduce((a, j) => a + j.wait, 0) / js.length).toFixed(1)}分` : '0件';
const timeIt = (n, f) => { f(); const t0 = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(); return Number(process.hrtime.bigint() - t0) / 1e6 / n; };

(async () => {
  const net = await P.load(BASE, rj);
  await net.ensureDate(DATE);
  const day = { date: DATE, depart: '00:00', window: 2000, results: 1000 };
  console.log(`# 日付 ${DATE}．Node ${process.version}`);

  console.log('\n## (1)(2) JAIST 発の待ち');
  for (const to of ['能美根上駅', '寺井中央', '金沢駅']) {
    const now = P.plan(net, { ...day, from: 'JAIST', to }).journeys;
    const acc = P.plan(net, { ...day, from: 'JAIST', to, accessWalk: true }).journeys;
    console.log(`${to}: 今 ${stat(now)} / 試作 ${stat(acc)}`);
    now.filter(j => j.wait >= 40).forEach(j => console.log('  今の長い待ち: ' + fmt(j)));
  }

  console.log('\n## (2) 標本の比較（近くに停留所がある 40 地点 × 到着地 10 か所．乱数の種 7）');
  const stops = JSON.parse(fs.readFileSync(path.join(BASE, 'route/stops.json'))).stops;
  const walk = JSON.parse(fs.readFileSync(path.join(BASE, 'route/walk.json'))).pairs;
  const places = P.listPlaces(net, DATE);
  const near = new Set(walk.filter(p => p.m <= 1200).flatMap(p => [p.a, p.b]));
  const origins = places.filter(n => stops[n] && stops[n].lat != null && near.has(n));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sample = origins.sort(() => rnd() - 0.5).slice(0, 40);
  const res = { pairs: 0, aBetter: 0, aLost: 0, bBetter: 0, bLost: 0 };
  const lostEx = [];
  for (const o of sample) for (let k = 0; k < 10; k++) {
    const to = places[Math.floor(rnd() * places.length)]; if (to === o) continue;
    const a = P.plan(net, { ...day, from: o, to }).journeys;
    const A = P.plan(net, { ...day, from: o, to, accessWalk: true }).journeys;
    const B = P.plan(net, { ...day, from: o, to, accessWalk: 1200 }).journeys;   // 徒歩 15 分（分速 80 m）相当の道のり
    const better = ys => ys.some(y => !a.some(x => x.dep >= y.dep && x.arr <= y.arr));   // 今の一覧のどれにも劣らない経路が増えた
    const lost = ys => a.filter(x => !ys.some(y => y.dep >= x.dep && y.arr <= x.arr && y.transfers <= x.transfers));   // 今の経路で，試作のどれにも代わられないもの
    res.pairs++;
    if (better(A)) res.aBetter++; if (better(B)) res.bBetter++;
    const la = lost(A); if (la.length) { res.aLost++; if (lostEx.length < 3) lostEx.push(`${o}→${to}: 今 ${a.length}件のうち ${la.length}件が消える（例 ${la[0].depStr}→${la[0].arrStr}）．試作 ${A.length}件`); }
    if (lost(B).length) res.bLost++;
  }
  console.log(`組 ${res.pairs}: 案 A（400 m）良い経路が増える ${res.aBetter}・今の経路が消える ${res.aLost}／案 B（1200 m）増える ${res.bBetter}・消える ${res.bLost}`);
  lostEx.forEach(e => console.log('  消える例: ' + e));

  console.log('\n## (2b) 今の公開版の乗換の足切り（3 分/回）が時間帯をまたいで候補を除く件数（同じ標本．試作を使わない）');
  seed = 7; const sample2 = origins.sort(() => rnd() - 0.5).slice(0, 40);
  const cross = { pairs: 0, hit: 0, removed: 0 }; const crossEx = [];
  for (const o of sample2) for (let k = 0; k < 10; k++) {
    const to = places[Math.floor(rnd() * places.length)]; if (to === o) continue;
    const on = P.plan(net, { ...day, from: o, to }).journeys;
    const off = P.plan(net, { ...day, from: o, to, minGainPerTransfer: 0 }).journeys;
    // 足切りで消えた経路のうち，消した理由になれる（乗換が少なく合計が短い）経路がすべて 60 分以上離れた時刻に出るもの
    const gone = off.filter(j => !on.some(x => x.dep === j.dep && x.arr === j.arr && x.transfers === j.transfers));
    const far = gone.filter(j => { const why = off.filter(x => x.transfers < j.transfers && j.total > x.total - 3 * (j.transfers - x.transfers)); return why.length && why.every(x => Math.abs(x.dep - j.dep) >= 60); });
    cross.pairs++; if (far.length) { cross.hit++; cross.removed += far.length; if (crossEx.length < 3) crossEx.push(`${o}→${to}: ${far.length}件（例 ${far[0].depStr}→${far[0].arrStr} 乗換${far[0].transfers}）．残る一覧 ${on.length}件`); }
  }
  console.log(`組 ${cross.pairs}: 時間帯をまたいで除かれる経路がある組 ${cross.hit}（経路 ${cross.removed}件）`);
  crossEx.forEach(e => console.log('  例: ' + e));

  console.log('\n## (3) 探索の時間（20 回の平均）');
  const JA = { lat: 36.443636, lon: 136.592051 };
  const one = q => { const t0 = process.hrtime.bigint(); P.plan(net, q); return (Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1); };
  console.log(`初回（予備実行なし）1 日一覧 金沢駅→加賀温泉駅 乗換無制限 案 A: ${one({ ...day, from: '金沢駅', to: '加賀温泉駅', maxTransfers: Infinity, accessWalk: true })} ms`);
  const q0 = { ...day, from: 'JAIST', to: '金沢駅' };
  console.log(`1 日一覧 JAIST→金沢駅: 今 ${timeIt(20, () => P.plan(net, q0)).toFixed(1)} ms，案 A ${timeIt(20, () => P.plan(net, { ...q0, accessWalk: true })).toFixed(1)} ms，案 B ${timeIt(20, () => P.plan(net, { ...q0, accessWalk: 1200 })).toFixed(1)} ms，座標指定 ${timeIt(20, () => P.plan(net, { ...q0, from: JA })).toFixed(1)} ms`);
  const q1 = { ...day, from: '金沢駅', to: '加賀温泉駅', maxTransfers: Infinity };
  console.log(`1 日一覧 金沢駅→加賀温泉駅 乗換無制限: 今 ${timeIt(20, () => P.plan(net, q1)).toFixed(1)} ms，案 A ${timeIt(20, () => P.plan(net, { ...q1, accessWalk: true })).toFixed(1)} ms`);
  console.log(`乗換の停留所からの再探索 小松駅→金沢駅 15:00 以降 5 件: ${timeIt(50, () => P.plan(net, { date: DATE, from: '小松駅', to: '金沢駅', depart: '15:00', results: 5 })).toFixed(2)} ms`);
  console.log(`同 鶴来駅→野町駅 15:00 以降 5 件: ${timeIt(50, () => P.plan(net, { date: DATE, from: '鶴来駅', to: '野町駅', depart: '15:00', results: 5 })).toFixed(2)} ms`);
})();
