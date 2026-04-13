// ===== Constants =====
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getTimeClass(h) {
  if (h < 5)  return 't-night';
  if (h < 8)  return 't-dawn';
  if (h < 12) return 't-morning';
  if (h < 18) return 't-day';
  if (h < 21) return 't-evening';
  return 't-night';
}

function formatHour(h) {
  if (h === 0)  return '12 AM';
  if (h < 12)   return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

// ===== State =====
const state = {
  city1: null,
  city2: null,
  clickDay: null,
  clickHour: null,
  clickSource: null
};

// ===== Get UTC offset in hours for an IANA timezone =====
function getOffsetFromTZ(tz) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(now);
  const get = (t) => parseInt(parts.find(p => p.type === t)?.value ?? '0');
  const localAsUTC = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second')
  );
  return Math.round((localAsUTC - now.getTime()) / 36000) / 100;
}

// ===== Map (srcDay, srcHour) in srcTZ to (dstDay, dstHour) in dstTZ =====
function mapTime(srcDay, srcHour, srcTZ, dstTZ) {
  const diffHours = Math.round(getOffsetFromTZ(dstTZ) - getOffsetFromTZ(srcTZ));
  let total = ((srcDay * 24 + srcHour + diffHours) % 168 + 168) % 168;
  return { day: Math.floor(total / 24) % 7, hour: total % 24 };
}

