// ===== Data Loading =====
async function loadData() {
  // Load routes config and all segment data
  await loadRoutesConfig();

  // Build DATA.routes and REVERSE_ROUTES from direct_routes + segments
  DATA = { routes: [] };
  REVERSE_ROUTES = {};
  if (ROUTES_CONFIG && ROUTES_CONFIG.direct_routes) {
    ROUTES_CONFIG.direct_routes.forEach(dr => {
      if (dr.reverse_id) REVERSE_ROUTES[dr.id] = dr.reverse_id;
    });
    DATA.routes = ROUTES_CONFIG.direct_routes.map(dr => {
      const seg = SEGMENTS[dr.segment];
      const dirData = seg ? seg[dr.direction] : null;
      return {
        id: dr.id,
        name: dr.name,
        short_name: dr.short_name,
        color: dr.color,
        stops: dirData ? dirData.stops : [],
        schedules: dirData ? dirData.schedules : { weekday: [], weekend: [] }
      };
    });
  }

  dayType = getDayType();

  await loadGeoData();
  initApp();
}

async function loadRoutesConfig() {
  try {
    const res = await fetch('data/routes.json');
    ROUTES_CONFIG = await res.json();

    const segDefs = ROUTES_CONFIG.segment_files || [];

    // Deduplicate file fetches (e.g., ir_ishikawa.json used by multiple segments)
    const uniqueFiles = [...new Set(segDefs.map(s => s.file))];
    const fetched = {};
    await Promise.all(
      uniqueFiles.map(f =>
        fetch(`data/segments/${f}.json`).then(r => r.json()).then(d => { fetched[f] = d; })
      )
    );

    // Build SEGMENTS: segment_name -> { outbound/inbound -> route data }
    segDefs.forEach(segDef => {
      const segJson = fetched[segDef.file];
      if (!segJson) return;
      const segObj = {};
      for (const [dirKey, routeId] of Object.entries(segDef.directions)) {
        const route = segJson.routes.find(r => r.id === routeId);
        if (route) {
          segObj[dirKey] = {
            stops: route.stops,
            schedules: route.schedules
          };
        }
      }
      segObj.meta = segJson.meta;
      segObj.type = segDef.type || 'bus';
      SEGMENTS[segDef.name] = segObj;
    });
  } catch (e) {
    console.warn('Failed to load routes config:', e);
    ROUTES_CONFIG = null;
  }
}

// ===== Tab Navigation =====
function initTabs() {
  document.querySelectorAll('#bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#bottom-nav button').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`#bottom-nav button[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'status') updateStatus();
  if (tab === 'map') {
    updateMap();
    if (map) setTimeout(() => map.invalidateSize(), 50);
  }
}

// ===== Clock =====
function updateClock() {
  let h, m;
  if (DEBUG_FORCE_RUNNING) {
    const sec = nowSec();
    h = Math.floor(sec / 3600);
    m = Math.floor((sec % 3600) / 60);
  } else {
    const n = new Date();
    h = n.getHours();
    m = n.getMinutes();
  }
  document.getElementById('header-time').textContent =
    `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// ===== Initialization =====
function initApp() {
  initTabs();
  initSearch();
  applyStaticTranslations();
  updateClock();

  // Real-time updates (every second)
  setInterval(() => {
    updateClock();
    if (currentTab === 'search') updateSearchCountdown();
    if (currentTab === 'status') updateStatus();
    if (currentTab === 'map') updateMap();
  }, 1000);

  // Less frequent updates (trip list rebuild)
  setInterval(() => {
    if (currentTab === 'search') {
      if (isMultiRoute(selectedRouteId)) {
        updateMultiTripList();
      } else {
        updateTripList();
      }
    }
  }, 30000);
}

// Start
loadData();
