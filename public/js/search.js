// ===== Search (shared controls between tabs) =====

// Cached multi-route stop entries for current route
let _multiStops = []; // array of { name, segIdx, stopIdx }
let _expandedTrips = new Set(); // track which trip indices are expanded

// Route presets: displayed in dropdown with ↔ notation.
// Selecting a preset sets the forward (rightward) route ID.
const ROUTE_PRESETS = [
  { id: 'komatsu_outbound',        reverseId: 'komatsu_inbound',        i18nKey: 'route.jaist_komatsu' },
  { id: 'tsurugi_outbound',        reverseId: 'tsurugi_inbound',        i18nKey: 'route.jaist_tsurugi' },
  { id: 'jaist_tsurugi_kanazawa',  reverseId: 'kanazawa_tsurugi_jaist', i18nKey: 'route.jaist_tsurugi_kanazawa' },
  { id: 'jaist_tsurugi_nomachi',   reverseId: 'nomachi_tsurugi_jaist',  i18nKey: 'route.jaist_tsurugi_nomachi' },
  { id: 'jaist_komatsu_kanazawa',  reverseId: 'kanazawa_komatsu_jaist', i18nKey: 'route.jaist_komatsu_kanazawa' },
  { id: 'jaist_komatsu_airport',   reverseId: 'airport_komatsu_jaist',  i18nKey: 'route.jaist_komatsu_airport' },
];

// Map any route ID (forward or reverse) back to the preset's forward ID
function getPresetValue(routeId) {
  const preset = ROUTE_PRESETS.find(p => p.id === routeId || p.reverseId === routeId);
  return preset ? preset.id : routeId;
}

function initSearch() {
  // Build route options from presets
  const routeOpts = ROUTE_PRESETS.map(p =>
    `<option value="${p.id}">${t(p.i18nKey)}</option>`
  ).join('');

  // Route selects
  document.querySelectorAll('.route-select').forEach(sel => {
    sel.innerHTML = routeOpts;
    sel.value = getPresetValue(selectedRouteId);
    sel.addEventListener('change', () => {
      selectedRouteId = sel.value;
      selectedFromStop = '';
      selectedToStop = '';
      selectedTripIdx = -1;
      _scrollToSelected = true;
      _expandedTrips.clear();
      if (isMultiRoute(selectedRouteId)) {
        rebuildMultiStopSelects();
        updateMultiTripList();
      } else {
        rebuildStopSelects();
        updateTripList();
      }
      syncControls();
      if (currentTab === 'status') updateStatus();
    });
  });

  // From selects
  document.querySelectorAll('.from-select').forEach(sel => {
    sel.addEventListener('change', () => {
      selectedFromStop = sel.value;
      selectedTripIdx = -1;
      _scrollToSelected = true;
      _expandedTrips.clear();
      if (isMultiRoute(selectedRouteId)) {
        rebuildMultiToSelects();
        updateMultiTripList();
      } else {
        rebuildToSelects();
        updateTripList();
      }
      syncControls();
      if (currentTab === 'status') updateStatus();
    });
  });

  // To selects
  document.querySelectorAll('.to-select').forEach(sel => {
    sel.addEventListener('change', () => {
      selectedToStop = sel.value;
      selectedTripIdx = -1;
      _scrollToSelected = true;
      _expandedTrips.clear();
      syncControls();
      if (isMultiRoute(selectedRouteId)) {
        updateMultiTripList();
      } else {
        updateTripList();
      }
      if (currentTab === 'status') updateStatus();
    });
  });

  // Swap buttons
  document.querySelectorAll('.swap-btn').forEach(btn => {
    btn.addEventListener('click', swapRoute);
  });

  _scrollToSelected = true;
  if (isMultiRoute(selectedRouteId)) {
    rebuildMultiStopSelects();
    updateMultiTripList();
  } else {
    rebuildStopSelects();
    updateTripList();
  }

  updateKomatsuNotice();
  initFavorites();
}

// ===== Key Stop Helpers =====

function getKeyStopNames(routeId) {
  if (isMultiRoute(routeId)) {
    const mr = getMultiRoute(routeId);
    const keys = new Set();
    for (const segRef of mr.segments) {
      const first = getSegRefFirstStop(segRef);
      const last = getSegRefLastStop(segRef);
      if (first) keys.add(first);
      if (last) keys.add(last);
    }
    return keys;
  }
  const route = getRoute(routeId);
  return new Set([route.stops[0], route.stops[route.stops.length - 1]]);
}

function buildStopOption(name, keyStops) {
  const isKey = keyStops.has(name);
  const cls = isKey ? 'key-stop' : 'minor-stop';
  const prefix = isKey ? '' : '\u3000';
  return `<option value="${name}" class="${cls}">${prefix}${tStop(name)}</option>`;
}

// ===== Stop Select Helpers for Direct Routes =====

