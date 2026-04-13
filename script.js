// ===== Constants =====
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAYS_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Time-of-day classification
function getTimeClass(h) {
  if (h < 5)  return 't-night';
  if (h < 8)  return 't-dawn';
  if (h < 12) return 't-morning';
  if (h < 18) return 't-day';
  if (h < 21) return 't-evening';
  return 't-night';
}

function formatHour(h) {
  const ampm = h < 12 ? 'AM' : 'PM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${ampm}`;
}

// ===== State =====
const state = {
  city1: null,   // { name, country, tz }
  city2: null,
  // Locked click selection
  clickDay: null,   // 0-6
  clickHour: null,  // 0-23
  clickSource: null // 1 or 2 (which table was clicked)
};

// ===== Get UTC offset in hours for a given IANA timezone =====
// Returns e.g. 9 for Asia/Seoul, -5 for America/New_York (EST)
function getOffsetFromTZ(tz) {
  const now = new Date();
  // Format the date in the target timezone to extract local components
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(now);
  const get = (t) => parseInt(parts.find(p => p.type === t)?.value ?? '0');

  // Treat those local components as UTC to find TZ's "wall clock as UTC"
  const localAsUTC = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second')
  );

  // offset (hours) = (local wall clock - actual UTC) / 3600000
  return Math.round((localAsUTC - now.getTime()) / 36000) / 100;
}

// ===== Map from city1 (day, hour) to city2 coordinates =====
function mapTime(srcDay, srcHour, srcTZ, dstTZ) {
  const srcOff = getOffsetFromTZ(srcTZ); // hours offset from UTC
  const dstOff = getOffsetFromTZ(dstTZ);
  // Round to nearest hour for grid alignment (handles 30/45-min offsets)
  const diffHours = Math.round(dstOff - srcOff);

  let totalHours = srcDay * 24 + srcHour + diffHours;
  // Wrap within a week (0..167)
  totalHours = ((totalHours % 168) + 168) % 168;

  const dstDay = Math.floor(totalHours / 24) % 7;
  const dstHour = totalHours % 24;

  return { day: dstDay, hour: dstHour };
}

