// ===== Status Tab =====

// Track which segment indices are expanded (survives re-renders)
let _expandedSegs = new Set();

function updateStatus() {
  const header = document.getElementById('status-header');
  const timeline = document.getElementById('status-timeline');

  if (selectedTripIdx < 0) {
    header.innerHTML = '';
    timeline.innerHTML = '<div class="no-results">便検索タブで便を選択してください</div>';
    return;
  }

  // Multi-route: show connection details in status
  if (isMultiRoute(selectedRouteId)) {
    updateMultiStatus(header, timeline);
    return;
  }

  const route = getRoute(selectedRouteId);
  const sched = route.schedules[dayType];
  const trip = sched[selectedTripIdx];
  if (!trip) return;

  const now = nowMin();
  const depTime = trip[0];
  const arrTime = trip[trip.length - 1];
  const depMin = timeToMin(depTime);
  const arrMin = timeToMin(arrTime);

  // Status badge
  let statusText, statusClass;
  if (now < depMin) {
    statusText = '出発前';
    statusClass = 'before';
  } else if (now <= arrMin) {
    statusText = '運行中';
    statusClass = 'running';
  } else {
    statusText = '到着済';
    statusClass = 'arrived';
  }

  header.innerHTML = `
    <div class="status-route-name">${route.name}</div>
    <div class="status-trip-info">${depTime} 発 → ${arrTime} 着</div>
    <span class="status-badge ${statusClass}">${statusText}</span>
  `;

  // Find current segment
  let currentSegIdx = -1;
  for (let i = 0; i < trip.length - 1; i++) {
    const sMin = timeToMin(trip[i]);
    const eMin = timeToMin(trip[i + 1]);
    if (sMin !== null && eMin !== null && now >= sMin && now < eMin) {
      currentSegIdx = i;
      break;
    }
  }

  // Build timeline
  let timelineHtml = '';
  for (let i = 0; i < route.stops.length; i++) {
    const stopTime = trip[i];
    const stopMin = timeToMin(stopTime);

    let stopClass;
    if (now < depMin) {
      stopClass = 'upcoming';
    } else if (now >= arrMin) {
      stopClass = 'passed';
    } else if (i === currentSegIdx) {
      stopClass = 'current';
    } else if (stopMin !== null && now >= stopMin) {
      stopClass = 'passed';
    } else {
      stopClass = 'upcoming';
    }

    // Marker for user's from/to stops
    let marker = '';
    if (route.stops[i] === selectedFromStop) marker = '<span class="timeline-stop-marker">乗車</span>';
    if (route.stops[i] === selectedToStop) marker = '<span class="timeline-stop-marker">降車</span>';

    const isLast = i === route.stops.length - 1;
    timelineHtml += `
      <div class="timeline-stop ${stopClass}">
        <div class="timeline-dot"></div>
        ${!isLast ? '<div class="timeline-line"></div>' : ''}
        <div class="timeline-info">
          <span class="timeline-stop-name">${route.stops[i]}${marker}</span>
          <span class="timeline-stop-time">${stopTime || '-'}</span>
        </div>
      </div>
    `;
  }

  timeline.innerHTML = timelineHtml;
}

