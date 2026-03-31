// ===== Search (shared controls between tabs) =====

// Cached multi-route stop entries for current route
let _multiStops = []; // array of { name, segIdx, stopIdx }

// Route presets: displayed in dropdown with ↔ notation.
// Selecting a preset sets the forward (rightward) route ID.
const ROUTE_PRESETS = [
  { id: 'komatsu_outbound',        reverseId: 'komatsu_inbound',        i18nKey: 'route.jaist_komatsu' },
  { id: 'tsurugi_outbound',        reverseId: 'tsurugi_inbound',        i18nKey: 'route.jaist_tsurugi' },
  { id: 'jaist_tsurugi_kanazawa',  reverseId: 'kanazawa_tsurugi_jaist', i18nKey: 'route.jaist_tsurugi_kanazawa' },
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
      selectedTripIdx = -1;
      _scrollToSelected = true;
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
}

// ===== Stop Select Helpers for Direct Routes =====

function rebuildStopSelects() {
  const route = getRoute(selectedRouteId);
  const fromOpts = route.stops.slice(0, -1).map(s =>
    `<option value="${s}">${tStop(s)}</option>`
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
  const fromIdx = route.stops.indexOf(selectedFromStop);
  const toOptions = route.stops.slice(fromIdx + 1);
  if (toOptions.length === 0) return;
  const toOpts = toOptions.map(s =>
    `<option value="${s}">${tStop(s)}</option>`
  ).join('');
  selectedToStop = toOptions[toOptions.length - 1];

  document.querySelectorAll('.to-select').forEach(sel => {
    sel.innerHTML = toOpts;
    sel.value = selectedToStop;
  });
}

// ===== Stop Select Helpers for Multi-Routes =====

function rebuildMultiStopSelects() {
  _multiStops = getMultiRouteStops(selectedRouteId);
  const stopNames = _multiStops.map(s => s.name);

  const fromOpts = stopNames.slice(0, -1).map(s =>
    `<option value="${s}">${tStop(s)}</option>`
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
  const fromIdx = stopNames.indexOf(selectedFromStop);
  const toOptions = stopNames.slice(fromIdx + 1);
  if (toOptions.length === 0) return;
  const toOpts = toOptions.map(s =>
    `<option value="${s}">${tStop(s)}</option>`
  ).join('');
  selectedToStop = toOptions[toOptions.length - 1];

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
}

function swapRoute() {
  // Multi-route swap
  if (isMultiRoute(selectedRouteId)) {
    const mr = getMultiRoute(selectedRouteId);
    if (mr && mr.reverse_id) {
      selectedRouteId = mr.reverse_id;
      selectedTripIdx = -1;
      _scrollToSelected = true;
      rebuildMultiStopSelects();
      syncControls();
      updateMultiTripList();
      if (currentTab === 'status') updateStatus();
    }
    return;
  }

  // Direct route swap
  const reverseId = REVERSE_ROUTES[selectedRouteId];
  if (!reverseId) return;

  const oldFrom = selectedFromStop;
  const oldTo = selectedToStop;

  selectedRouteId = reverseId;
  rebuildStopSelects();

  const route = getRoute(reverseId);
  if (route.stops.includes(oldTo)) {
    selectedFromStop = oldTo;
    document.querySelectorAll('.from-select').forEach(sel => {
      sel.value = oldTo;
    });
    rebuildToSelects();
    if (route.stops.includes(oldFrom)) {
      selectedToStop = oldFrom;
      document.querySelectorAll('.to-select').forEach(sel => {
        sel.value = oldFrom;
      });
    }
  }

  syncControls();
  selectedTripIdx = -1;
  _scrollToSelected = true;
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
  return getConnectionStopTime(conn, entry) || conn.depTime;
}

function getConnArrTime(conn, toStopName) {
  const entry = findMultiStopEntry(toStopName);
  if (!entry) return conn.arrTime;
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

  if (selectedTripIdx < 0) {
    for (let i = 0; i < sched.length; i++) {
      const depTime = sched[i][fromIdx];
      if (depTime && timeToMin(depTime) >= now) {
        selectedTripIdx = i;
        break;
      }
    }
  }

  let nextDepIdx = -1;
  for (let i = 0; i < sched.length; i++) {
    const depTime = sched[i][fromIdx];
    if (depTime && timeToMin(depTime) >= now) {
      nextDepIdx = i;
      break;
    }
  }

  // Check if all buses for today are finished
  const allDone = nextDepIdx < 0;

  let html = '';
  if (allDone) {
    html += `<div class="no-service-banner">${t('trip.serviceEnded')}</div>`;
  }
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

    const nextBadge = isNext ? `<span class="next-dep-badge">${t('trip.nextDep')}</span>` : '';

    html += `<div class="${cls}" data-idx="${i}" onclick="selectTrip(${i})">
      <div class="trip-times">
        <span class="trip-dep">${depTime}</span>
        <span class="trip-arrow">&rarr;</span>
        <span class="trip-arr">${arrTime}</span>
        ${nextBadge}
      </div>
      <div class="trip-meta">
        <span class="trip-duration">${duration}${t('trip.min')}</span>
        ${countdown}
      </div>
    </div>`;
  });

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
  _initialLoad = false;

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

  currentConnections = findConnections(selectedRouteId, dayType);

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

  // Check if all buses for today are finished
  const allDone = nextDepIdx < 0;

  let html = '';
  if (allDone) {
    html += `<div class="no-service-banner">${t('trip.serviceEnded')}</div>`;
  }
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

    const nextBadge = isNext ? `<span class="next-dep-badge">${t('trip.nextDep')}</span>` : '';

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
      const segDur = timeToMin(vArrTime) - timeToMin(vDepTime);
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
            detailHtml += `<div class="seg-stop-row">`;
            detailHtml += `<span class="seg-stop-name">${tStop(nextSeg.stops[0])}</span>`;
            detailHtml += `<span class="seg-stop-time">${nextSeg.depTime} ${t('trip.dep')} <span class="seg-dur">${t('trip.waitTransfer', { n: tr.waitMin })}</span></span>`;
            detailHtml += `</div>`;
          }
          skipNextDep = true;
        } else if (!tr.isWalk) {
          // Same-station transfer: merge arrival + next departure
          detailHtml += `<div class="seg-stop-row seg-stop-transfer">`;
          detailHtml += `<span class="seg-stop-name">${tStop(vArrName)}</span>`;
          detailHtml += `<div class="seg-stop-times-col">`;
          detailHtml += `<span class="seg-stop-time">${vArrTime} ${t('trip.arr')} <span class="seg-dur">${segDur}${t('trip.min')}</span></span>`;
          detailHtml += `<span class="seg-stop-time">${nextSeg.depTime} ${t('trip.dep')} <span class="seg-dur">${t('trip.waitTransfer', { n: tr.waitMin })}</span></span>`;
          detailHtml += `</div></div>`;
          skipNextDep = true;
        } else {
          detailHtml += `<div class="seg-stop-row">`;
          detailHtml += `<span class="seg-stop-name">${tStop(vArrName)}</span>`;
          detailHtml += `<span class="seg-stop-time">${vArrTime} ${t('trip.arr')}</span>`;
          detailHtml += `<span class="seg-dur">${segDur}${t('trip.min')}</span>`;
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
        detailHtml += `<span class="seg-dur">${segDur}${t('trip.min')}</span>`;
        detailHtml += `</div>`;
      }
    }
    detailHtml += '</div>';

    html += `<div class="${cls}" data-idx="${i}" onclick="selectTrip(${i})">
      <div class="trip-times">
        <span class="trip-dep">${depTime}</span>
        <span class="trip-arrow">&rarr;</span>
        <span class="trip-arr">${arrTime}</span>
        ${nextBadge}
      </div>
      <div class="trip-meta">
        <span class="trip-duration">${totalDuration}${t('trip.min')}</span>
        ${transferCount > 0 ? `<span class="trip-transfers">${tPlural('trip.transfers', transferCount, { n: transferCount })}</span>` : ''}
        ${countdown}
      </div>
      ${isSelected ? detailHtml : ''}
    </div>`;
  });

  if (!html) {
    html = `<div class="no-results">${t('trip.noResults')}</div>`;
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
  _initialLoad = false;

  updateSearchCountdown();
}