function rebuildStopSelects() {
  const route = getRoute(selectedRouteId);
  const keyStops = getKeyStopNames(selectedRouteId);
  const fromOpts = route.stops.slice(0, -1).map(s =>
    buildStopOption(s, keyStops)
  ).join('');
  selectedFromStop = route.stops[0];

  document.querySelectorAll('.from-select').forEach(sel => {
    sel.innerHTML = fromOpts;
    sel.value = selectedFromStop;
  });

  rebuildToSelects();
}

function rebuildToSelects() {
  const route = getRoute(selectedRouteId);
  const keyStops = getKeyStopNames(selectedRouteId);
  const fromIdx = route.stops.indexOf(selectedFromStop);
  const toOptions = route.stops.slice(fromIdx + 1);
  if (toOptions.length === 0) return;
  const toOpts = toOptions.map(s =>
    buildStopOption(s, keyStops)
  ).join('');
  if (!toOptions.includes(selectedToStop)) {
    selectedToStop = toOptions[toOptions.length - 1];
  }

  document.querySelectorAll('.to-select').forEach(sel => {
    sel.innerHTML = toOpts;
    sel.value = selectedToStop;
  });
}

// ===== Stop Select Helpers for Multi-Routes =====

function rebuildMultiStopSelects() {
  _multiStops = getMultiRouteStops(selectedRouteId);
  const stopNames = _multiStops.map(s => s.name);
  const keyStops = getKeyStopNames(selectedRouteId);

  const fromOpts = stopNames.slice(0, -1).map(s =>
    buildStopOption(s, keyStops)
  ).join('');
  selectedFromStop = stopNames[0];

  document.querySelectorAll('.from-select').forEach(sel => {
    sel.innerHTML = fromOpts;
    sel.value = selectedFromStop;
  });

  rebuildMultiToSelects();
}

function rebuildMultiToSelects() {
  const stopNames = _multiStops.map(s => s.name);
  const keyStops = getKeyStopNames(selectedRouteId);
  const fromIdx = stopNames.indexOf(selectedFromStop);
  const toOptions = stopNames.slice(fromIdx + 1);
  if (toOptions.length === 0) return;
  const toOpts = toOptions.map(s =>
    buildStopOption(s, keyStops)
  ).join('');
  if (!toOptions.includes(selectedToStop)) {
    selectedToStop = toOptions[toOptions.length - 1];
  }

  document.querySelectorAll('.to-select').forEach(sel => {
    sel.innerHTML = toOpts;
    sel.value = selectedToStop;
  });
}

// ===== Common Controls =====

function syncControls() {
  document.querySelectorAll('.route-select').forEach(sel => {
    sel.value = getPresetValue(selectedRouteId);
  });
  document.querySelectorAll('.from-select').forEach(sel => {
    sel.value = selectedFromStop;
  });
  document.querySelectorAll('.to-select').forEach(sel => {
    sel.value = selectedToStop;
  });
  updateKomatsuNotice();
}

function selectionUsesKomatsuShuttle() {
  if (!ROUTES_CONFIG) return false;

  // Direct route
  const direct = ROUTES_CONFIG.direct_routes.find(r => r.id === selectedRouteId);
  if (direct) return direct.segment === 'shuttle_komatsu';

  // Multi-route: check if shuttle_komatsu segment is within the selected from/to range
  const mr = ROUTES_CONFIG.multi_routes.find(r => r.id === selectedRouteId);
  if (!mr) return false;

  const komatsuIdx = mr.segments.findIndex(s => s.segment === 'shuttle_komatsu');
  if (komatsuIdx < 0) return false;

  // If no from/to selected, the full route is used
  if (!selectedFromStop || !selectedToStop) return true;

  const stops = _multiStops.length > 0 ? _multiStops : getMultiRouteStops(selectedRouteId);
  const fromEntry = stops.find(s => s.name === selectedFromStop);
  const toEntry = stops.find(s => s.name === selectedToStop);
  if (!fromEntry || !toEntry) return true;

  // Resolve boundary: if fromStop is the last stop of its segment
  // and the next segment starts with the same stop, treat it as next segment
  let fromSegIdx = fromEntry.segIdx;
  const fromSeg = mr.segments[fromSegIdx];
  if (fromSeg) {
    const dirData = getSegmentData(fromSeg.segment, fromSeg.direction);
    if (dirData) {
      const { stops: segStops } = clipSegment(dirData, fromSeg, dayType);
      if (fromEntry.stopIdx === segStops.length - 1 && fromSegIdx + 1 < mr.segments.length) {
        fromSegIdx = fromSegIdx + 1;
      }
    }
  }

  const minSeg = Math.min(fromSegIdx, toEntry.segIdx);
  const maxSeg = Math.max(fromSegIdx, toEntry.segIdx);
  return komatsuIdx >= minSeg && komatsuIdx <= maxSeg;
}

