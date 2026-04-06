// ===== Data Loading =====
async function loadData() {
  // Load holidays and routes config
  await Promise.all([loadHolidays(), loadRoutesConfig()]);

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