function selectTrip(idx) {
  selectedTripIdx = idx;
  _expandedSegs = new Set(); // reset expanded state on trip change

  if (isMultiRoute(selectedRouteId)) {
    updateMultiTripList();
  } else {
    document.querySelectorAll('.trip-item').forEach(el => {
      const elIdx = parseInt(el.dataset.idx);
      el.classList.toggle('selected', elIdx === idx);
      if (elIdx === idx) el.classList.remove('past');
    });
  }

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
      document.getElementById('countdown-time').textContent = '';
      document.getElementById('countdown-route').textContent = t('countdown.serviceEnded');
      document.getElementById('countdown-depart').textContent = '';
      labelEl.textContent = '';
    } else {
      document.getElementById('countdown-time').textContent = '--:--';
      document.getElementById('countdown-route').textContent = t('countdown.selectTrip');
      document.getElementById('countdown-depart').textContent = '';
      labelEl.textContent = '';
    }
    return;
  }

  const trip = sched[selectedTripIdx];
  const depTime = trip[fromIdx];
  const arrTime = trip[toIdx];
  if (!depTime || !arrTime) return;

  const nowS = nowSec();
  const depSec = timeToMin(depTime) * 60;

  document.getElementById('countdown-route').textContent = tRouteDisplay(selectedRouteId, route.short_name, route.name);
  document.getElementById('countdown-depart').textContent = `${depTime} ${t('trip.dep')} → ${arrTime} ${t('trip.arr')}`;

  if (nowS < depSec) {
    hero.classList.remove('no-bus');
    labelEl.textContent = t('countdown.until');
    document.getElementById('countdown-time').textContent = formatCountdownSec(depSec - nowS);
  } else {
    hero.classList.add('no-bus');
    labelEl.textContent = t('countdown.departed');
    document.getElementById('countdown-time').textContent = depTime + ' ' + t('trip.dep');
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
      document.getElementById('countdown-time').textContent = '';
      document.getElementById('countdown-route').textContent = t('countdown.serviceEnded');
      document.getElementById('countdown-depart').textContent = '';
      labelEl.textContent = '';
    } else {
      document.getElementById('countdown-time').textContent = '--:--';
      document.getElementById('countdown-route').textContent = t('countdown.selectTrip');
      document.getElementById('countdown-depart').textContent = '';
      labelEl.textContent = '';
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
  const transferInfo = userTransfers > 0 ? `(${tPlural('trip.transfers', userTransfers, { n: userTransfers })})` : '';

  document.getElementById('countdown-route').textContent = tRouteDisplay(selectedRouteId, mr.short_name, mr.name);
  document.getElementById('countdown-depart').textContent =
    `${depTime} ${t('trip.dep')} → ${arrTime} ${t('trip.arr')}${transferInfo}`;

  if (nowS < depSec) {
    hero.classList.remove('no-bus');
    labelEl.textContent = t('countdown.until');
    document.getElementById('countdown-time').textContent = formatCountdownSec(depSec - nowS);
  } else {
    hero.classList.add('no-bus');
    labelEl.textContent = t('countdown.departed');
    document.getElementById('countdown-time').textContent = depTime + ' ' + t('trip.dep');
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
