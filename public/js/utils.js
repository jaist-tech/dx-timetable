// ===== Global State =====
let DATA = null;
let SEGMENTS = {};
let ROUTES_CONFIG = null;
let REVERSE_ROUTES = {};
let currentConnections = [];
let currentTab = 'search';
let dayType = 'weekday';
let selectedRouteId = 'komatsu_outbound';
let selectedFromStop = '';
let selectedToStop = '';
let selectedTripIdx = -1;
let _scrollToSelected = false;
let _expandedSegs = new Set();

// ===== Debug =====
// true: 選択中ルートの1/3付近の便が走行中（出発2分後）になる
const DEBUG_FORCE_RUNNING = false;

// ===== Time Utilities =====

function timeToMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function nowMin() {
  return DEBUG_FORCE_RUNNING ? Math.floor(debugNowSec() / 60) : realNowMin();
}

function nowSec() {
  return DEBUG_FORCE_RUNNING ? debugNowSec() : realNowSec();
}

function realNowMin() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function realNowSec() {
  const n = new Date();
  return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
}

function getDayType() {
  const d = new Date().getDay();
  return (d === 0 || d === 6) ? 'weekend' : 'weekday';
}

function formatCountdownSecHtml(diffSec) {
  if (diffSec < 0) return '--:--';
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  const u = '<span class="countdown-unit">';
  const ue = '</span>';
  if (h > 0) return `${h}${u}${t('time.h')}${ue}${m}${u}${t('time.m')}${ue}${s}${u}${t('time.s')}${ue}`;
  return `${m}${u}${t('time.m')}${ue}${s}${u}${t('time.s')}${ue}`;
}

// ===== Debug Time Simulation =====

let _debugState = { startReal: null, baseTimeSec: null, routeId: null };

function debugNowSec() {
  if (_debugState.routeId !== selectedRouteId) {
    _debugState = { startReal: null, baseTimeSec: null, routeId: selectedRouteId };
  }
  if (_debugState.baseTimeSec === null) {
    _debugState.baseTimeSec = calcDebugBaseTime();
    _debugState.startReal = Date.now() / 1000;
  }
  const elapsed = Date.now() / 1000 - _debugState.startReal;
  return Math.floor(_debugState.baseTimeSec + elapsed);
}

function calcDebugBaseTime() {
  const trips = getTripsForSelectedRoute();
  if (trips.length === 0 || !trips[0][0]) return 0;

  const runIdx = Math.max(0, Math.floor(trips.length / 3));
  return timeToMin(trips[runIdx][0]) * 60 + 120; // 出発2分後
}

function getTripsForSelectedRoute() {
  if (isMultiRoute(selectedRouteId)) {
    const mr = getMultiRoute(selectedRouteId);
    if (mr && mr.segments.length > 0) {
      const dirData = getSegmentData(mr.segments[0].segment, mr.segments[0].direction);
      if (dirData) return dirData.schedules[dayType] || [];
    }
  } else {
    const route = DATA ? getRoute(selectedRouteId) : null;
    if (route) return route.schedules[dayType] || [];
  }
  return [];
}

// ===== Route Data Accessors =====

function getRoute(id) {
  return DATA.routes.find(r => r.id === id);
}

function isMultiRoute(routeId) {
  return ROUTES_CONFIG && ROUTES_CONFIG.multi_routes.some(r => r.id === routeId);
}

function getMultiRoute(routeId) {
  if (!ROUTES_CONFIG) return null;
  return ROUTES_CONFIG.multi_routes.find(r => r.id === routeId);
}

function getSegmentData(segmentId, direction) {
  const seg = SEGMENTS[segmentId];
  return seg ? seg[direction] : null;
}

// ===== Transfer Helpers =====

function getTransferTime(fromStop, toStop) {
  if (!ROUTES_CONFIG) return 5;
  const entry = ROUTES_CONFIG.transfers && ROUTES_CONFIG.transfers.find(e => e.from === fromStop && e.to === toStop);
  return entry ? entry.min : ROUTES_CONFIG.default_transfer_min;
}

function isWalkTransfer(fromStop, toStop) {
  if (!ROUTES_CONFIG) return false;
  const entry = ROUTES_CONFIG.transfers && ROUTES_CONFIG.transfers.find(e => e.from === fromStop && e.to === toStop);
  return entry ? !!entry.walk : false;
}

// ===== Sub-segment Helpers =====

/** Apply from_stop/to_stop clipping to a segment's stops and trips */
function clipSegment(dirData, segRef, dt) {
  const stops = dirData.stops;
  let fromIdx = 0;
  let toIdx = stops.length - 1;
  if (segRef.from_stop) {
    const fi = stops.indexOf(segRef.from_stop);
    if (fi >= 0) fromIdx = fi;
  }
  if (segRef.to_stop) {
    const ti = stops.indexOf(segRef.to_stop);
    if (ti >= 0) toIdx = ti;
  }
  const subStops = stops.slice(fromIdx, toIdx + 1);
  const trips = (dirData.schedules[dt] || []).map(trip => trip.slice(fromIdx, toIdx + 1));
  return { stops: subStops, trips };
}