function updateKomatsuNotice() {
  const show = selectionUsesKomatsuShuttle();
  document.querySelectorAll('.komatsu-reservation-notice').forEach(el => {
    el.style.display = show ? '' : 'none';
  });
}

function swapRoute() {
  const oldFrom = selectedFromStop;
  const oldTo = selectedToStop;

  // Multi-route swap
  if (isMultiRoute(selectedRouteId)) {
    const mr = getMultiRoute(selectedRouteId);
    if (mr && mr.reverse_id) {
      selectedRouteId = mr.reverse_id;
      selectedTripIdx = -1;
      _scrollToSelected = true;
      _expandedTrips.clear();
      rebuildMultiStopSelects();

      // Restore swapped from/to if they exist in the reversed route
      const stopNames = _multiStops.map(s => s.name);
      if (stopNames.includes(oldTo)) {
        selectedFromStop = oldTo;
        document.querySelectorAll('.from-select').forEach(sel => sel.value = oldTo);
        rebuildMultiToSelects();
        if (stopNames.includes(oldFrom)) {
          selectedToStop = oldFrom;
          document.querySelectorAll('.to-select').forEach(sel => sel.value = oldFrom);
        }
      }

      syncControls();
      updateMultiTripList();
      if (currentTab === 'status') updateStatus();
    }
    return;
  }

  // Direct route swap
  const reverseId = REVERSE_ROUTES[selectedRouteId];
  if (!reverseId) return;

  selectedRouteId = reverseId;
  selectedTripIdx = -1;
  _scrollToSelected = true;
  _expandedTrips.clear();
  rebuildStopSelects();

  const route = getRoute(reverseId);
  if (route.stops.includes(oldTo)) {
    selectedFromStop = oldTo;
    document.querySelectorAll('.from-select').forEach(sel => sel.value = oldTo);
    rebuildToSelects();
    if (route.stops.includes(oldFrom)) {
      selectedToStop = oldFrom;
      document.querySelectorAll('.to-select').forEach(sel => sel.value = oldFrom);
    }
  }

  syncControls();
  updateTripList();
  if (currentTab === 'status') updateStatus();
}

// ===== Multi-route Stop-to-Entry Lookup =====

function findMultiStopEntry(stopName) {
  return _multiStops.find(s => s.name === stopName) || null;
}

function getConnDepTime(conn, fromStopName) {
  const entry = findMultiStopEntry(fromStopName);
  if (!entry) return conn.depTime;

  // If this stop is the last stop of its segment AND there's a next segment
  // starting at the same station, use the next segment's departure time instead
  // (e.g., 鶴来駅: shuttle arrival vs ishikawa line departure)
  const seg = conn.segments[entry.segIdx];
  if (seg && entry.stopIdx === seg.stops.length - 1 && entry.segIdx < conn.segments.length - 1) {
    const nextSeg = conn.segments[entry.segIdx + 1];
    if (nextSeg && nextSeg.stops[0] === fromStopName && nextSeg.trip[0]) {
      return nextSeg.trip[0];
    }
  }

  return getConnectionStopTime(conn, entry) || conn.depTime;
}

function getConnArrTime(conn, toStopName) {
  const entry = findMultiStopEntry(toStopName);
  if (!entry) return conn.arrTime;

  // If this stop is the first stop of its segment AND there's a previous segment
  // ending at the same station, use the previous segment's arrival time instead
  const seg = conn.segments[entry.segIdx];
  if (seg && entry.stopIdx === 0 && entry.segIdx > 0) {
    const prevSeg = conn.segments[entry.segIdx - 1];
    if (prevSeg && prevSeg.stops[prevSeg.stops.length - 1] === toStopName && prevSeg.trip[prevSeg.trip.length - 1]) {
      return prevSeg.trip[prevSeg.trip.length - 1];
    }
  }

  return getConnectionStopTime(conn, entry) || conn.arrTime;
}

