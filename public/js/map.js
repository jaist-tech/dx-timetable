// ===== Map Tab (Leaflet + OpenStreetMap + GeoJSON per segment) =====

let map = null;
let busLayer = null;
let routeLayers = {};   // segmentId -> L.layerGroup
let activeSegKeys = []; // currently visible segment keys
let prevRouteId = null;
let prevFromStop = null;
let prevToStop = null;
// Bus marker reuse (prevents flicker/jitter on per-second updates)
let _busMarker = null;
let _busLabelMarker = null;
let _busMarkerSig = null; // 'iconUrl|...' to detect when icon needs rebuild
let _staticBusMarker = null;
let _staticBusSig = null;

// Extracted data from GeoJSON (keyed by segment_id)
let ROUTE_LINES = {};   // segmentId -> [[lat,lng], ...]
let STOP_POINTS = {};   // segmentId -> [{name, latlng}, ...]
let STOP_FRACTIONS = {}; // segmentId -> {stopName: fraction}

const LINE_COLORS = {
  bus: '#43A047',
  train: '#1565C0'
};

// Route color based on which shuttle is involved
function getRouteColor(routeId) {
  if (!routeId) return '#43A047';
  const segIds = getRouteSegmentIds(routeId);
  if (segIds.includes('shuttle_tsurugi') || segIds.includes('ishikawa_line')) return '#1976D2'; // blue
  return '#43A047'; // green (小松駅経由 & default)
}

function getBusIconUrl(routeId) {
  const color = getRouteColor(routeId);
  if (color === '#1976D2') return 'img/bus_blue.png';
  return 'img/bus_green.png';
}

// ===== GeoJSON Loading =====

async function loadGeoData() {
  if (!ROUTES_CONFIG) return;
  const segDefs = ROUTES_CONFIG.segment_files || [];
  const geoMappings = ROUTES_CONFIG.geo_mappings || {};

  // Collect unique geo files to load
  const geoFilesNeeded = new Set();
  segDefs.forEach(sd => {
    const segName = sd.name;
    if (geoMappings[segName]) {
      geoFilesNeeded.add(geoMappings[segName].geo_file);
    } else if (sd.geo_file) {
      geoFilesNeeded.add(sd.geo_file);
    }
  });

  const geoFileList = [...geoFilesNeeded];
  const results = await Promise.all(
    geoFileList.map(f =>
      fetch(`data/geo/${f}.geojson`).then(r => r.ok ? r.json() : null).catch(() => null)
    )
  );

  const geoData = {};
  geoFileList.forEach((f, i) => { geoData[f] = results[i]; });

  // Parse full geo data for each segment (no clipping yet — clipping is done per-route in buildRouteLayersForRoute)
  segDefs.forEach(sd => {
    const segName = sd.name;
    const mapping = geoMappings[segName];
    const geoFile = mapping ? mapping.geo_file : sd.geo_file;
    if (geoFile && geoData[geoFile]) {
      parseGeoJSON(segName, geoData[geoFile]);
    }
  });
}

function parseGeoJSON(segId, geojson) {
  const lineFeature = geojson.features.find(f => f.geometry.type === 'LineString');
  const pointFeatures = geojson.features.filter(f => f.geometry.type === 'Point');

  if (lineFeature) {
    // GeoJSON is [lng, lat], Leaflet uses [lat, lng]
    ROUTE_LINES[segId] = lineFeature.geometry.coordinates.map(c => [c[1], c[0]]);
  }

  STOP_POINTS[segId] = pointFeatures
    .sort((a, b) => (a.id || 0) - (b.id || 0))
    .map(f => ({
      name: f.properties.name,
      latlng: [f.geometry.coordinates[1], f.geometry.coordinates[0]]
    }));

  // Compute fraction of each stop along the line
  if (ROUTE_LINES[segId] && STOP_POINTS[segId].length > 0) {
    computeStopFractions(segId);
  }
}

function clipLine(line, startFrac, endFrac) {
  const totalLen = polylineLength(line);
  const startDist = startFrac * totalLen;
  const endDist = endFrac * totalLen;
  const result = [];

  // Add interpolated start point
  result.push(pointAlongLine(line, startFrac));

  let cumLen = 0;
  for (let i = 1; i < line.length; i++) {
    cumLen += distLatLng(line[i - 1], line[i]);

    if (cumLen <= startDist) continue; // Before start
    if (cumLen >= endDist) break;      // Past end

    result.push(line[i]);
  }

  // Add interpolated end point
  result.push(pointAlongLine(line, endFrac));

  return result;
}