/** Get the last stop name of a segment ref, respecting to_stop clipping */
function getSegRefLastStop(segRef) {
  const dirData = getSegmentData(segRef.segment, segRef.direction);
  if (!dirData) return null;
  if (segRef.to_stop) return segRef.to_stop;
  return dirData.stops[dirData.stops.length - 1];
}

function getSegRefFirstStop(segRef) {
  const dirData = getSegmentData(segRef.segment, segRef.direction);
  if (!dirData) return null;
  if (segRef.from_stop) return segRef.from_stop;
  return dirData.stops[0];
}

// ===== Multi-route Connection Finder =====

function findConnections(multiRouteId, dt, fromStop, toStop) {
  const mr = getMultiRoute(multiRouteId);
  if (!mr) return [];

  const segInfos = mr.segments.map(s => {
    const dirData = getSegmentData(s.segment, s.direction);
    if (!dirData) return null;
    const seg = SEGMENTS[s.segment];
    const { stops, trips } = clipSegment(dirData, s, dt);
    return {
      segmentId: s.segment,
      direction: s.direction,
      type: seg.type,
      stops, trips,
      firstStop: stops[0],
      lastStop: stops[stops.length - 1]
    };
  });

  if (segInfos.some(s => !s)) return [];

  let startSegIdx = 0;

  // Check if from/to are within a single segment
  if (fromStop && toStop) {
    const multiStops = getMultiRouteStops(multiRouteId);
    const fromEntry = multiStops.find(s => s.name === fromStop);
    const toEntry = multiStops.find(s => s.name === toStop);
    if (fromEntry && toEntry) {
      // Resolve boundary stops: if fromStop is at the end of its segment
      // and the next segment starts with the same stop, treat as next segment
      let fromSegIdx = fromEntry.segIdx;
      let fromStopIdx = fromEntry.stopIdx;
      const fromSeg = segInfos[fromSegIdx];
      if (fromSeg && fromStopIdx === fromSeg.stops.length - 1 && fromSegIdx + 1 < segInfos.length) {
        const nextSeg = segInfos[fromSegIdx + 1];
        if (nextSeg && nextSeg.firstStop === fromStop) {
          fromSegIdx = fromSegIdx + 1;
          fromStopIdx = 0;
        }
      }
      if (fromSegIdx === toEntry.segIdx) {
        return findSingleSegConnections(segInfos, fromSegIdx, fromStopIdx, toEntry.stopIdx);
      }
      startSegIdx = fromSegIdx;
    }
  }

  // Iterate from the last segment backwards to find the latest possible connections
  // (minimizes wait time at transfer stations)
  const endSegIdx = segInfos.length - 1;
  const connections = [];
  for (let t = 0; t < segInfos[endSegIdx].trips.length; t++) {
    const lastTrip = segInfos[endSegIdx].trips[t];
    if (!lastTrip[0]) continue;

    const journey = buildJourneyFromLastTrip(segInfos, lastTrip, startSegIdx, endSegIdx);
    if (journey) connections.push(journey);
  }

  return deduplicateConnections(connections);
}

/** Build connections from a single segment's trips (no cross-segment connection required) */
function findSingleSegConnections(segInfos, segIdx, fromStopIdx, toStopIdx) {
  const segInfo = segInfos[segIdx];
  const connections = [];

  for (let t = 0; t < segInfo.trips.length; t++) {
    const trip = segInfo.trips[t];
    const depTime = trip[fromStopIdx];
    const arrTime = trip[toStopIdx];
    if (!depTime || !arrTime) continue;

    // Build a connection with all segments but using this specific trip for the target segment
    const journey = {
      depTime: trip[0],
      arrTime: trip[trip.length - 1],
      segments: segInfos.map((si, idx) => {
        if (idx === segIdx) {
          return {
            segmentId: si.segmentId,
            type: si.type,
            stops: si.stops,
            trip: trip,
            depTime: trip[0],
            arrTime: trip[trip.length - 1]
          };
        }
        // For other segments, use a placeholder empty trip
        const emptyTrip = si.stops.map(() => null);
        return {
          segmentId: si.segmentId,
          type: si.type,
          stops: si.stops,
          trip: emptyTrip,
          depTime: null,
          arrTime: null
        };
      }),
      transfers: []
    };

    // Build transfer placeholders
    for (let i = 0; i < segInfos.length - 1; i++) {
      journey.transfers.push({
        fromStation: segInfos[i].lastStop,
        toStation: segInfos[i + 1].firstStop,
        isWalk: isWalkTransfer(segInfos[i].lastStop, segInfos[i + 1].firstStop),
        waitMin: 0
      });
    }

    connections.push(journey);
  }

  return deduplicateConnections(connections);
}