// ===== Direct Route Trip List =====
function updateTripList() {
  const route = getRoute(selectedRouteId);
  const fromIdx = route.stops.indexOf(selectedFromStop);
  const toIdx = route.stops.indexOf(selectedToStop);

  if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) {
    document.getElementById('trip-list').innerHTML =
      `<div class="no-results">${t('trip.noResults')}</div>`;
    updateSearchCountdown();
    return;
  }

  const sched = route.schedules[dayType];
  const now = nowMin();

  // Helper: check if a trip is valid (has dep/arr times and doesn't cross midnight)
  const isValidTrip = (trip) => {
    const d = trip[fromIdx], a = trip[toIdx];
    return d && a && timeToMin(a) > timeToMin(d);
  };

  if (selectedTripIdx < 0) {
    for (let i = 0; i < sched.length; i++) {
      const depTime = sched[i][fromIdx];
      if (depTime && timeToMin(depTime) >= now && isValidTrip(sched[i])) {
        selectedTripIdx = i;
        break;
      }
    }
  }

  let nextDepIdx = -1;
  for (let i = 0; i < sched.length; i++) {
    const depTime = sched[i][fromIdx];
    if (depTime && timeToMin(depTime) >= now && isValidTrip(sched[i])) {
      nextDepIdx = i;
      break;
    }
  }

  let html = '';
  sched.forEach((trip, i) => {
    const depTime = trip[fromIdx];
    const arrTime = trip[toIdx];
    if (!depTime || !arrTime) return;

    const depMin = timeToMin(depTime);
    const arrMin = timeToMin(arrTime);
    const duration = arrMin - depMin;
    const isPast = depMin < now;
    const isSelected = i === selectedTripIdx;
    const isNext = i === nextDepIdx;

    let cls = 'trip-item';
    if (isSelected) cls += ' selected';
    if (isPast && !isSelected) cls += ' past';
    if (isNext) cls += ' next-dep';

    let countdown = '';
    if (!isPast) {
      countdown = `<span class="trip-countdown" data-dep-min="${depMin}">${t('trip.remaining')}${formatCountdownI18n(depMin - now)}</span>`;
    }

    const isRunning = depMin <= now && now < arrMin;
    const nextBadge = isNext ? `<span class="next-dep-badge">${t('trip.nextDep')}</span>` : '';
    const runningBadge = isRunning ? `<span class="running-badge">${t('status.running')}</span>` : '';

    html += `<div class="${cls}" data-idx="${i}" onclick="selectTrip(${i})">
      <div class="trip-times">
        <span class="trip-dep">${depTime}</span>
        <span class="trip-arrow">&rarr;</span>
        <span class="trip-arr">${arrTime}</span>
        ${nextBadge}${runningBadge}
      </div>
      <div class="trip-meta">
        <span class="trip-duration">${duration}${t('trip.min')}</span>
        ${countdown}
      </div>
    </div>`;
  });

  if (nextDepIdx < 0) {
    html += `<div class="no-service-banner">${t('trip.serviceEnded')}</div>`;
  }

  document.getElementById('trip-list').innerHTML = html;

  if (_scrollToSelected) {
    _scrollToSelected = false;
    requestAnimationFrame(() => {
      const sel = document.querySelector('.trip-item.selected');
      if (sel) {
          const container = document.getElementById('trip-list');
          const top = sel.offsetTop - container.offsetTop - container.clientHeight / 2 + sel.clientHeight / 2;
          container.scrollTo({ top, behavior: 'smooth' });
        }
    });
  }
  updateSearchCountdown();
}