function computeStopFractions(segId) {
  const line = ROUTE_LINES[segId];
  STOP_FRACTIONS[segId] = {};

  STOP_POINTS[segId].forEach(stop => {
    const projected = projectPointOnLine(stop.latlng, line);
    STOP_FRACTIONS[segId][stop.name] = projected.fraction;
  });
}

// ===== Geometry Helpers =====

function distLatLng(a, b) {
  const dlat = a[0] - b[0];
  const dlng = a[1] - b[1];
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function polylineLength(coords) {
  let len = 0;
  for (let i = 1; i < coords.length; i++) {
    len += distLatLng(coords[i - 1], coords[i]);
  }
  return len;
}

function projectPointOnLine(point, line) {
  let bestDist = Infinity;
  let bestFraction = 0;
  const totalLen = polylineLength(line);
  let cumLen = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const segLen = distLatLng(a, b);
    const t = segLen > 0 ? clamp(dot(point, a, b) / (segLen * segLen), 0, 1) : 0;
    const proj = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const d = distLatLng(point, proj);

    if (d < bestDist) {
      bestDist = d;
      bestFraction = (cumLen + t * segLen) / totalLen;
    }
    cumLen += segLen;
  }

  return { fraction: bestFraction, distance: bestDist };
}

function dot(p, a, b) {
  return (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function pointAlongLine(line, fraction) {
  if (fraction <= 0) return line[0];
  if (fraction >= 1) return line[line.length - 1];

  const totalLen = polylineLength(line);
  const targetLen = fraction * totalLen;
  let cumLen = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const segLen = distLatLng(line[i], line[i + 1]);
    if (cumLen + segLen >= targetLen) {
      const t = (targetLen - cumLen) / segLen;
      return [
        line[i][0] + t * (line[i + 1][0] - line[i][0]),
        line[i][1] + t * (line[i + 1][1] - line[i][1])
      ];
    }
    cumLen += segLen;
  }
  return line[line.length - 1];
}

// ===== Route → Segment Mapping =====

// Get the segment IDs relevant to the selected route
function getRouteSegmentIds(routeId) {
  if (isMultiRoute(routeId)) {
    const mr = getMultiRoute(routeId);
    if (!mr) return [];
    return mr.segments.map(s => s.segment);
  }
  // Direct route: look up in ROUTES_CONFIG.direct_routes
  if (ROUTES_CONFIG && ROUTES_CONFIG.direct_routes) {
    const dr = ROUTES_CONFIG.direct_routes.find(r => r.id === routeId);
    if (dr) return [dr.segment];
  }
  return [];
}

// Get direction for a direct route's segment
function getDirectRouteDirection(routeId) {
  if (ROUTES_CONFIG && ROUTES_CONFIG.direct_routes) {
    const dr = ROUTES_CONFIG.direct_routes.find(r => r.id === routeId);
    if (dr) return dr.direction;
  }
  return 'outbound';
}

// ===== Map Init =====

function initMap() {
  map = L.map('leaflet-map', {
    center: [36.50, 136.57],
    zoom: 11
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(map);

  busLayer = L.layerGroup().addTo(map);

  // Build layer groups for each segment — deferred until route is selected
  // so we know the color to use.
  _routeLayersBuilt = false;
}

let _routeLayersBuilt = false;

function buildRouteLayersForRoute(routeId, userFrom, userTo) {
  // Clear old layers
  Object.values(routeLayers).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
  routeLayers = {};

  const color = getRouteColor(routeId);
  const segIds = getRouteSegmentIds(routeId);

  // === Determine which segments and stop ranges to show based on user selection ===
  // For multi-routes: find which segment indices contain userFrom/userTo, show only those
  // For direct routes: clip the single segment between userFrom/userTo

  let visibleSegInfos = []; // { segId, fromStop, toStop } for each segment to display

  if (isMultiRoute(routeId)) {
    const mr = getMultiRoute(routeId);
    if (mr) {
      const multiStops = getMultiRouteStops(routeId);
      const fromEntry = multiStops.find(s => s.name === userFrom);
      const toEntry = multiStops.find(s => s.name === userTo);
      let visSeg0 = fromEntry ? fromEntry.segIdx : 0;
      let visSeg1 = toEntry ? toEntry.segIdx : mr.segments.length - 1;
      let visStop0 = fromEntry ? fromEntry.stopIdx : 0;
      let visStop1 = toEntry ? toEntry.stopIdx : null;

      // Skip zero-duration first segment at non-walk transfer boundary
      if (visSeg0 < visSeg1) {
        const seg0Dir = getSegmentData(mr.segments[visSeg0].segment, mr.segments[visSeg0].direction);
        if (seg0Dir) {
          const { stops: s0 } = clipSegment(seg0Dir, mr.segments[visSeg0], getDayType(mr.segments[visSeg0].segment));
          if (visStop0 === s0.length - 1) {
            const trDef = mr.segments[visSeg0];
            const nextDef = mr.segments[visSeg0 + 1];
            const isWalk = isWalkTransfer(
              getSegRefLastStop(trDef),
              getSegRefFirstStop(nextDef)
            );
            if (!isWalk) { visSeg0++; visStop0 = 0; }
          }
        }
      }
      // Skip zero-duration last segment at non-walk transfer boundary
      if (visSeg1 > visSeg0 && visStop1 === 0) {
        const prevDef = mr.segments[visSeg1 - 1];
        const curDef = mr.segments[visSeg1];
        const isWalk = isWalkTransfer(
          getSegRefLastStop(prevDef),
          getSegRefFirstStop(curDef)
        );
        if (!isWalk) {
          visSeg1--;
          visStop1 = null; // will use full segment
        }
      }

      for (let si = visSeg0; si <= visSeg1; si++) {
        const segDef = mr.segments[si];
        const dirData = getSegmentData(segDef.segment, segDef.direction);
        if (!dirData) continue;

        // Get the clipped stops for this segment (same as getMultiRouteStops uses)
        const { stops: clippedStops } = clipSegment(dirData, segDef, getDayType(segDef.segment));

        // Determine clip range: start from segment config clip, then narrow by user selection
        let clipFrom = segDef.from_stop || null;
        let clipTo = segDef.to_stop || null;

        // Override with user selection for first/last visible segment
        if (si === visSeg0 && visStop0 > 0) {
          clipFrom = clippedStops[visStop0] || clipFrom;
        }
        if (si === visSeg1 && visStop1 != null && visStop1 < clippedStops.length - 1) {
          clipTo = clippedStops[visStop1] || clipTo;
        }

        // When one end is clipped by user selection, anchor the other end
        // to the segment's entry/exit point to avoid defaulting to the wrong end
        if (!clipFrom && clipTo) {
          clipFrom = clippedStops[0];
        }
        if (!clipTo && clipFrom) {
          clipTo = clippedStops[clippedStops.length - 1];
        }

        visibleSegInfos.push({ segId: segDef.segment, fromStop: clipFrom, toStop: clipTo });
      }
    }
  } else {
    // Direct route: single segment, clip to user from/to
    if (segIds.length > 0) {
      visibleSegInfos.push({ segId: segIds[0], fromStop: userFrom || null, toStop: userTo || null });
    }
  }

  // Determine "key stops" — first/last of visible range
  const keyStopNames = new Set();
  if (userFrom) keyStopNames.add(userFrom);
  if (userTo) keyStopNames.add(userTo);

  // Build layers for each visible segment
  visibleSegInfos.forEach(info => {
    const segId = info.segId;
    if (!ROUTE_LINES[segId]) return;
    const seg = SEGMENTS[segId];
    const segType = seg ? seg.type : 'bus';
    const layer = L.layerGroup();

    let line = ROUTE_LINES[segId];
    let stops = STOP_POINTS[segId] || [];

    // Clip to from/to stops using fractions (route position along the line)
    if ((info.fromStop || info.toStop) && stops.length > 0 && STOP_FRACTIONS[segId]) {
      const fracs = STOP_FRACTIONS[segId];
      const fromFrac = info.fromStop && fracs[info.fromStop] != null ? fracs[info.fromStop] : 0;
      const toFrac = info.toStop && fracs[info.toStop] != null ? fracs[info.toStop] : 1;
      const f0 = Math.min(fromFrac, toFrac);
      const f1 = Math.max(fromFrac, toFrac);

      // Filter stops to those within the fraction range
      stops = stops.filter(s => {
        const f = fracs[s.name];
        return f != null && f >= f0 - 1e-6 && f <= f1 + 1e-6;
      });

      line = clipLine(line, f0, f1);
    }

    L.polyline(line, {
      color: color,
      weight: segType === 'train' ? 4 : 5,
      opacity: 0.6,
      dashArray: segType === 'train' ? '8 4' : null
    }).addTo(layer);

    stops.forEach(stop => {
      const isKey = keyStopNames.has(stop.name);
      const marker = L.circleMarker(stop.latlng, {
        radius: isKey ? 7 : 4,
        fillColor: color,
        color: '#fff',
        weight: isKey ? 3 : 2,
        fillOpacity: 1
      });
      if (isKey) {
        marker.bindTooltip(tStop(stop.name), {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: 'stop-tooltip'
        });
      } else {
        marker.bindPopup(tStop(stop.name), { className: 'stop-popup' });
      }
      marker.addTo(layer);
    });

    routeLayers[segId] = layer;
  });

  _routeLayersBuilt = true;
}

function showRouteLayers(routeId, userFrom, userTo) {
  // Rebuild layers with route-specific color, key stops, and user-selected range
  buildRouteLayersForRoute(routeId, userFrom, userTo);

  // Hide all current layers
  activeSegKeys.forEach(key => {
    if (routeLayers[key]) map.removeLayer(routeLayers[key]);
  });
  activeSegKeys = [];

  // Show layers for the visible segments
  Object.keys(routeLayers).forEach(segId => {
    routeLayers[segId].addTo(map);
    activeSegKeys.push(segId);
  });

  // Fit bounds to visible segments
  fitMapToSegments(activeSegKeys);
}

function fitMapToSegments(segIds) {
  if (!map) return;
  const allPoints = [];
  segIds.forEach(segId => {
    const layer = routeLayers[segId];
    if (layer) {
      layer.eachLayer(l => {
        if (l.getLatLngs) {
          l.getLatLngs().forEach(p => allPoints.push(p));
        }
      });
    }
  });
  if (allPoints.length > 0) {
    map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30] });
  }
}

