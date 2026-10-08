// ===== 直近の選択の記憶（経路・乗降駅・日付・タブ・選んだ便）=====
// 目的: バスの中で別のアプリを見て戻ると，ブラウザがページを破棄して選択が初期値に戻る問題の対策．
// 規則: 30 分以内に戻ったときだけ復元する（ホーム画面から開き直した日常の使用感は変えない）．
//       保存した日と日付が変わっていたら捨てる．復元できない値は無視して初期値を使う．
// 既存の探索・表示の処理は変えず，app.js の initApp の末尾と 1 秒ごとの更新から呼ばれるだけ．
const SELECTION_MEMORY_KEY = 'lastSelection';
const SELECTION_MEMORY_TTL_MS = 30 * 60 * 1000;
let _selMemReady = false;      // 復元の処理が終わるまで保存しない
let _selMemTouched = 0;        // 直近に保存した時刻（ms）
let _selMemLast = '';          // 直近に保存した内容（変化の検出用）
let _selMemPicked = false;     // 利用者が便を選んだか（自動選択の便は保存しない）
let _selMemBase = '';          // 経路・乗降駅・日付の組（変わったら選んだ便の印を捨てる）

function _selMemTripKey() {
  try {
    if (!_selMemPicked || selectedTripIdx < 0) return null;
    if (isMultiRoute(selectedRouteId)) {
      const c = currentConnections[selectedTripIdx];
      return c ? getConnDepTime(c, selectedFromStop) : null;
    }
    const route = getRoute(selectedRouteId);
    const fromIdx = route.stops.indexOf(selectedFromStop);
    const sched = route.schedules[getDayType(route.segmentId)] || [];
    const trip = sched[selectedTripIdx];
    return trip ? trip[fromIdx] || null : null;
  } catch (e) { return null; }
}

function _selMemSnapshot() {
  const base = [selectedRouteId, selectedFromStop, selectedToStop, selectedDate].join('|');
  if (base !== _selMemBase) { _selMemBase = base; _selMemPicked = false; }
  return {
    route: selectedRouteId, from: selectedFromStop, to: selectedToStop,
    date: selectedDate, tab: currentTab, tripKey: _selMemTripKey(),
    savedDate: debugTodayStr(),
  };
}

function saveLastSelectionIfChanged() {
  if (!_selMemReady) return;
  try {
    const snap = _selMemSnapshot();
    const body = JSON.stringify(snap);
    // 内容が同じでも，画面を使い続けている間は 1 分ごとに保存時刻を更新する（30 分の期限は最後に触れた時刻から数える）
    if (body === _selMemLast && Date.now() - _selMemTouched < 60000) return;
    _selMemLast = body;
    _selMemTouched = Date.now();
    localStorage.setItem(SELECTION_MEMORY_KEY, JSON.stringify(Object.assign({}, snap, { savedAt: Date.now() })));
  } catch (e) { /* プライベートモード等では保存しない */ }
}

async function restoreLastSelection() {
  try {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(SELECTION_MEMORY_KEY) || 'null'); } catch (e) { v = null; }
    if (!v || !v.savedAt || Date.now() - v.savedAt > SELECTION_MEMORY_TTL_MS || v.savedDate !== debugTodayStr()) return;
    const preset = ROUTE_PRESETS.find(p => p.id === v.route || p.reverseId === v.route);
    if (!preset) return;
    // 日付: 当日以外を選んでいたときだけ（選択肢に無ければ無視）
    let date = null;
    if (v.date && [...document.querySelectorAll('.date-select')[0].options].some(o => o.value === v.date)) date = v.date;
    selectedDate = date;
    if (date) await ensureSegmentsForDate(date);
    selectedRouteId = v.route;
    selectedTripIdx = -1;
    _expandedTrips.clear();
    const multi = isMultiRoute(selectedRouteId);
    const stops = multi ? null : (getRoute(selectedRouteId) || {}).stops;
    if (multi) rebuildMultiStopSelects(); else rebuildStopSelects();
    const okFrom = multi ? !!findMultiStopEntry(v.from) : (stops && stops.includes(v.from));
    if (okFrom) {
      selectedFromStop = v.from;
      document.querySelectorAll('.from-select').forEach(sel => { sel.value = v.from; });
    }
    if (multi) rebuildMultiToSelects(); else rebuildToSelects();
    const toOpt = document.querySelector('.to-select');
    if (toOpt && [...toOpt.options].some(o => o.value === v.to)) {
      selectedToStop = v.to;
      document.querySelectorAll('.to-select').forEach(sel => { sel.value = v.to; });
    }
    if (multi) updateMultiTripList(); else updateTripList();
    syncControls();
    // 選んだ便: 出発時刻が同じ便があれば選び直す（時刻表が変わって無ければ自動選択のまま）
    if (v.tripKey) {
      let idx = -1;
      if (multi) idx = currentConnections.findIndex(c => getConnDepTime(c, selectedFromStop) === v.tripKey);
      else {
        const route = getRoute(selectedRouteId);
        const fi = route.stops.indexOf(selectedFromStop);
        idx = (route.schedules[getDayType(route.segmentId)] || []).findIndex(tr => tr[fi] === v.tripKey);
      }
      if (idx >= 0) { _scrollToSelected = true; selectTrip(idx); }
    }
    if (v.tab && v.tab !== 'search' && document.getElementById('tab-' + v.tab)) switchTab(v.tab);
  } catch (e) {
    console.warn('Failed to restore last selection:', e);
  } finally {
    _selMemBase = [selectedRouteId, selectedFromStop, selectedToStop, selectedDate].join('|');
    _selMemReady = true;
  }
}

// 便を選んだ印（selectTrip は画面のどこからも同じ関数で呼ばれる）
(function () {
  const orig = selectTrip;
  selectTrip = function (idx) { if (_selMemReady) _selMemSnapshot(); _selMemPicked = true; return orig.apply(this, arguments); };
})();