// ===== Multi-Route Trip List =====
function updateMultiTripList() {
  const mr = getMultiRoute(selectedRouteId);
  if (!mr) return;

  // Ensure _multiStops is populated
  if (_multiStops.length === 0) {
    _multiStops = getMultiRouteStops(selectedRouteId);
  }

  currentConnections = findConnections(selectedRouteId, dayType, selectedFromStop, selectedToStop);

  // Filter out connections with invalid times for the selected from/to stops
  // (e.g., midnight-crossing trips where arrTime < depTime)
  currentConnections = currentConnections.filter(conn => {
    const dep = getConnDepTime(conn, selectedFromStop);
    const arr = getConnArrTime(conn, selectedToStop);
    return dep && arr && timeToMin(arr) > timeToMin(dep);
  });

  // Sort by user's from-stop departure time (schedule order may differ at intermediate stops)
  currentConnections.sort((a, b) => {
    const aTime = timeToMin(getConnDepTime(a, selectedFromStop));
    const bTime = timeToMin(getConnDepTime(b, selectedFromStop));
    return aTime - bTime;
  });

  const now = nowMin();

  // Use from/to stops for displayed times
  const useFromStop = selectedFromStop;
  const useToStop = selectedToStop;

  // Auto-select next upcoming connection
  if (selectedTripIdx < 0) {
    for (let i = 0; i < currentConnections.length; i++) {
      const depTime = getConnDepTime(currentConnections[i], useFromStop);
      if (timeToMin(depTime) >= now) {
        selectedTripIdx = i;
        break;
      }
    }
  }

  if (selectedTripIdx >= currentConnections.length) {
    selectedTripIdx = currentConnections.length - 1;
  }

  // Find next departure
  let nextDepIdx = -1;
  for (let i = 0; i < currentConnections.length; i++) {
    const depTime = getConnDepTime(currentConnections[i], useFromStop);
    if (timeToMin(depTime) >= now) {
      nextDepIdx = i;
      break;
    }
  }

  let html = '';
  currentConnections.forEach((conn, i) => {
    const depTime = getConnDepTime(conn, useFromStop);
    const arrTime = getConnArrTime(conn, useToStop);
    const depMin = timeToMin(depTime);
    const arrMin = timeToMin(arrTime);
    const totalDuration = arrMin - depMin;
    const isPast = depMin < now;
    const isSelected = i === selectedTripIdx;
    const isNext = i === nextDepIdx;
    // Transfer count for selected from/to range
    const fromEntry = findMultiStopEntry(useFromStop);
    const toEntry = findMultiStopEntry(useToStop);
    const transferCount = (fromEntry && toEntry)
      ? Math.max(0, toEntry.segIdx - fromEntry.segIdx)
      : conn.segments.length - 1;

    // Skip connections where selected stops have no valid time
    if (!depTime || !arrTime || totalDuration <= 0) return;

    let cls = 'trip-item multi-trip';
    if (isSelected) cls += ' selected';
    if (isPast && !isSelected) cls += ' past';
    if (isNext) cls += ' next-dep';

    let countdown = '';
    if (!isPast) {
      countdown = `<span class="trip-countdown" data-dep-min="${depMin}">${t('trip.remaining')}${formatCountdownI18n(depMin - now)}</span>`;
    }

    const isRunning = depMin <= now && now < arrMin;
    const nextBadge = isNext ? `<span class="next-dep-badge">${t('trip.nextDep')}</span>` : '';
    const runningBadge = isRunning ? `<span class="running-badge">${t('status.running')}</span>` : '';

    // Build segment detail lines (visible when selected)
    // Filter to only show segments/stops between selected from/to
    let visSeg0 = fromEntry ? fromEntry.segIdx : 0;
    let visSeg1 = toEntry ? toEntry.segIdx : conn.segments.length - 1;
    let visStop0 = fromEntry ? fromEntry.stopIdx : 0;
    let visStop1 = toEntry ? toEntry.stopIdx : conn.segments[visSeg1].stops.length - 1;

    // Skip zero-duration first segment at non-walk transfer boundary
    if (visSeg0 < visSeg1 && visStop0 === conn.segments[visSeg0].stops.length - 1) {
      const tr = conn.transfers[visSeg0];
      if (tr && !tr.isWalk) { visSeg0++; visStop0 = 0; }
    }
    // Skip zero-duration last segment at non-walk transfer boundary
    if (visSeg1 > visSeg0 && visStop1 === 0) {
      const tr = conn.transfers[visSeg1 - 1];
      if (tr && !tr.isWalk) { visSeg1--; visStop1 = conn.segments[visSeg1].stops.length - 1; }
    }

    let detailHtml = '<div class="trip-segments">';
    let skipNextDep = false;
    for (let si = visSeg0; si <= visSeg1; si++) {
      const seg = conn.segments[si];
      const vFirst = (si === visSeg0) ? visStop0 : 0;
      const vLast = (si === visSeg1) ? visStop1 : seg.stops.length - 1;
      const vDepName = seg.stops[vFirst];
      const vDepTime = seg.trip[vFirst] || seg.depTime;
      const vArrName = seg.stops[vLast];
      const vArrTime = seg.trip[vLast] || seg.arrTime;
      const isZeroDuration = vFirst === vLast;

      // Zero-duration segment at the end: previous transfer already showed this stop
      if (isZeroDuration && si === visSeg1 && skipNextDep) {
        break;
      }

      // Departure stop (skip for zero-duration segments and when skipNextDep)
      if (!skipNextDep && !isZeroDuration) {
        detailHtml += `<div class="seg-stop-row">`;
        detailHtml += `<span class="seg-stop-name">${tStop(vDepName)}</span>`;
        detailHtml += `<span class="seg-stop-time">${vDepTime} ${t('trip.dep')}</span>`;
        detailHtml += `</div>`;
      }
      skipNextDep = false;

      if (si < visSeg1 && si < conn.transfers.length) {
        const tr = conn.transfers[si];
        const nextSeg = conn.segments[si + 1];

        if (isZeroDuration) {
          // Zero-duration segment at a transfer boundary:
          // skip arrival row, just show transfer and next departure
          if (tr.isWalk) {
            detailHtml += `<div class="seg-transfer walk">`;
            detailHtml += t('trip.walkTransfer', { n: tr.waitMin });
            detailHtml += `</div>`;
            detailHtml += `<div class="seg-stop-row">`;
            detailHtml += `<span class="seg-stop-name">${tStop(nextSeg.stops[0])}</span>`;
            detailHtml += `<span class="seg-stop-time">${nextSeg.depTime} ${t('trip.dep')}</span>`;
            detailHtml += `</div>`;
          } else {
            detailHtml += `<div class="seg-transfer walk">${t('trip.waitTransfer', { n: tr.waitMin })}</div>`;
            detailHtml += `<div class="seg-stop-row">`;
            detailHtml += `<span class="seg-stop-name">${tStop(nextSeg.stops[0])}</span>`;
            detailHtml += `<span class="seg-stop-time">${nextSeg.depTime} ${t('trip.dep')}</span>`;
            detailHtml += `</div>`;
          }
          skipNextDep = true;
        } else if (!tr.isWalk) {
          // Same-station transfer: merge arrival + next departure
          detailHtml += `<div class="seg-stop-row seg-stop-transfer">`;
          detailHtml += `<span class="seg-stop-name">${tStop(vArrName)}</span>`;
          detailHtml += `<div class="seg-stop-times-col">`;
          detailHtml += `<span class="seg-stop-time">${vArrTime} ${t('trip.arr')}</span>`;
          detailHtml += `</div></div>`;
          detailHtml += `<div class="seg-transfer walk">${t('trip.waitTransfer', { n: tr.waitMin })}</div>`;
          detailHtml += `<div class="seg-stop-row">`;
          detailHtml += `<span class="seg-stop-name">${tStop(nextSeg.stops[0])}</span>`;
          detailHtml += `<span class="seg-stop-time">${nextSeg.depTime} ${t('trip.dep')}</span>`;
          detailHtml += `</div>`;
          skipNextDep = true;
        } else {
          detailHtml += `<div class="seg-stop-row">`;
          detailHtml += `<span class="seg-stop-name">${tStop(vArrName)}</span>`;
          detailHtml += `<span class="seg-stop-time">${vArrTime} ${t('trip.arr')}</span>`;
          detailHtml += `</div>`;
          detailHtml += `<div class="seg-transfer walk">`;
          detailHtml += t('trip.walkTransfer', { n: tr.waitMin });
          detailHtml += `</div>`;
          detailHtml += `<div class="seg-stop-row">`;
          detailHtml += `<span class="seg-stop-name">${tStop(nextSeg.stops[0])}</span>`;
          detailHtml += `<span class="seg-stop-time">${nextSeg.depTime} ${t('trip.dep')}</span>`;
          detailHtml += `</div>`;
          skipNextDep = true;
        }
      } else if (!isZeroDuration) {
        // Last visible segment: show arrival
        detailHtml += `<div class="seg-stop-row">`;
        detailHtml += `<span class="seg-stop-name">${tStop(vArrName)}</span>`;
        detailHtml += `<span class="seg-stop-time">${vArrTime} ${t('trip.arr')}</span>`;
        detailHtml += `</div>`;
      }
    }
    detailHtml += '</div>';

    html += `<div class="${cls}" data-idx="${i}" onclick="selectTrip(${i})">
      <div class="trip-header">
        <div class="trip-header-content">
          <div class="trip-times">
            <span class="trip-dep">${depTime}</span>
            <span class="trip-arrow">&rarr;</span>
            <span class="trip-arr">${arrTime}</span>
            ${nextBadge}${runningBadge}
          </div>
          <div class="trip-meta">
            <span class="trip-duration">${totalDuration}${t('trip.min')}</span>
            ${transferCount > 0 ? `<span class="trip-transfers">${tPlural('trip.transfers', transferCount, { n: transferCount })}</span>` : ''}
            ${countdown}
          </div>
        </div>
        <button class="trip-expand-btn" onclick="event.stopPropagation();toggleTripExpand(${i})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      </div>
      <div class="trip-segments-wrapper"><div class="trip-segments-inner">${detailHtml}</div></div>
    </div>`;
  });

  if (!html) {
    html = `<div class="no-results">${t('trip.noResults')}</div>`;
  }

  if (nextDepIdx < 0 && currentConnections.length > 0) {
    html += `<div class="no-service-banner">${t('trip.serviceEnded')}</div>`;
  }

  document.getElementById('trip-list').innerHTML = html;

  // Restore expanded state after rebuild
  _expandedTrips.forEach(idx => {
    const el = document.querySelector(`.trip-item[data-idx="${idx}"]`);
    if (el) el.classList.add('expanded');
  });

  if (_scrollToSelected) {
    _scrollToSelected = false;
    requestAnimationFrame(() => {
      const sel = document.querySelector('.trip-item.selected');
      if (sel) {
          const container = document.getElementById('trip-list');
          const top = sel.offsetTop - container.offsetTop - container.clientHeight / 2 + sel.clientHeight / 2;
          container.scrollTo({ top, behavior: 'smooth' });
        }
    });
  }
  updateSearchCountdown();
}