// ===== Build Table =====
function buildTable(tableEl) {
  const thead = tableEl.querySelector('thead tr');
  const tbody = tableEl.querySelector('tbody');

  // Clear
  thead.innerHTML = '<th class="day-header"></th>';
  tbody.innerHTML = '';

  // Header: hour labels
  HOURS.forEach(h => {
    const th = document.createElement('th');
    th.className = 'hour-head';
    th.textContent = h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
    thead.appendChild(th);
  });

  // Rows: one per day
  DAYS.forEach((day, dayIdx) => {
    const tr = document.createElement('tr');
    if (dayIdx === 0 || dayIdx === 6) tr.classList.add('weekend');

    const td0 = document.createElement('td');
    td0.className = 'day-cell';
    td0.textContent = day;
    tr.appendChild(td0);

    HOURS.forEach(h => {
      const td = document.createElement('td');
      td.className = `time-cell ${getTimeClass(h)}`;
      td.dataset.day = dayIdx;
      td.dataset.hour = h;

      const label = document.createElement('span');
      label.className = 'hour-label';
      label.textContent = formatHour(h);
      td.appendChild(label);

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ===== Get cell by (day, hour) =====
function getCell(tableEl, day, hour) {
  return tableEl.querySelector(`td.time-cell[data-day="${day}"][data-hour="${hour}"]`);
}

// ===== Clear all highlights from a table =====
function clearHighlights(tableEl, classes) {
  classes.forEach(cls => {
    tableEl.querySelectorAll(`.${cls}`).forEach(el => el.classList.remove(cls));
  });
}

// ===== Apply hover highlight =====
function applyHover(srcDay, srcHour, srcTableEl, dstTableEl, srcTZ, dstTZ) {
  // Clear old hover highlights (but preserve click)
  clearHighlights(srcTableEl, ['hover-src']);
  clearHighlights(dstTableEl, ['hover-peer']);

  const srcCell = getCell(srcTableEl, srcDay, srcHour);
  if (srcCell) srcCell.classList.add('hover-src');

  if (!dstTZ) return;

  const { day: dstDay, hour: dstHour } = mapTime(srcDay, srcHour, srcTZ, dstTZ);
  const dstCell = getCell(dstTableEl, dstDay, dstHour);
  if (dstCell) dstCell.classList.add('hover-peer');

  // Update info panel
  updateInfoPanel(srcDay, srcHour, srcTZ, dstDay, dstHour, dstTZ);
}

// ===== Apply click highlight =====
function applyClick(srcDay, srcHour, srcTableEl, dstTableEl, srcTZ, dstTZ) {
  // Clear all click highlights from both tables
  clearHighlights(srcTableEl, ['click-src', 'click-peer']);
  clearHighlights(dstTableEl, ['click-src', 'click-peer']);

  const srcCell = getCell(srcTableEl, srcDay, srcHour);
  if (srcCell) srcCell.classList.add('click-src');

  if (!dstTZ) return;

  const { day: dstDay, hour: dstHour } = mapTime(srcDay, srcHour, srcTZ, dstTZ);
  const dstCell = getCell(dstTableEl, dstDay, dstHour);
  if (dstCell) dstCell.classList.add('click-peer');
}

// ===== Update info panel =====
function updateInfoPanel(srcDay, srcHour, srcTZ, dstDay, dstHour, dstTZ) {
  const panel = document.getElementById('info-panel');
  const info = document.getElementById('info-text');

  if (!state.city1 || !state.city2) {
    info.textContent = '도시를 선택한 후 표에 마우스를 올려보세요';
    return;
  }

  const src = srcTZ === state.city1.tz ? state.city1 : state.city2;
  const dst = dstTZ === state.city1.tz ? state.city1 : state.city2;

  info.innerHTML =
    `<strong>${src.name}</strong> ${DAYS_FULL[srcDay]} ${formatHour(srcHour)} &nbsp;=&nbsp; ` +
    `<strong>${dst.name}</strong> ${DAYS_FULL[dstDay]} ${formatHour(dstHour)}`;
}

// ===== City Search =====
function setupSearch(inputId, dropdownId, tzLabelId, cityIndex) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const tzLabel = document.getElementById(tzLabelId);

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    dropdown.innerHTML = '';
    if (q.length < 1) { dropdown.classList.remove('open'); return; }

    // Deduplicate by tz+name combination
    const seen = new Set();
    const results = CITIES.filter(c => {
      const key = c.name.toLowerCase();
      return key.startsWith(q) || key.includes(q);
    }).filter(c => {
      const key = c.name + '|' + c.tz;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);

    if (results.length === 0) { dropdown.classList.remove('open'); return; }

    results.forEach(city => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${city.name}</span><span class="city-country">${city.country}</span>`;
      li.addEventListener('click', () => {
        selectCity(city, cityIndex, input, dropdown, tzLabel);
      });
      dropdown.appendChild(li);
    });

    dropdown.classList.add('open');
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.classList.remove('open');
  });
}

function selectCity(city, cityIndex, input, dropdown, tzLabel) {
  input.value = city.name;
  dropdown.classList.remove('open');

  const offsetH = getOffsetFromTZ(city.tz);
  const sign = offsetH >= 0 ? '+' : '';
  const offsetStr = Number.isInteger(offsetH)
    ? `UTC${sign}${offsetH}`
    : `UTC${sign}${Math.trunc(offsetH)}:${String(Math.abs(Math.round((offsetH % 1) * 60))).padStart(2, '0')}`;
  tzLabel.textContent = `${offsetStr}`;

  if (cityIndex === 1) state.city1 = city;
  else state.city2 = city;

  // Re-apply any existing click selection after city change
  if (state.clickDay !== null) {
    const t1 = document.getElementById('table-city1');
    const t2 = document.getElementById('table-city2');
    if (state.city1 && state.city2) {
      if (state.clickSource === 1) {
        applyClick(state.clickDay, state.clickHour, t1, t2, state.city1.tz, state.city2.tz);
      } else {
        applyClick(state.clickDay, state.clickHour, t2, t1, state.city2.tz, state.city1.tz);
      }
    }
  }

  document.getElementById('info-text').textContent = '표에 마우스를 올려보세요';
}

// ===== Wire table events =====
function setupTableEvents(tableEl, peerTableEl, getMyTZ, getPeerTZ) {
  tableEl.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.time-cell');
    if (!cell) return;
    if (!getMyTZ() || !getPeerTZ()) return;

    const day = +cell.dataset.day;
    const hour = +cell.dataset.hour;

    applyHover(day, hour, tableEl, peerTableEl, getMyTZ(), getPeerTZ());
  });

  tableEl.addEventListener('mouseleave', () => {
    clearHighlights(tableEl, ['hover-src']);
    clearHighlights(peerTableEl, ['hover-peer']);
    // Restore info panel to click state if any
    if (state.clickDay !== null && state.city1 && state.city2) {
      const t1 = document.getElementById('table-city1');
      const t2 = document.getElementById('table-city2');
      if (state.clickSource === 1) {
        const { day: d2, hour: h2 } = mapTime(state.clickDay, state.clickHour, state.city1.tz, state.city2.tz);
        updateInfoPanel(state.clickDay, state.clickHour, state.city1.tz, d2, h2, state.city2.tz);
      } else {
        const { day: d1, hour: h1 } = mapTime(state.clickDay, state.clickHour, state.city2.tz, state.city1.tz);
        updateInfoPanel(state.clickDay, state.clickHour, state.city2.tz, d1, h1, state.city1.tz);
      }
    } else {
      document.getElementById('info-text').textContent = state.city1 && state.city2
        ? '표에 마우스를 올려보세요'
        : '도시를 선택한 후 표에 마우스를 올려보세요';
    }
  });

  tableEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.time-cell');
    if (!cell) return;
    if (!getMyTZ() || !getPeerTZ()) return;

    const day = +cell.dataset.day;
    const hour = +cell.dataset.hour;
    const myIndex = tableEl.id === 'table-city1' ? 1 : 2;

    // Toggle off if clicking the same cell
    if (state.clickDay === day && state.clickHour === hour && state.clickSource === myIndex) {
      state.clickDay = null;
      state.clickHour = null;
      state.clickSource = null;
      clearHighlights(tableEl, ['click-src', 'click-peer']);
      clearHighlights(peerTableEl, ['click-src', 'click-peer']);
      return;
    }

    state.clickDay = day;
    state.clickHour = hour;
    state.clickSource = myIndex;

    applyClick(day, hour, tableEl, peerTableEl, getMyTZ(), getPeerTZ());
  });
}

// ===== Add legend =====
function buildLegend(containerEl) {
  const legend = document.createElement('div');
  legend.className = 'legend';
  const items = [
    { label: '새벽 (0-5시)', cls: 't-night', color: '#12121e' },
    { label: '여명 (5-8시)', cls: 't-dawn', color: '#1a2a4a' },
    { label: '오전 (8-12시)', cls: 't-morning', color: '#1e3040' },
    { label: '낮 (12-18시)', cls: 't-day', color: '#1e3530' },
    { label: '저녁 (18-21시)', cls: 't-evening', color: '#2e2a3a' },
    { label: '마우스 위치', color: 'rgba(121,134,203,0.55)', outline: '2px solid #7986cb' },
    { label: '대응 시간', color: 'rgba(255,183,77,0.45)', outline: '2px solid #ffb74d' },
    { label: '선택 고정', color: 'rgba(92,107,192,0.85)', outline: '2px solid #7986cb' },
    { label: '대응 고정', color: 'rgba(255,167,38,0.75)', outline: '2px solid #ffa726' },
  ];
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'legend-item';
    const swatch = document.createElement('div');
    swatch.className = 'legend-swatch';
    swatch.style.background = item.color;
    if (item.outline) swatch.style.outline = item.outline;
    div.appendChild(swatch);
    const span = document.createElement('span');
    span.textContent = item.label;
    div.appendChild(span);
    legend.appendChild(div);
  });
  containerEl.appendChild(legend);
}

// ===== Init =====
function init() {
  const t1 = document.getElementById('table-city1');
  const t2 = document.getElementById('table-city2');

  buildTable(t1);
  buildTable(t2);

  // Add legends
  buildLegend(document.getElementById('section-city1'));
  buildLegend(document.getElementById('section-city2'));

  setupSearch('city1-input', 'city1-dropdown', 'city1-tz', 1);
  setupSearch('city2-input', 'city2-dropdown', 'city2-tz', 2);

  setupTableEvents(t1, t2,
    () => state.city1?.tz,
    () => state.city2?.tz
  );
  setupTableEvents(t2, t1,
    () => state.city2?.tz,
    () => state.city1?.tz
  );

  // Default cities: Seoul <-> New York
  const defaultC1 = CITIES.find(c => c.name === 'Seoul');
  const defaultC2 = CITIES.find(c => c.name === 'New York');

  if (defaultC1) {
    const inp = document.getElementById('city1-input');
    const dd = document.getElementById('city1-dropdown');
    const lbl = document.getElementById('city1-tz');
    selectCity(defaultC1, 1, inp, dd, lbl);
  }
  if (defaultC2) {
    const inp = document.getElementById('city2-input');
    const dd = document.getElementById('city2-dropdown');
    const lbl = document.getElementById('city2-tz');
    selectCity(defaultC2, 2, inp, dd, lbl);
  }
}

document.addEventListener('DOMContentLoaded', init);