// ===== Bus Position =====

function getBusProgress(routeId, tripIdx) {
  if (isMultiRoute(routeId)) return getMultiBusProgress(routeId, tripIdx);

  const route = getRoute(routeId);
  if (!route) return null;
  const sched = route.schedules[getDayType(route.segmentId)] || route.schedules[dayType];
  if (!sched) return null;
  const trip = sched[tripIdx];
  if (!trip) return null;

  // Find the segment for this direct route
  const segIds = getRouteSegmentIds(routeId);
  if (segIds.length === 0) return null;
  const segId = segIds[0];
  if (!STOP_FRACTIONS[segId] || !ROUTE_LINES[segId]) return null;

  const direction = getDirectRouteDirection(routeId);
  const stops = route.stops;
  const depTime = trip[0];
  const arrTime = trip[trip.length - 1];
  if (!depTime || !arrTime) return null;

  const depSec = timeToMin(depTime) * 60;
  const arrSec = timeToMin(arrTime) * 60;
  const now = nowSec();
  if (now < depSec || now > arrSec) return null;

  const fracs = STOP_FRACTIONS[segId];
  const line = ROUTE_LINES[segId];

  for (let i = 0; i < stops.length - 1; i++) {
    const t1 = timeToMin(trip[i]);
    const t2 = timeToMin(trip[i + 1]);
    if (t1 == null || t2 == null) continue;
    const t1Sec = t1 * 60;
    const t2Sec = t2 * 60;

    if (now >= t1Sec && now <= t2Sec) {
      const segProgress = t2Sec > t1Sec ? (now - t1Sec) / (t2Sec - t1Sec) : 0;
      let frac1 = fracs[stops[i]];
      let frac2 = fracs[stops[i + 1]];
      if (frac1 != null && frac2 != null) {
        // For inbound, fractions are reversed
        if (direction === 'inbound') {
          frac1 = 1 - frac1;
          frac2 = 1 - frac2;
        }
        const frac = frac1 + segProgress * (frac2 - frac1);
        return { segId, fraction: direction === 'inbound' ? 1 - frac : frac };
      }
    }
  }
  return null;
}