function toggleTripExpand(idx) {
  const el = document.querySelector(`.trip-item[data-idx="${idx}"]`);
  if (el) {
    el.classList.toggle('expanded');
    if (_expandedTrips.has(idx)) _expandedTrips.delete(idx);
    else _expandedTrips.add(idx);
  }
  selectTrip(idx);
}

function selectTrip(idx) {
  selectedTripIdx = idx;
  _expandedSegs = new Set();

  document.querySelectorAll('.trip-item').forEach(el => {
    const elIdx = parseInt(el.dataset.idx);
    el.classList.toggle('selected', elIdx === idx);
    if (elIdx === idx) el.classList.remove('past');
  });

  updateSearchCountdown();

  if (currentTab === 'status') updateStatus();
  if (currentTab === 'map') updateMap();
}

function updateSearchCountdown() {
  const hero = document.getElementById('countdown-hero');
  const labelEl = document.getElementById('countdown-label');

  if (isMultiRoute(selectedRouteId)) {
    updateMultiSearchCountdown();
    return;
  }

  const route = getRoute(selectedRouteId);
  if (!route) return;

  const fromIdx = route.stops.indexOf(selectedFromStop);
  const toIdx = route.stops.indexOf(selectedToStop);
  const sched = route.schedules[dayType];

  // Check if all buses are done (no future departure)
  let hasNextDep = false;
  for (let i = 0; i < sched.length; i++) {
    const dt = sched[i][fromIdx];
    if (dt && timeToMin(dt) >= nowMin()) { hasNextDep = true; break; }
  }

  if (selectedTripIdx < 0 || !sched[selectedTripIdx]) {
    hero.classList.add('no-bus');
    if (!hasNextDep && sched.length > 0) {
      labelEl.textContent = '';
      document.getElementById('countdown-time').textContent = t('countdown.serviceEnded');
      document.getElementById('countdown-depart').textContent = '';
    } else {
      labelEl.textContent = '';
      document.getElementById('countdown-time').textContent = t('countdown.selectTrip');
      document.getElementById('countdown-depart').textContent = '';
    }
    return;
  }

  const trip = sched[selectedTripIdx];
  const depTime = trip[fromIdx];
  const arrTime = trip[toIdx];
  if (!depTime || !arrTime) return;

  const nowS = nowSec();
  const depSec = timeToMin(depTime) * 60;

  document.getElementById('countdown-depart').textContent = `${depTime} ${t('trip.dep')} → ${arrTime} ${t('trip.arr')}`;

  if (nowS < depSec) {
    hero.classList.remove('no-bus');
    labelEl.textContent = t('countdown.until');
    document.getElementById('countdown-time').innerHTML = formatCountdownSecHtml(depSec - nowS);
  } else {
    hero.classList.add('no-bus');
    labelEl.textContent = '';
    document.getElementById('countdown-time').textContent = t('countdown.departed');
  }

  updateTripCountdowns();
}