function buildJourneyFromLastTrip(segInfos, lastTrip, startIdx, endIdx) {
  // Build segments from endIdx backward to startIdx, finding the latest possible trip for each
  const builtSegments = [];
  const builtTransfers = [];

  // End segment
  builtSegments.push({
    segmentId: segInfos[endIdx].segmentId,
    type: segInfos[endIdx].type,
    stops: segInfos[endIdx].stops,
    trip: lastTrip,
    depTime: lastTrip[0],
    arrTime: lastTrip[lastTrip.length - 1]
  });

  // Work backwards from endIdx-1 to startIdx
  for (let i = endIdx - 1; i >= startIdx; i--) {
    const nextSeg = builtSegments[0];
    const nextDepMin = timeToMin(nextSeg.depTime);
    const transferMin = getTransferTime(segInfos[i].lastStop, segInfos[i + 1].firstStop);
    const latestArr = nextDepMin - transferMin;

    // Find the latest trip that arrives by latestArr with reasonable wait
    let bestTrip = null;
    for (let t = segInfos[i].trips.length - 1; t >= 0; t--) {
      const trip = segInfos[i].trips[t];
      const arrTime = trip[trip.length - 1];
      if (!arrTime) continue;
      const arrM = timeToMin(arrTime);
      if (arrM <= latestArr && (nextDepMin - arrM) <= 180) {
        bestTrip = trip;
        break;
      }
    }
    if (!bestTrip) return null;

    const arrMin = timeToMin(bestTrip[bestTrip.length - 1]);
    const waitMin = nextDepMin - arrMin;

    builtTransfers.unshift({
      fromStation: segInfos[i].lastStop,
      toStation: segInfos[i + 1].firstStop,
      isWalk: isWalkTransfer(segInfos[i].lastStop, segInfos[i + 1].firstStop),
      waitMin: waitMin
    });

    builtSegments.unshift({
      segmentId: segInfos[i].segmentId,
      type: segInfos[i].type,
      stops: segInfos[i].stops,
      trip: bestTrip,
      depTime: bestTrip[0],
      arrTime: bestTrip[bestTrip.length - 1]
    });
  }

  // Fill placeholder segments before startIdx
  for (let i = startIdx - 1; i >= 0; i--) {
    builtTransfers.unshift({
      fromStation: segInfos[i].lastStop,
      toStation: segInfos[i + 1].firstStop,
      isWalk: isWalkTransfer(segInfos[i].lastStop, segInfos[i + 1].firstStop),
      waitMin: 0
    });
    builtSegments.unshift({
      segmentId: segInfos[i].segmentId,
      type: segInfos[i].type,
      stops: segInfos[i].stops,
      trip: segInfos[i].stops.map(() => null),
      depTime: null,
      arrTime: null
    });
  }

  // Fill placeholder segments after endIdx
  for (let i = endIdx + 1; i < segInfos.length; i++) {
    builtTransfers.push({
      fromStation: segInfos[i - 1].lastStop,
      toStation: segInfos[i].firstStop,
      isWalk: isWalkTransfer(segInfos[i - 1].lastStop, segInfos[i].firstStop),
      waitMin: 0
    });
    builtSegments.push({
      segmentId: segInfos[i].segmentId,
      type: segInfos[i].type,
      stops: segInfos[i].stops,
      trip: segInfos[i].stops.map(() => null),
      depTime: null,
      arrTime: null
    });
  }

  return {
    depTime: builtSegments[startIdx].depTime,
    arrTime: builtSegments[endIdx].arrTime,
    segments: builtSegments,
    transfers: builtTransfers
  };
}

function deduplicateConnections(connections) {
  const seen = new Set();
  return connections.filter(c => {
    const key = c.segments.map(s => s.depTime + '-' + s.arrTime).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ===== Multi-route Stop List =====

/**
 * Build unified stop list for a multi-route.
 * Each entry: { name, segIdx, stopIdx }
 * Same-station transfers are deduplicated (only one entry).
 * Walk transfers (different names) appear as separate entries.
 */
function getMultiRouteStops(multiRouteId) {
  const mr = getMultiRoute(multiRouteId);
  if (!mr) return [];

  const allStops = [];
  for (let si = 0; si < mr.segments.length; si++) {
    const segRef = mr.segments[si];
    const dirData = getSegmentData(segRef.segment, segRef.direction);
    if (!dirData) continue;

    const { stops } = clipSegment(dirData, segRef, dayType);

    for (let j = 0; j < stops.length; j++) {
      // Skip first stop of non-first segment if same as prev segment's last stop
      if (si > 0 && j === 0) {
        const prevLast = getSegRefLastStop(mr.segments[si - 1]);
        if (prevLast && stops[j] === prevLast) continue;
      }
      allStops.push({ name: stops[j], segIdx: si, stopIdx: j });
    }
  }
  return allStops;
}

/** Get time for a specific stop within a connection */
function getConnectionStopTime(conn, stopEntry) {
  if (!stopEntry) return null;
  const seg = conn.segments[stopEntry.segIdx];
  if (!seg) return null;
  return seg.trip[stopEntry.stopIdx] || null;
}