function getMultiBusProgress(routeId, tripIdx) {
  if (!currentConnections || tripIdx < 0 || tripIdx >= currentConnections.length) return null;
  const conn = currentConnections[tripIdx];
  const now = nowSec();
  const mr = getMultiRoute(routeId);
  if (!mr) return null;

  for (let si = 0; si < conn.segments.length; si++) {
    const seg = conn.segments[si];
    const segRef = mr.segments[si];
    const segId = segRef.segment;
    const direction = segRef.direction;
    if (!STOP_FRACTIONS[segId] || !ROUTE_LINES[segId]) continue;

    const depSec = timeToMin(seg.depTime) * 60;
    const arrSec = timeToMin(seg.arrTime) * 60;
    if (now < depSec || now > arrSec) continue;

    const fracs = STOP_FRACTIONS[segId];
    for (let j = 0; j < seg.trip.length - 1; j++) {
      const t1 = timeToMin(seg.trip[j]);
      const t2 = timeToMin(seg.trip[j + 1]);
      if (t1 == null || t2 == null) continue;
      const t1Sec = t1 * 60;
      const t2Sec = t2 * 60;
      if (now >= t1Sec && now <= t2Sec) {
        const stopName1 = seg.stops[j];
        const stopName2 = seg.stops[j + 1];
        let frac1 = fracs[stopName1];
        let frac2 = fracs[stopName2];
        if (frac1 != null && frac2 != null) {
          const segProgress = t2Sec > t1Sec ? (now - t1Sec) / (t2Sec - t1Sec) : 0;
          if (direction === 'inbound') {
            frac1 = 1 - frac1;
            frac2 = 1 - frac2;
          }
          const frac = frac1 + segProgress * (frac2 - frac1);
          return { segId, fraction: direction === 'inbound' ? 1 - frac : frac };
        }
      }
    }
  }
  return null;
}