// ===== Build Table =====
// Transposed: rows = hours (0-23), columns = days (Sun-Sat)
function buildTable(tableEl) {
  const thead = tableEl.querySelector('thead tr');
  const tbody = tableEl.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Header row: corner + day labels
  const corner = document.createElement('th');
  corner.className = 'corner';
  thead.appendChild(corner);

  DAYS_SHORT.forEach((day, i) => {
    const th = document.createElement('th');
    th.className = 'day-head' + (i === 0 || i === 6 ? ' weekend' : '');
    th.textContent = day;
    thead.appendChild(th);
  });

  // One row per hour
  HOURS.forEach(h => {
    const tr = document.createElement('tr');

    // Hour label cell
    const tdLabel = document.createElement('td');
    tdLabel.className = 'hour-cell';
    tdLabel.textContent = formatHour(h);
    tr.appendChild(tdLabel);

    // One cell per day
    DAYS_SHORT.forEach((_, dayIdx) => {
      const td = document.createElement('td');
      td.className = `time-cell ${getTimeClass(h)}`;
      td.dataset.day = dayIdx;
      td.dataset.hour = h;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ===== Get cell by (day, hour) =====
function getCell(tableEl, day, hour) {
  return tableEl.querySelector(`td.time-cell[data-day="${day}"][data-hour="${hour}"]`);
}

// ===== Clear highlight classes =====
function clearHighlights(tableEl, classes) {
  classes.forEach(cls =>
    tableEl.querySelectorAll(`.${cls}`).forEach(el => el.classList.remove(cls))
  );
}

// ===== Hover highlight =====
function applyHover(srcDay, srcHour, srcTableEl, dstTableEl, srcTZ, dstTZ) {
  clearHighlights(srcTableEl, ['hover-src']);
  clearHighlights(dstTableEl, ['hover-peer']);

  const srcCell = getCell(srcTableEl, srcDay, srcHour);
  if (srcCell) srcCell.classList.add('hover-src');

  if (!dstTZ) return;

  const { day: dstDay, hour: dstHour } = mapTime(srcDay, srcHour, srcTZ, dstTZ);
  const dstCell = getCell(dstTableEl, dstDay, dstHour);
  if (dstCell) dstCell.classList.add('hover-peer');

  updateInfoPanel(srcDay, srcHour, srcTZ, dstDay, dstHour, dstTZ);
}

// ===== Click highlight =====
function applyClick(srcDay, srcHour, srcTableEl, dstTableEl, srcTZ, dstTZ) {
  clearHighlights(srcTableEl, ['click-src', 'click-peer']);
  clearHighlights(dstTableEl, ['click-src', 'click-peer']);

  const srcCell = getCell(srcTableEl, srcDay, srcHour);
  if (srcCell) srcCell.classList.add('click-src');

  if (!dstTZ) return;

  const { day: dstDay, hour: dstHour } = mapTime(srcDay, srcHour, srcTZ, dstTZ);
  const dstCell = getCell(dstTableEl, dstDay, dstHour);
  if (dstCell) dstCell.classList.add('click-peer');
}

// ===== Info Panel =====
function updateInfoPanel(srcDay, srcHour, srcTZ, dstDay, dstHour, dstTZ) {
  const info = document.getElementById('info-text');
  if (!state.city1 || !state.city2) {
    info.textContent = 'Select two cities, then hover over the grid';
    return;
  }
  const src = srcTZ === state.city1.tz ? state.city1 : state.city2;
  const dst = dstTZ === state.city1.tz ? state.city1 : state.city2;
  info.innerHTML =
    `<strong>${src.name}</strong> ${DAYS_FULL[srcDay]} ${formatHour(srcHour)}` +
    ` &nbsp;=&nbsp; ` +
    `<strong>${dst.name}</strong> ${DAYS_FULL[dstDay]} ${formatHour(dstHour)}`;
}

// ===== City Search =====
function setupSearch(inputId, dropdownId, tzLabelId, cityIndex) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const tzLabel  = document.getElementById(tzLabelId);

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    dropdown.innerHTML = '';
    if (q.length < 1) { dropdown.classList.remove('open'); return; }

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

    if (!results.length) { dropdown.classList.remove('open'); return; }

    results.forEach(city => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${city.name}</span><span class="city-country">${city.country}</span>`;
      li.addEventListener('click', () => selectCity(city, cityIndex, input, dropdown, tzLabel));
      dropdown.appendChild(li);
    });
    dropdown.classList.add('open');
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target))
      dropdown.classList.remove('open');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.classList.remove('open');
  });
}

function selectCity(city, cityIndex, input, dropdown, tzLabel) {
  input.value = city.name;
  dropdown.classList.remove('open');

  const off = getOffsetFromTZ(city.tz);
  const sign = off >= 0 ? '+' : '';
  const h = Math.trunc(off);
  const m = Math.abs(Math.round((off % 1) * 60));
  tzLabel.textContent = m ? `UTC${sign}${h}:${String(m).padStart(2,'0')}` : `UTC${sign}${h}`;

  if (cityIndex === 1) state.city1 = city;
  else state.city2 = city;

  // Re-apply locked selection after city change
  if (state.clickDay !== null && state.city1 && state.city2) {
    const t1 = document.getElementById('table-city1');
    const t2 = document.getElementById('table-city2');
    if (state.clickSource === 1) applyClick(state.clickDay, state.clickHour, t1, t2, state.city1.tz, state.city2.tz);
    else applyClick(state.clickDay, state.clickHour, t2, t1, state.city2.tz, state.city1.tz);
  }

  document.getElementById('info-text').textContent = 'Hover over the grid to compare times';
}

// ===== Wire Table Events =====
function setupTableEvents(tableEl, peerTableEl, getMyTZ, getPeerTZ) {
  tableEl.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('.time-cell');
    if (!cell || !getMyTZ() || !getPeerTZ()) return;
    applyHover(+cell.dataset.day, +cell.dataset.hour, tableEl, peerTableEl, getMyTZ(), getPeerTZ());
  });

  tableEl.addEventListener('mouseleave', () => {
    clearHighlights(tableEl,     ['hover-src']);
    clearHighlights(peerTableEl, ['hover-peer']);
    restoreInfoPanel();
  });

  tableEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.time-cell');
    if (!cell || !getMyTZ() || !getPeerTZ()) return;

    const day  = +cell.dataset.day;
    const hour = +cell.dataset.hour;
    const myIndex = tableEl.id === 'table-city1' ? 1 : 2;

    if (state.clickDay === day && state.clickHour === hour && state.clickSource === myIndex) {
      state.clickDay = state.clickHour = state.clickSource = null;
      clearHighlights(tableEl,     ['click-src', 'click-peer']);
      clearHighlights(peerTableEl, ['click-src', 'click-peer']);
      return;
    }

    state.clickDay    = day;
    state.clickHour   = hour;
    state.clickSource = myIndex;
    applyClick(day, hour, tableEl, peerTableEl, getMyTZ(), getPeerTZ());
  });
}

function restoreInfoPanel() {
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
    document.getElementById('info-text').textContent =
      state.city1 && state.city2 ? 'Hover over the grid to compare times' : 'Select two cities, then hover over the grid';
  }
}

// ===== Legend =====
function buildLegend(containerEl) {
  const legend = document.createElement('div');
  legend.className = 'legend';
  [
    { label: 'Midnight (0–5)',  color: '#12121e' },
    { label: 'Dawn (5–8)',      color: '#1a2a4a' },
    { label: 'Morning (8–12)', color: '#1e3040' },
    { label: 'Day (12–18)',    color: '#1e3530' },
    { label: 'Evening (18–21)',color: '#2e2a3a' },
    { label: 'Hover',          color: 'rgba(121,134,203,0.55)', outline: '2px solid #7986cb' },
    { label: 'Matched',        color: 'rgba(255,183,77,0.45)',  outline: '2px solid #ffb74d' },
    { label: 'Pinned',         color: 'rgba(92,107,192,0.85)',  outline: '2px solid #7986cb' },
    { label: 'Pinned match',   color: 'rgba(255,167,38,0.75)',  outline: '2px solid #ffa726' },
  ].forEach(item => {
    const div = document.createElement('div');
    div.className = 'legend-item';
    const sw = document.createElement('div');
    sw.className = 'legend-swatch';
    sw.style.background = item.color;
    if (item.outline) sw.style.outline = item.outline;
    div.appendChild(sw);
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

  buildLegend(document.getElementById('section-city1'));
  buildLegend(document.getElementById('section-city2'));

  setupSearch('city1-input', 'city1-dropdown', 'city1-tz', 1);
  setupSearch('city2-input', 'city2-dropdown', 'city2-tz', 2);

  setupTableEvents(t1, t2, () => state.city1?.tz, () => state.city2?.tz);
  setupTableEvents(t2, t1, () => state.city2?.tz, () => state.city1?.tz);

  // Defaults
  const defaultC1 = CITIES.find(c => c.name === 'Seoul');
  const defaultC2 = CITIES.find(c => c.name === 'Los Angeles');
  if (defaultC1) selectCity(defaultC1, 1, document.getElementById('city1-input'), document.getElementById('city1-dropdown'), document.getElementById('city1-tz'));
  if (defaultC2) selectCity(defaultC2, 2, document.getElementById('city2-input'), document.getElementById('city2-dropdown'), document.getElementById('city2-tz'));
}

document.addEventListener('DOMContentLoaded', init);
