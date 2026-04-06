// ===== Status Tab =====

// _expandedSegs is declared in utils.js (global state)

function updateStatus() {
  const header = document.getElementById('status-header');
  const timeline = document.getElementById('status-timeline');

  if (selectedTripIdx < 0) {
    header.innerHTML = '';
    timeline.innerHTML = `<div class="no-results">${t('status.selectTrip')}</div>`;
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
    statusText = t('status.before');
    statusClass = 'before';
  } else if (now <= arrMin) {
    statusText = t('status.running');
    statusClass = 'running';
  } else {
    statusText = t('status.arrived');
    statusClass = 'arrived';
  }

  header.innerHTML = `
    <div class="status-trip-info">${depTime} ${t('trip.dep')} → ${arrTime} ${t('trip.arr')}</div>
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

  // Segment label for direct routes
  const directRoute = ROUTES_CONFIG && ROUTES_CONFIG.direct_routes.find(r => r.id === selectedRouteId);
  const segLabel = directRoute ? tSegLabel(directRoute.segment) : '';
  const segReserveLink = (directRoute && directRoute.segment === 'shuttle_komatsu') ? ` ${t('status.reserveLink')}` : '';

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
    if (route.stops[i] === selectedFromStop) marker = `<span class="timeline-stop-marker">${t('status.boarding')}</span>`;
    if (route.stops[i] === selectedToStop) marker = `<span class="timeline-stop-marker">${t('status.alighting')}</span>`;

    const isFirst = i === 0;
    const isLast = i === route.stops.length - 1;
    timelineHtml += `
      <div class="timeline-stop ${stopClass}">
        <div class="timeline-dot"></div>
        ${!isLast ? '<div class="timeline-line"></div>' : ''}
        <div class="timeline-info">
          <span class="timeline-stop-name">${tStop(route.stops[i])}${marker}</span>
          <span class="timeline-stop-time">${stopTime || '-'}</span>
        </div>
      `;
    } else {
      timelineHtml += `
        <div class="timeline-stop ${stopClass}">
          <div class="timeline-dot"></div>
          ${!isLast ? '<div class="timeline-line"></div>' : ''}
          <div class="timeline-info">
            <span class="timeline-stop-name">${tStop(route.stops[i])}${marker}</span>
            <span class="timeline-stop-time">${stopTime || '-'}</span>
          </div>
        </div>
      `;
    }
  }

  timeline.innerHTML = timelineHtml;
}

function updateMultiStatus(header, timeline) {
  const mr = getMultiRoute(selectedRouteId);
  if (!mr || selectedTripIdx < 0 || selectedTripIdx >= currentConnections.length) {
    header.innerHTML = '';
    timeline.innerHTML = `<div class="no-results">${t('status.selectTrip')}</div>`;
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
    statusText = t('status.before');
    statusClass = 'before';
  } else if (now <= userArrMin) {
    statusText = t('status.running');
    statusClass = 'running';
  } else {
    statusText = t('status.arrived');
    statusClass = 'arrived';
  }

  const transferInfo = userTransferCount > 0 ? `(${tPlural('trip.transfers', userTransferCount, { n: userTransferCount })})` : '';
  header.innerHTML = `
    <div class="status-trip-info">${userDepTime} ${t('trip.dep')} → ${userArrTime} ${t('trip.arr')}${transferInfo}</div>
    <span class="status-badge ${statusClass}">${statusText}</span>
  `;

  // Determine visible segment range based on selected from/to
  let visSeg0 = fromEntry ? fromEntry.segIdx : 0;
  let visSeg1 = toEntry ? toEntry.segIdx : conn.segments.length - 1;
  let visStop0 = fromEntry ? fromEntry.stopIdx : 0;
  let visStop1 = toEntry ? toEntry.stopIdx : conn.segments[visSeg1].stops.length - 1;

  // Skip zero-duration first segment at non-walk transfer boundary
  if (visSeg0 < visSeg1 && visStop0 === conn.segments[visSeg0].stops.length - 1) {
    const tr = conn.transfers[visSeg0];
    if (tr && !tr.isWalk) {
      visSeg0++;
      visStop0 = 0;
    }
  }
  // Skip zero-duration last segment at non-walk transfer boundary
  if (visSeg1 > visSeg0 && visStop1 === 0) {
    const tr = conn.transfers[visSeg1 - 1];
    if (tr && !tr.isWalk) {
      visSeg1--;
      visStop1 = conn.segments[visSeg1].stops.length - 1;
    }
  }

  // Build timeline for multi-route with collapsible intermediate stops
  let timelineHtml = '';
  for (let si = visSeg0; si <= visSeg1; si++) {
    const seg = conn.segments[si];
    const segMeta = SEGMENTS[seg.segmentId] && SEGMENTS[seg.segmentId].meta;
    const segLabel = segMeta ? tOperator(segMeta.operator) : (seg.type === 'train' ? t('status.train') : t('status.bus'));
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
      if (stopName === selectedFromStop) return `<span class="timeline-stop-marker">${t('status.boarding')}</span>`;
      if (stopName === selectedToStop) return `<span class="timeline-stop-marker">${t('status.alighting')}</span>`;
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
          ? t('status.walkTransfer', { n: tr.waitMin })
          : t('status.waitTransfer', { n: tr.waitMin });
        timelineHtml += `
          <div class="timeline-stop ${cls}">
            <div class="timeline-dot"></div>
            <div class="timeline-line line-transfer"></div>
            <div class="timeline-stop-body">
              <div class="timeline-info">
                <span class="timeline-stop-name">${tStop(stopName)}${stopMarker(stopName)}</span>
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
                <span class="timeline-stop-name">${tStop(stopName)}${stopMarker(stopName)}</span>
                <span class="timeline-stop-time">${stopTime} <small class="time-label">${t('trip.arr')}</small></span>
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
            <span class="timeline-stop-name">${tStop(depStopName)}${stopMarker(depStopName)}</span>
            <span class="timeline-stop-time">${depTime} <small class="time-label">${t('trip.dep')}</small></span>
          </div>
          <span class="timeline-seg-type">${segLabel}${segReserveLink}</span>
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
        ? t('status.midProgress', { passed: passedMid, total: midCount })
        : '';

      const isExpanded = _expandedSegs.has(si);
      timelineHtml += `
        <div class="timeline-expand-row" onclick="toggleMidStops(this, ${si})">
          <div class="timeline-expand-line"></div>
          <button class="timeline-expand-btn" type="button">
            <span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>
            ${t('status.midStops', { n: midCount })}${progressText}
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
              <span class="timeline-stop-name">${tStop(seg.stops[j])}${stopMarker(seg.stops[j])}</span>
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
        ? t('status.walkTransfer', { n: tr.waitMin })
        : t('status.waitTransfer', { n: tr.waitMin });

      timelineHtml += `
        <div class="timeline-stop ${arrCls}">
          <div class="timeline-dot"></div>
          <div class="timeline-line line-transfer"></div>
          <div class="timeline-stop-body">
            <div class="timeline-info">
              <span class="timeline-stop-name">${tStop(arrStopName)}${arrMarker}</span>
              <span class="timeline-stop-time">${arrTime} <small class="time-label">${t('trip.arr')}</small></span>
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
              <span class="timeline-stop-name">${tStop(arrStopName)}${arrMarker}</span>
              <span class="timeline-stop-time">${arrTime} <small class="time-label">${t('trip.arr')}</small></span>
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