// ===== Update =====

function updateMap() {
  if (!map) {
    initMap();
    setTimeout(() => {
      map.invalidateSize();
      showRouteLayers(selectedRouteId, selectedFromStop, selectedToStop);
    }, 100);
    prevRouteId = selectedRouteId;
    prevFromStop = selectedFromStop;
    prevToStop = selectedToStop;
    return;
  }

  // Rebuild layers when route or from/to stops change
  if (prevRouteId !== selectedRouteId || prevFromStop !== selectedFromStop || prevToStop !== selectedToStop) {
    showRouteLayers(selectedRouteId, selectedFromStop, selectedToStop);
    prevRouteId = selectedRouteId;
    prevFromStop = selectedFromStop;
    prevToStop = selectedToStop;
    // 保持しているバスマーカーは古いルート用なのでリセット
    if (_busMarker) { busLayer.removeLayer(_busMarker); _busMarker = null; _busMarkerSig = null; }
    if (_busLabelMarker) { busLayer.removeLayer(_busLabelMarker); _busLabelMarker = null; }
    if (_staticBusMarker) { busLayer.removeLayer(_staticBusMarker); _staticBusMarker = null; _staticBusSig = null; }
  }

  const now = nowSec();

  // Get bus position (only meaningful when viewing today)
  const progress = (selectedTripIdx >= 0 && isViewingToday())
    ? getBusProgress(selectedRouteId, selectedTripIdx) : null;

  if (progress) {
    const line = ROUTE_LINES[progress.segId];
    if (line) {
      const pos = pointAlongLine(line, progress.fraction);
      // 静的マーカーが残っていれば消す
      if (_staticBusMarker) {
        busLayer.removeLayer(_staticBusMarker);
        _staticBusMarker = null;
        _staticBusSig = null;
      }

      // 走行中バスアイコン: アイコンURL/サイズが変わったときだけ再生成
      const iconUrl = getBusIconUrl(selectedRouteId);
      const sig = `running|${iconUrl}`;
      if (!_busMarker || _busMarkerSig !== sig) {
        if (_busMarker) busLayer.removeLayer(_busMarker);
        const busIcon = L.icon({
          iconUrl: iconUrl,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
          className: 'bus-icon-selected'
        });
        _busMarker = L.marker(pos, { icon: busIcon }).addTo(busLayer);
        _busMarkerSig = sig;
      } else {
        _busMarker.setLatLng(pos);
      }

      // Dep time label
      let depLabel = '';
      if (isMultiRoute(selectedRouteId) && currentConnections[selectedTripIdx]) {
        depLabel = currentConnections[selectedTripIdx].depTime + t('trip.dep');
      } else {
        const route = getRoute(selectedRouteId);
        if (route) {
          const sched = route.schedules[getDayType(route.segmentId)] || route.schedules[dayType] || [];
          const trip = sched[selectedTripIdx];
          if (trip) depLabel = trip[0] + t('trip.dep');
        }
      }
      if (depLabel) {
        const labelHtml = `<div class="bus-label">${depLabel}</div>`;
        if (!_busLabelMarker) {
          const labelIcon = L.divIcon({
            html: labelHtml,
            className: 'bus-label-container',
            iconSize: [80, 20],
            iconAnchor: [-16, 10]
          });
          _busLabelMarker = L.marker(pos, { icon: labelIcon }).addTo(busLayer);
          _busLabelMarker._lastLabel = depLabel;
        } else {
          _busLabelMarker.setLatLng(pos);
          // ラベル文字列が変わったときだけ DOM 内容を差し替え
          if (_busLabelMarker._lastLabel !== depLabel) {
            const el = _busLabelMarker.getElement();
            if (el) el.innerHTML = labelHtml;
            _busLabelMarker._lastLabel = depLabel;
          }
        }
      } else if (_busLabelMarker) {
        busLayer.removeLayer(_busLabelMarker);
        _busLabelMarker = null;
      }
    }
  } else {
    // 走行中でない: 走行中マーカー/ラベルがあれば消す
    if (_busMarker) {
      busLayer.removeLayer(_busMarker);
      _busMarker = null;
      _busMarkerSig = null;
    }
    if (_busLabelMarker) {
      busLayer.removeLayer(_busLabelMarker);
      _busLabelMarker = null;
    }
    if (selectedTripIdx >= 0 && isViewingToday()) {
      // 静的マーカーを始点/終点に表示
      showStaticBusMarker(now);
    } else if (_staticBusMarker) {
      busLayer.removeLayer(_staticBusMarker);
      _staticBusMarker = null;
      _staticBusSig = null;
    }
  }

  // Update info bar
  updateMapInfoBar(now);
}