function updateMultiSearchCountdown() {
  const hero = document.getElementById('countdown-hero');
  const labelEl = document.getElementById('countdown-label');
  const mr = getMultiRoute(selectedRouteId);

  // Check if all buses are done
  let hasNextConn = false;
  if (mr) {
    const nowM = nowMin();
    for (let i = 0; i < currentConnections.length; i++) {
      const dt = getConnDepTime(currentConnections[i], selectedFromStop);
      if (timeToMin(dt) >= nowM) { hasNextConn = true; break; }
    }
  }

  if (!mr || selectedTripIdx < 0 || selectedTripIdx >= currentConnections.length) {
    hero.classList.add('no-bus');
    if (mr && !hasNextConn && currentConnections.length > 0) {
      labelEl.textContent = '';
      document.getElementById('countdown-time').textContent = t('countdown.serviceEnded');
      document.getElementById('countdown-depart').textContent = '';
    } else {
      labelEl.textContent = '';
      document.getElementById('countdown-time').textContent = t('countdown.selectTrip');
      document.getElementById('countdown-depart').textContent = '';
    }
    return;
  }

  const conn = currentConnections[selectedTripIdx];
  const depTime = getConnDepTime(conn, selectedFromStop);
  const arrTime = getConnArrTime(conn, selectedToStop);

  const nowS = nowSec();
  const depSec = timeToMin(depTime) * 60;

  const fromE = findMultiStopEntry(selectedFromStop);
  const toE = findMultiStopEntry(selectedToStop);
  const userTransfers = (fromE && toE) ? Math.max(0, toE.segIdx - fromE.segIdx) : conn.segments.length - 1;
  const transferInfo = userTransfers > 0 ? ` (${tPlural('trip.transfers', userTransfers, { n: userTransfers })})` : '';

  document.getElementById('countdown-depart').textContent =
    `${depTime} ${t('trip.dep')} → ${arrTime} ${t('trip.arr')}${transferInfo}`;

  if (nowS < depSec) {
    hero.classList.remove('no-bus');
    labelEl.textContent = t('countdown.until');
    document.getElementById('countdown-time').innerHTML = formatCountdownSecHtml(depSec - nowS);
  } else {
    hero.classList.add('no-bus');
    labelEl.textContent = '';
    document.getElementById('countdown-time').textContent = t('countdown.departed');
  }

  updateTripCountdowns();
}

function updateTripCountdowns() {
  const now = nowMin();
  document.querySelectorAll('.trip-countdown').forEach(el => {
    const depMin = parseInt(el.dataset.depMin);
    if (depMin >= now) {
      el.textContent = `${t('trip.remaining')}${formatCountdownI18n(depMin - now)}`;
    } else {
      el.textContent = '';
    }
  });
}

