// ===== Data Loading =====
async function loadData() {
  // Load holidays, manifest, and routes config in parallel
  await Promise.all([loadHolidays(), loadManifest(), loadRoutesConfigOnly()]);
  // Then fetch the actual segment data (depends on manifest + routes config)
  await loadSegments();

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
        segmentId: dr.segment,
        stops: dirData ? dirData.stops : [],
        schedules: dirData ? dirData.schedules : { weekday: [], weekend: [] }
      };
    });
  }

  dayType = getDayType();

  await loadGeoData();
  initApp();
}

let _manifest = { regular: {}, special: {} };

async function loadManifest() {
  try {
    const res = await fetch('data/manifest.json');
    _manifest = await res.json();
  } catch (e) {
    console.warn('Failed to load manifest:', e);
    _manifest = { regular: {}, special: {} };
  }
}

async function loadRoutesConfigOnly() {
  try {
    const res = await fetch('data/routes.json');
    ROUTES_CONFIG = await res.json();
  } catch (e) {
    console.warn('Failed to load routes config:', e);
    ROUTES_CONFIG = null;
  }
}

// Pick the regular file for a segment based on today's date (with fallback for stale data).
// Rule (確定済み):
//   1. valid_from <= today <= valid_until を満たすファイル
//      該当する null (=valid_until 無し) ファイルが複数なら valid_from が最新
//   2. 上記に該当無しなら、valid_from <= today で valid_from が最新（過去に開始済みで期限切れ）
//   3. それも無ければ undefined
function pickRegularEntry(entries, todayStr) {
  if (!entries || entries.length === 0) return undefined;

  // 1. covering matches
  const covering = entries.filter(e =>
    e.valid_from <= todayStr && (e.valid_until === null || todayStr <= e.valid_until)
  );
  if (covering.length > 0) {
    // pick the one with newest valid_from
    return covering.reduce((a, b) => (a.valid_from > b.valid_from ? a : b));
  }

  // 2. stale fallback: started in the past, but expired (valid_until < today)
  const expired = entries.filter(e =>
    e.valid_from <= todayStr && e.valid_until !== null && e.valid_until < todayStr
  );
  if (expired.length > 0) {
    return expired.reduce((a, b) => (a.valid_from > b.valid_from ? a : b));
  }

  return undefined;
}