function showStaticBusMarker(now) {
  // Find first stop position of the route
  const segIds = getRouteSegmentIds(selectedRouteId);
  if (segIds.length === 0) return;

  // 表示位置とラベルを決定する。multi-route の乗換待ち中は
  // 「次に出発する区間の始点」にバスを置き、その出発時刻を表示する。
  let pos = null;
  let label = '';

  if (isMultiRoute(selectedRouteId) && currentConnections[selectedTripIdx]) {
    const conn = currentConnections[selectedTripIdx];
    const overallDepSec = timeToMin(conn.depTime) * 60;
    const overallArrSec = timeToMin(conn.arrTime) * 60;
    const segs = conn.segments || [];

    if (now < overallDepSec) {
      // 全行程開始前: 最初の区間の始発駅で待機
      label = `${conn.depTime}${t('trip.dep')} ${t('map.waiting')}`;
      pos = _findStopLatLng(segs[0] && segs[0].stops[0], segIds);
    } else if (now > overallArrSec) {
      // 全行程終了後: 最後の区間の終着駅
      label = t('status.arrived');
      const lastSeg = segs[segs.length - 1];
      pos = _findStopLatLng(lastSeg && lastSeg.stops[lastSeg.stops.length - 1], segIds);
    } else {
      // 乗換待ち: 直前に到着した区間の終着 = 次区間の始発で待機
      for (let i = 0; i < segs.length - 1; i++) {
        const segArrSec = timeToMin(segs[i].arrTime) * 60;
        const nextDepSec = timeToMin(segs[i + 1].depTime) * 60;
        if (now > segArrSec && now < nextDepSec) {
          const nextDep = segs[i + 1].depTime;
          label = `${nextDep}${t('trip.dep')} ${t('map.waiting')}`;
          // 待機する地点は次区間の始発駅
          pos = _findStopLatLng(segs[i + 1].stops[0], segIds);
          break;
        }
      }
      // 乗換区間に該当しないが running でもない (= データ穴) → そのまま return
      if (!pos) return;
    }
  } else {
    const route = getRoute(selectedRouteId);
    if (!route) return;
    const sched = route.schedules[getDayType(route.segmentId)] || route.schedules[dayType] || [];
    const trip = sched[selectedTripIdx];
    if (!trip) return;
    const depSec = timeToMin(trip[0]) * 60;
    const arrSec = timeToMin(trip[trip.length - 1]) * 60;
    label = now < depSec ? `${trip[0]}${t('trip.dep')} ${t('map.waiting')}` : t('status.arrived');
    const targetStop = now < depSec ? selectedFromStop : selectedToStop;
    pos = _findStopLatLng(targetStop, segIds);
  }

  if (!pos) return;

  // 同じ署名なら何もしない（位置とラベルだけ追従）
  const iconUrl = getBusIconUrl(selectedRouteId);
  const sig = `static|${iconUrl}`;
  if (!_staticBusMarker || _staticBusSig !== sig) {
    if (_staticBusMarker) busLayer.removeLayer(_staticBusMarker);
    const staticIcon = L.icon({
      iconUrl: iconUrl,
      iconSize: [33, 33],
      iconAnchor: [16, 16],
      className: 'bus-icon-static'
    });
    _staticBusMarker = L.marker(pos, { icon: staticIcon }).bindTooltip(label, {
      permanent: true,
      direction: 'right',
      offset: [16, 0]
    }).addTo(busLayer);
    _staticBusMarker._lastLabel = label;
    _staticBusSig = sig;
  } else {
    _staticBusMarker.setLatLng(pos);
    if (_staticBusMarker._lastLabel !== label) {
      _staticBusMarker.setTooltipContent(label);
      _staticBusMarker._lastLabel = label;
    }
  }
}