// ===== Favorites =====

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem('favorites')) || [];
  } catch (e) { return []; }
}

function saveFavorites(favs) {
  localStorage.setItem('favorites', JSON.stringify(favs));
}

function getFavDisplayName(fav) {
  // Build a short label: "from → to" using translated stop names
  return tStop(fav.from) + ' → ' + tStop(fav.to);
}

function renderFavDropdownList() {
  const favs = loadFavorites();
  const list = document.getElementById('fav-dropdown-list');
  if (!list) return;

  if (favs.length === 0) {
    list.innerHTML = `<div class="fav-dropdown-empty" data-i18n="fav.empty">${t('fav.empty')}</div>`;
    return;
  }

  list.innerHTML = favs.map((fav, i) =>
    `<div class="fav-dropdown-item" data-fav-idx="${i}">
      <span class="fav-dropdown-item-name">${fav.name || getFavDisplayName(fav)}</span>
      <button class="fav-delete-btn" data-fav-del="${i}" aria-label="${t('fav.delete')}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`
  ).join('');

  list.querySelectorAll('.fav-dropdown-item').forEach(item => {
    const idx = parseInt(item.dataset.favIdx);
    item.addEventListener('click', (e) => {
      if (e.target.closest('.fav-delete-btn')) return;
      applyFavorite(idx);
      closeFavDropdown();
    });
  });

  list.querySelectorAll('.fav-delete-btn').forEach(btn => {
    const idx = parseInt(btn.dataset.favDel);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFav(idx);
    });
  });
}

function applyFavorite(idx) {
  const favs = loadFavorites();
  const fav = favs[idx];
  if (!fav) return;

  // Validate route exists
  const preset = ROUTE_PRESETS.find(p => p.id === fav.route || p.reverseId === fav.route);
  if (!preset) return;

  selectedRouteId = fav.route;
  selectedTripIdx = -1;
  _scrollToSelected = true;
  _expandedTrips.clear();

  if (isMultiRoute(selectedRouteId)) {
    rebuildMultiStopSelects();
    // Override auto-selected from/to with saved values
    selectedFromStop = fav.from;
    selectedToStop = fav.to;
    // Update selects to match
    document.querySelectorAll('.from-select').forEach(sel => sel.value = fav.from);
    rebuildMultiToSelects();
    selectedToStop = fav.to;
    document.querySelectorAll('.to-select').forEach(sel => sel.value = fav.to);
    updateMultiTripList();
  } else {
    rebuildStopSelects();
    selectedFromStop = fav.from;
    selectedToStop = fav.to;
    document.querySelectorAll('.from-select').forEach(sel => sel.value = fav.from);
    rebuildToSelects();
    selectedToStop = fav.to;
    document.querySelectorAll('.to-select').forEach(sel => sel.value = fav.to);
    updateTripList();
  }

  syncControls();
  renderFavDropdownList();
  if (currentTab === 'status') updateStatus();
}

// ===== Favorites Dropdown =====

function toggleFavDropdown() {
  const dd = document.getElementById('fav-dropdown');
  if (dd.classList.contains('open')) {
    closeFavDropdown();
  } else {
    openFavDropdown();
  }
}

function openFavDropdown() {
  const dd = document.getElementById('fav-dropdown');
  dd.classList.add('open');
  // Close settings dropdown if open
  if (typeof closeSettingsDropdown === 'function') closeSettingsDropdown();
  renderFavDropdownList();
}

function closeFavDropdown() {
  document.getElementById('fav-dropdown').classList.remove('open');
}

function saveFavCurrent() {
  const favs = loadFavorites();
  const dup = favs.find(f => f.route === selectedRouteId && f.from === selectedFromStop && f.to === selectedToStop);
  if (dup) return;

  const name = prompt(t('fav.namePrompt'), getFavDisplayName({
    route: selectedRouteId, from: selectedFromStop, to: selectedToStop
  }));
  if (name === null) return;

  favs.push({
    route: selectedRouteId,
    from: selectedFromStop,
    to: selectedToStop,
    name: name || ''
  });
  saveFavorites(favs);
  renderFavDropdownList();
}

function deleteFav(idx) {
  const favs = loadFavorites();
  const name = favs[idx].name || getFavDisplayName(favs[idx]);
  if (!confirm(t('fav.deleteConfirm', { name: name }))) return;
  favs.splice(idx, 1);
  saveFavorites(favs);
  renderFavDropdownList();
}

// ===== Favorites Init =====

function initFavorites() {
  document.getElementById('fav-dropdown-btn').addEventListener('click', toggleFavDropdown);
  document.getElementById('fav-dropdown-save').addEventListener('click', saveFavCurrent);
  document.getElementById('fav-dropdown-backdrop').addEventListener('click', closeFavDropdown);
}