function updateMultiStatus(header, timeline) {
  const mr = getMultiRoute(selectedRouteId);
  if (!mr || selectedTripIdx < 0 || selectedTripIdx >= currentConnections.length) {
    header.innerHTML = '';
    timeline.innerHTML = '<div class="no-results">便検索タブで便を選択してください</div>';
    return;
  }

  const conn = currentConnections[selectedTripIdx];
  const now = nowMin();

  // Ensure _multiStops is populated
  if (_multiStops.length === 0) {
    _multiStops = getMultiRouteStops(selectedRouteId);
  }

  // Use user's selected from/to stops
  const userDepTime = getConnDepTime(conn, selectedFromStop);
  const userArrTime = getConnArrTime(conn, selectedToStop);
  const userDepMin = timeToMin(userDepTime);
  const userArrMin = timeToMin(userArrTime);

  // Transfer count between selected from/to
  const fromEntry = findMultiStopEntry(selectedFromStop);
  const toEntry = findMultiStopEntry(selectedToStop);
  const userTransferCount = (fromEntry && toEntry)
    ? Math.max(0, toEntry.segIdx - fromEntry.segIdx)
    : conn.segments.length - 1;

  let statusText, statusClass;
  if (now < userDepMin) {
    statusText = '出発前';
    statusClass = 'before';
  } else if (now <= userArrMin) {
    statusText = '移動中';
    statusClass = 'running';
  } else {
    statusText = '到着済';
    statusClass = 'arrived';
  }

  const transferInfo = userTransferCount > 0 ? `（乗換${userTransferCount}回）` : '';
  header.innerHTML = `
    <div class="status-route-name">${mr.name}</div>
    <div class="status-trip-info">${userDepTime} 発 → ${userArrTime} 着${transferInfo}</div>
    <span class="status-badge ${statusClass}">${statusText}</span>
  `;

  // Determine visible segment range based on selected from/to
  const visSeg0 = fromEntry ? fromEntry.segIdx : 0;
  const visSeg1 = toEntry ? toEntry.segIdx : conn.segments.length - 1;
  const visStop0 = fromEntry ? fromEntry.stopIdx : 0;
  const visStop1 = toEntry ? toEntry.stopIdx : conn.segments[visSeg1].stops.length - 1;

  // Build timeline for multi-route with collapsible intermediate stops
  let timelineHtml = '';
  for (let si = visSeg0; si <= visSeg1; si++) {
    const seg = conn.segments[si];
    const segLabel = seg.type === 'train' ? '電車' : 'バス';
    const isLastVisibleSeg = si === visSeg1;

    // Visible stop range within this segment
    const vFirst = (si === visSeg0) ? visStop0 : 0;
    const vLast = (si === visSeg1) ? visStop1 : seg.stops.length - 1;
    const vDepMin = timeToMin(seg.trip[vFirst]);
    const vArrMin = timeToMin(seg.trip[vLast]);

    const hasIntermediateStops = (vLast - vFirst) > 1;

    // Find which stop index is "current" within this segment
    let currentStopIdx = -1;
    for (let j = vFirst; j < vLast; j++) {
      const sMin = timeToMin(seg.trip[j]);
      const eMin = timeToMin(seg.trip[j + 1]);
      if (sMin !== null && eMin !== null && now >= sMin && now < eMin) {
        currentStopIdx = j;
        break;
      }
    }

    function stopClass(j) {
      const tMin = timeToMin(seg.trip[j]);
      if (now < vDepMin) return 'upcoming';
      if (now >= vArrMin) return 'passed';
      if (j === currentStopIdx) return 'current';
      if (tMin !== null && now >= tMin) return 'passed';
      return 'upcoming';
    }

    // Helper: marker for user's from/to stops
    function stopMarker(stopName) {
      if (stopName === selectedFromStop) return '<span class="timeline-stop-marker">乗車</span>';
      if (stopName === selectedToStop) return '<span class="timeline-stop-marker">降車</span>';
      return '';
    }

    // --- Zero-duration segment (from/to at segment boundary) ---
    if (vFirst === vLast) {
      const stopName = seg.stops[vFirst];
      const stopTime = seg.trip[vFirst] || '';
      const cls = stopClass(vFirst);

      if (!isLastVisibleSeg && si < conn.transfers.length) {
        // Show as starting point with transfer
        const tr = conn.transfers[si];
        const transferText = tr.isWalk
          ? `徒歩（乗換${tr.waitMin}分）`
          : `乗換（${tr.waitMin}分待）`;
        timelineHtml += `
          <div class="timeline-stop ${cls}">
            <div class="timeline-dot"></div>
            <div class="timeline-line line-transfer"></div>
            <div class="timeline-stop-body">
              <div class="timeline-info">
                <span class="timeline-stop-name">${stopName}${stopMarker(stopName)}</span>
                <span class="timeline-stop-time">${stopTime}</span>
              </div>
              <span class="timeline-transfer-text">${transferText}</span>
            </div>
          </div>
        `;
      } else {
        // Show as arrival endpoint
        timelineHtml += `
          <div class="timeline-stop ${cls}">
            <div class="timeline-dot"></div>
            <div class="timeline-stop-body">
              <div class="timeline-info">
                <span class="timeline-stop-name">${stopName}${stopMarker(stopName)}</span>
                <span class="timeline-stop-time">${stopTime} <small class="time-label">着</small></span>
              </div>
            </div>
          </div>
        `;
      }
      continue;
    }

    // --- Departure stop (with transport type as sub-label) ---
    const depCls = stopClass(vFirst);
    const depStopName = seg.stops[vFirst];
    const depTime = seg.trip[vFirst] || seg.depTime;

    timelineHtml += `
      <div class="timeline-stop ${depCls}">
        <div class="timeline-dot"></div>
        <div class="timeline-line"></div>
        <div class="timeline-stop-body">
          <div class="timeline-info">
            <span class="timeline-stop-name">${depStopName}${stopMarker(depStopName)}</span>
            <span class="timeline-stop-time">${depTime} <small class="time-label">発</small></span>
          </div>
          <span class="timeline-seg-type">${segLabel}</span>
        </div>
      </div>
    `;

    // --- Intermediate stops (collapsed by default) ---
    if (hasIntermediateStops) {
      const midCount = vLast - vFirst - 1;
      let passedMid = 0;
      for (let j = vFirst + 1; j < vLast; j++) {
        const cls = stopClass(j);
        if (cls === 'passed' || cls === 'current') passedMid++;
      }
      const progressText = now >= vDepMin && now < vArrMin
        ? `（${passedMid}/${midCount}駅通過）`
        : '';

      const isExpanded = _expandedSegs.has(si);
      timelineHtml += `
        <div class="timeline-expand-row" onclick="toggleMidStops(this, ${si})">
          <div class="timeline-expand-line"></div>
          <button class="timeline-expand-btn" type="button">
            <span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>
            途中${midCount}駅${progressText}
          </button>
        </div>
        <div class="timeline-mid-stops${isExpanded ? '' : ' collapsed'}">
      `;

      for (let j = vFirst + 1; j < vLast; j++) {
        const cls = stopClass(j);
        const midTime = seg.trip[j] || '-';
        timelineHtml += `
          <div class="timeline-stop timeline-stop-mid ${cls}">
            <div class="timeline-dot"></div>
            <div class="timeline-line"></div>
            <div class="timeline-info">
              <span class="timeline-stop-name">${seg.stops[j]}${stopMarker(seg.stops[j])}</span>
              <span class="timeline-stop-time">${midTime}</span>
            </div>
          </div>
        `;
      }
      timelineHtml += '</div>';
    }

    // --- Arrival stop (with optional transfer info as sub-label) ---
    const arrCls = stopClass(vLast);
    const arrStopName = seg.stops[vLast];
    const arrTime = seg.trip[vLast] || seg.arrTime;
    const arrMarker = stopMarker(arrStopName);

    if (!isLastVisibleSeg && si < conn.transfers.length) {
      const tr = conn.transfers[si];
      const transferText = tr.isWalk
        ? `徒歩（乗換${tr.waitMin}分）`
        : `乗換（${tr.waitMin}分待）`;

      timelineHtml += `
        <div class="timeline-stop ${arrCls}">
          <div class="timeline-dot"></div>
          <div class="timeline-line line-transfer"></div>
          <div class="timeline-stop-body">
            <div class="timeline-info">
              <span class="timeline-stop-name">${arrStopName}${arrMarker}</span>
              <span class="timeline-stop-time">${arrTime} <small class="time-label">着</small></span>
            </div>
            <span class="timeline-transfer-text">${transferText}</span>
          </div>
        </div>
      `;
    } else {
      timelineHtml += `
        <div class="timeline-stop ${arrCls}">
          <div class="timeline-dot"></div>
          <div class="timeline-stop-body">
            <div class="timeline-info">
              <span class="timeline-stop-name">${arrStopName}${arrMarker}</span>
              <span class="timeline-stop-time">${arrTime} <small class="time-label">着</small></span>
            </div>
          </div>
        </div>
      `;
    }
  }

  timeline.innerHTML = timelineHtml;
}

// Toggle intermediate stops visibility
function toggleMidStops(expandRow, segIdx) {
  const midStops = expandRow.nextElementSibling;
  const icon = expandRow.querySelector('.expand-icon');
  if (midStops.classList.contains('collapsed')) {
    midStops.classList.remove('collapsed');
    icon.textContent = '▼';
    _expandedSegs.add(segIdx);
  } else {
    midStops.classList.add('collapsed');
    icon.textContent = '▶';
    _expandedSegs.delete(segIdx);
  }
}