function _findStopLatLng(stopName, segIds) {
  if (!stopName) return null;
  for (const sid of segIds) {
    const sp = STOP_POINTS[sid];
    if (!sp) continue;
    const found = sp.find(s => s.name === stopName);
    if (found) return found.latlng;
  }
  return null;
}

function updateMapInfoBar(now) {
  const infoEl = document.getElementById('map-bus-info');
  // Future-date view: now = -1 keeps the status at "運行前"
  if (!isViewingToday()) now = -1;

  if (selectedTripIdx >= 0) {
    let depTime, arrTime;
    if (isMultiRoute(selectedRouteId)) {
      const conn = currentConnections[selectedTripIdx];
      if (conn) {
        depTime = getConnDepTime(conn, selectedFromStop);
        arrTime = getConnArrTime(conn, selectedToStop);
      }
    } else {
      const route = getRoute(selectedRouteId);
      if (route) {
        const sched = route.schedules[getDayType(route.segmentId)] || route.schedules[dayType] || [];
        const trip = sched[selectedTripIdx];
        if (trip) {
          const fromIdx = route.stops.indexOf(selectedFromStop);
          const toIdx = route.stops.indexOf(selectedToStop);
          if (fromIdx >= 0 && toIdx >= 0) {
            depTime = trip[fromIdx];
            arrTime = trip[toIdx];
          }
        }
      }
    }

    if (depTime) {
      const depSec = timeToMin(depTime) * 60;
      const arrSec = timeToMin(arrTime) * 60;
      let status = '';
      if (now < depSec) status = t('status.before');
      else if (now <= arrSec) status = t('status.running');
      else status = t('status.arrived');
      const label = `${tStop(selectedFromStop)} → ${tStop(selectedToStop)} ${depTime}${t('trip.dep')} - ${status}`;
      infoEl.textContent = label;
    } else {
      infoEl.textContent = t('map.selectTrip');
    }
  } else {
    infoEl.textContent = t('map.selectTrip');
  }

  const sec = nowSec();
  const mH = Math.floor(sec / 3600);
  const mM = Math.floor((sec % 3600) / 60);
  document.getElementById('map-time').textContent =
    `${String(mH).padStart(2,'0')}:${String(mM).padStart(2,'0')}`;
}