function todayStrFromGetDayType() {
  // Use _getDebugDatetimeNow() if defined, else real now
  const now = (typeof _getDebugDatetimeNow === 'function' && _getDebugDatetimeNow()) || new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

async function loadSegments() {
  if (!ROUTES_CONFIG) return;
  const segDefs = ROUTES_CONFIG.segment_files || [];
  const today = todayStrFromGetDayType();

  // For each segment_file definition, pick the right regular file from manifest
  // and fetch it. Multiple segDefs may share a base name (e.g., ir_ishikawa_south
  // and ir_ishikawa_north both use 'ir_ishikawa'). Deduplicate by chosen file path.
  const fileToFetch = {};  // fileName -> Promise
  const segDefToFile = {}; // segDef.name -> fileName

  segDefs.forEach(segDef => {
    const baseName = segDef.file;
    const entries = (_manifest.regular && _manifest.regular[baseName]) || [];
    const picked = pickRegularEntry(entries, today);
    if (!picked) {
      console.warn(`No regular file for segment '${segDef.name}' (base '${baseName}')`);
      return;
    }
    segDefToFile[segDef.name] = picked.file;
    if (!fileToFetch[picked.file]) {
      fileToFetch[picked.file] = fetch(`data/regular/${picked.file}`).then(r => r.json());
    }
  });

  // Also fetch any special files that have a 'file' (skip fallback_to entries)
  // for segments referenced in segDefs. We fetch all files referenced in
  // _manifest.special, since special files are small and rarely numerous.
  const specialFilesToFetch = new Set();
  if (_manifest.special) {
    Object.entries(_manifest.special).forEach(([baseName, entries]) => {
      // Only fetch if there's a segDef using this baseName
      const usedByAny = segDefs.some(sd => sd.file === baseName);
      if (!usedByAny) return;
      entries.forEach(e => {
        if (e.file) specialFilesToFetch.add(e.file);
      });
    });
  }

  const fetched = {};        // regular fileName -> json
  const specialFetched = {}; // special fileName -> json
  await Promise.all([
    ...Object.entries(fileToFetch).map(async ([file, p]) => { fetched[file] = await p; }),
    ...[...specialFilesToFetch].map(async file => {
      try {
        const r = await fetch(`data/special/${file}`);
        specialFetched[file] = await r.json();
      } catch (e) {
        console.warn(`Failed to load special file ${file}:`, e);
      }
    })
  ]);

  // Build SEGMENTS: same shape as before
  segDefs.forEach(segDef => {
    const fname = segDefToFile[segDef.name];
    if (!fname) return;
    const segJson = fetched[fname];
    if (!segJson) return;
    const segObj = {};
    for (const [dirKey, routeId] of Object.entries(segDef.directions)) {
      const route = segJson.routes.find(r => r.id === routeId);
      if (route) {
        segObj[dirKey] = {
          stops: route.stops,
          schedules: { ...route.schedules } // copy so we can extend
        };
      }
    }
    segObj.meta = segJson.meta;
    segObj.type = segDef.type || 'bus';
    SEGMENTS[segDef.name] = segObj;
  });

  // Merge special schedules into SEGMENTS[seg].<dir>.schedules under their schedule_key
  if (_manifest.special) {
    Object.entries(_manifest.special).forEach(([baseName, entries]) => {
      entries.forEach(e => {
        if (!e.file || !e.schedule_key) return;
        const sjson = specialFetched[e.file];
        if (!sjson) return;
        // Find which segDefs use this baseName, and inject the schedule under schedule_key
        segDefs.forEach(sd => {
          if (sd.file !== baseName) return;
          const segObj = SEGMENTS[sd.name];
          if (!segObj) return;
          for (const [dirKey, routeId] of Object.entries(sd.directions)) {
            const route = sjson.routes.find(r => r.id === routeId);
            if (!route) continue;
            const trips = route.schedules && route.schedules.default;
            if (!trips) continue;
            if (segObj[dirKey] && segObj[dirKey].schedules) {
              segObj[dirKey].schedules[e.schedule_key] = trips;
            }
          }
        });
      });
    });
  }
}

async function loadHolidays() {
  try {
    const res = await fetch('data/holidays.json');
    const list = await res.json();
    _holidaySet = new Set(list);
  } catch (e) {
    console.warn('Failed to load holidays:', e);
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
  const sec = nowSec();
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  document.getElementById('header-time').textContent =
    `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function checkHolidayData() {
  const year = new Date().getFullYear();
  const prefix = year + '-';
  const hasCurrentYear = [..._holidaySet].some(d => d.startsWith(prefix));
  if (!hasCurrentYear) {
    const msg = t('holiday.missing', { year: year });
    // Show as a dismissible banner at the top
    const banner = document.createElement('div');
    banner.className = 'holiday-warning';
    banner.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">&times;</button>`;
    document.querySelector('main').prepend(banner);
  }
}

// ===== Tutorial =====
const TUTORIAL_TOTAL_PAGES = 4;
let _tutorialPage = 0;

function shouldShowTutorial() {
  return !localStorage.getItem('tutorialDone');
}

function openTutorial() {
  _tutorialPage = 0;
  const overlay = document.getElementById('tutorial-overlay');
  overlay.classList.add('open');
  renderTutorialPage();
}

function closeTutorial() {
  document.getElementById('tutorial-overlay').classList.remove('open');
  localStorage.setItem('tutorialDone', '1');
}

function renderTutorialPage() {
  // Update pages
  document.querySelectorAll('.tutorial-page').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.page) === _tutorialPage);
  });

  // Update dots
  const dotsContainer = document.getElementById('tutorial-dots');
  dotsContainer.innerHTML = Array.from({ length: TUTORIAL_TOTAL_PAGES }, (_, i) =>
    `<div class="tutorial-dot${i === _tutorialPage ? ' active' : ''}"></div>`
  ).join('');

  // Update buttons
  const prevBtn = document.getElementById('tutorial-prev');
  const nextBtn = document.getElementById('tutorial-next');
  const skipBtn = document.getElementById('tutorial-skip');

  prevBtn.classList.toggle('hidden', _tutorialPage === 0);

  const isLast = _tutorialPage === TUTORIAL_TOTAL_PAGES - 1;
  nextBtn.textContent = isLast ? t('tutorial.done') : t('tutorial.next');
  skipBtn.style.display = isLast ? 'none' : '';
}

function initTutorial() {
  document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);
  document.getElementById('tutorial-next').addEventListener('click', () => {
    if (_tutorialPage < TUTORIAL_TOTAL_PAGES - 1) {
      _tutorialPage++;
      renderTutorialPage();
    } else {
      closeTutorial();
    }
  });
  document.getElementById('tutorial-prev').addEventListener('click', () => {
    if (_tutorialPage > 0) {
      _tutorialPage--;
      renderTutorialPage();
    }
  });

  // Swipe support
  let touchStartX = 0;
  const container = document.querySelector('.tutorial-container');
  container.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  container.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && _tutorialPage < TUTORIAL_TOTAL_PAGES - 1) {
        _tutorialPage++;
        renderTutorialPage();
      } else if (dx > 0 && _tutorialPage > 0) {
        _tutorialPage--;
        renderTutorialPage();
      }
    }
  });

  // Show tutorial on first visit or when ?tutorial=1 is in URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tutorial') === '1') {
    // Remove the query param so refreshing won't re-show
    history.replaceState(null, '', window.location.pathname);
    openTutorial();
  } else if (shouldShowTutorial()) {
    openTutorial();
  }
}

// ===== Initialization =====
function initApp() {
  initTabs();
  initSearch();
  initSettingsDropdown();
  applyStaticTranslations();
  updateClock();
  checkHolidayData();
  initTutorial();

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
