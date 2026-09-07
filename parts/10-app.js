<script>
/* =====================================================================
   Application layer: location + date state, readouts, tour, controls.
   ===================================================================== */
(function(){
'use strict';
const A = window.Astro;
const $ = id => document.getElementById(id);

/* ------------------------------------------------------------- places */

const COUNTRIES = window.PLACES.map(row => {
  const bits = row.split('|');
  return {
    name: bits[0],
    cities: bits.slice(1).map(c => {
      const p = c.split(',');
      return { name: p[0], lat: parseFloat(p[1]), lon: parseFloat(p[2]) };
    })
  };
});

/* ------------------------------------------------------------- state */

const now = new Date();
const S = {
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  day: now.getDate(),
  country: null,
  city: null,
  playing: false,
  speed: 4,
  texturesOk: true
};

/* ------------------------------------------------------- formatting */

function pad2(n){ return String(n).padStart(2, '0'); }

function fmtHM(hours){
  if (hours == null || !isFinite(hours)) return '—';
  let h = hours;
  while (h < 0) h += 24;
  while (h >= 24) h -= 24;
  let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60){ mm = 0; hh = (hh + 1) % 24; }
  return pad2(hh) + ':' + pad2(mm);
}

function fmtDur(hours){
  const hh = Math.floor(hours), mm = Math.round((hours - hh) * 60);
  return mm === 60 ? (hh + 1) + 'h 00m' : hh + 'h ' + pad2(mm) + 'm';
}

function fmtLat(v){
  return Math.abs(v).toFixed(2) + '° ' + (v >= 0 ? 'N' : 'S');
}
function fmtLon(v){
  return Math.abs(v).toFixed(2) + '° ' + (v >= 0 ? 'E' : 'W');
}
const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
const MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(d){ return d.day + ' ' + MON3[d.month - 1] + ' ' + d.year; }

/*  Spell out the month block a meteorological season covers.  Read back
    off the same function the label comes from rather than hard-coding a
    table, so the southern flip and the winter wrap come out right.     */
function metRange(name, lat){
  const ms = [];
  for (let m = 1; m <= 12; m++) if (A.meteorologicalSeason(m, lat) === name) ms.push(m);
  if (!ms.length) return '';
  let start = ms[0];
  for (const m of ms) if (ms.indexOf(m === 1 ? 12 : m - 1) < 0) start = m;
  let end = start;
  for (let k = 1; k < ms.length; k++) end = end === 12 ? 1 : end + 1;
  return MONTHS[start - 1] + ' – ' + MONTHS[end - 1];
}

/* ------------------------------------------------- season boundaries */

/*  All turning points from last year to next, so the season containing
    any date is bracketed correctly even across the New Year.          */
function bracketEvents(jd, year){
  let all = [];
  for (const y of [year - 1, year, year + 1]) all = all.concat(A.yearEvents(y));
  all.sort((a, b) => a.jd - b.jd);
  let prev = null, next = null;
  for (const e of all){
    if (e.jd <= jd) prev = e;
    else { next = e; break; }
  }
  return { prev: prev, next: next, all: all };
}

/* ------------------------------------------------------- dropdowns */

function buildCountryList(){
  const sel = $('countrySel');
  sel.innerHTML = '';
  COUNTRIES.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = c.name;
    sel.appendChild(o);
  });
}

function buildCityList(){
  const sel = $('citySel');
  sel.innerHTML = '';
  S.country.cities.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = c.name + '  (' + fmtLat(c.lat) + ')';
    sel.appendChild(o);
  });
  sel.disabled = S.country.cities.length < 2;
}

/*  Best-effort default: match the browser's IANA time zone city against
    the list.  Falls back to London, which is at least well known.     */
function guessStart(){
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e){}
  const want = tz.split('/').pop().replace(/_/g, ' ').toLowerCase();
  if (want){
    for (let ci = 0; ci < COUNTRIES.length; ci++){
      const cities = COUNTRIES[ci].cities;
      for (let i = 0; i < cities.length; i++){
        if (cities[i].name.toLowerCase().indexOf(want) === 0) return [ci, i];
      }
    }
  }
  for (let ci = 0; ci < COUNTRIES.length; ci++){
    if (COUNTRIES[ci].name === 'United Kingdom') return [ci, 0];
  }
  return [0, 0];
}

/* ------------------------------------------------------------- tour */

const TOUR = [
  { t: 'Earth spins on an axis that is tilted <b>23.44°</b> from straight up. ' +
       'Crucially, that axis keeps pointing the <b>same way in space</b> all year — ' +
       'at the star Polaris. It does not swing to follow the Sun.',
    go(){ OrbitView.setCamera('side'); OrbitView.toggle('axis', true); setToggle('tglAxis', true); } },

  { t: 'Because the tilt is fixed while Earth travels, the same axis leans ' +
       '<b>toward</b> the Sun in June and <b>away</b> from it in December. ' +
       'Watch the lit half of the globe move over the pole.',
    go(){ jumpToEvent(1); OrbitView.setCamera('earth'); } },

  { t: 'Leaning toward the Sun means sunlight arrives <b>steeply</b>. The same ' +
       'beam is squeezed into a smaller patch of ground, so each square metre ' +
       'gets more energy. Leaning away spreads the same beam thin.',
    go(){ OrbitView.setCamera('earth'); OrbitView.toggle('rays', true); setToggle('tglRays', true); } },

  { t: 'The tilt also decides <b>how long</b> the Sun is up. The lit half never ' +
       'splits the globe evenly except at the equinoxes — jump to December and ' +
       'the Arctic Circle sits entirely in darkness.',
    go(){ jumpToEvent(3); OrbitView.setCamera('earth'); OrbitView.toggle('rings', true); setToggle('tglRings', true); } },

  { t: 'Now the myth. Earth is <b>closest</b> to the Sun in early January — ' +
       'during northern winter. The orbit is only 1.7% off circular, so distance ' +
       'changes sunlight by about 7% over the year, while the tilt changes it by ' +
       'several hundred percent. <b>Tilt makes seasons, not distance.</b>',
    go(){ setDate(S.year, 1, 3); OrbitView.setCamera('top'); } }
];
let tourStep = -1;

function renderTour(){
  const body = $('tourBody');
  if (tourStep < 0){
    body.innerHTML = 'Five short steps through the whole mechanism, from the tilt ' +
                     'to the reason distance is a red herring.';
  } else {
    body.innerHTML = '<b>Step ' + (tourStep + 1) + ' of ' + TOUR.length + '.</b> ' + TOUR[tourStep].t;
  }
  const dots = $('tourDots');
  dots.innerHTML = '';
  for (let i = 0; i < TOUR.length; i++){
    const d = document.createElement('i');
    if (i === tourStep) d.className = 'on';
    dots.appendChild(d);
  }
  $('tourPrev').disabled = tourStep <= 0;
  $('tourNext').textContent = tourStep < 0 ? 'Start tour ›'
                            : (tourStep === TOUR.length - 1 ? 'Restart' : 'Next ›');
}

/* --------------------------------------------------------- controls */

function setToggle(id, on){
  const b = $(id);
  if (b) b.classList.toggle('on', on);
}

function jumpToEvent(i){
  const ev = A.yearEvents(S.year)[i];
  const d = A.jdToDate(ev.jd + (S.city ? S.city.lon / 360 : 0));
  setDate(d.year, d.month, d.day);
}

function setDate(y, m, d){
  S.year = y; S.month = m; S.day = d;
  refresh();
}

function stepDays(n){
  const jd = A.julianDay(S.year, S.month, S.day, 12) + n;
  const d = A.jdToDate(jd);
  setDate(d.year, d.month, d.day);
}

/* ----------------------------------------------------------- refresh */

let lastYear = null, lastPlaceKey = null;

function refresh(){
  const city = S.city;
  const c = A.dayCircumstances(S.year, S.month, S.day, city.lat, city.lon);
  const sun = c.sun;

  /*  A turning point is an instant, not a day.  The December solstice can
      fall at 20:49 UTC, so at local noon on the 21st it is still, strictly,
      autumn — which reads as a bug to anyone who was taught that winter
      starts on the solstice.  So when a turning point falls on this local
      calendar day, show the season it begins, and say when it begins.    */
  let jdSeason = c.jd;
  let br = bracketEvents(jdSeason, S.year);
  const nextLocal = A.jdToDate(br.next.jd + city.lon / 360);
  const startsToday = nextLocal.year === S.year &&
                      nextLocal.month === S.month && nextLocal.day === S.day;
  if (startsToday){
    jdSeason = br.next.jd + 1e-6;
    br = bracketEvents(jdSeason, S.year);
  }
  const season = A.seasonFor(A.sunPosition(jdSeason).lam, city.lat);

  /* ---- date widgets ---- */
  const dn = A.dayOfYear(S.year, S.month, S.day);
  const N = A.daysInYear(S.year);
  const scrub = $('scrub');
  if (+scrub.max !== N - 1) scrub.max = N - 1;
  if (+scrub.value !== dn - 1) scrub.value = dn - 1;
  $('dateInput').value = S.year + '-' + pad2(S.month) + '-' + pad2(S.day);
  $('dateLabel').textContent = fmtDate({ year:S.year, month:S.month, day:S.day });

  /* ---- season card ---- */
  const card = $('seasonCard');
  card.style.setProperty('--sc', season.color);
  $('seasonName').textContent = season.headline;

  const startD = A.jdToDate(br.prev.jd + city.lon / 360);
  const endD   = A.jdToDate(br.next.jd + city.lon / 360);
  const daysIn = Math.max(0, Math.floor(jdSeason - br.prev.jd));
  const daysTo = Math.max(0, Math.ceil(br.next.jd - jdSeason));

  /*  The turning point may fall earlier today (already passed at local
      noon) or later today (which is why jdSeason was nudged forward).
      Either way "began 0 days ago" is a poor way to say it.            */
  const turnsToday = startD.year === S.year &&
                     startD.month === S.month && startD.day === S.day;

  /*  Countdown chip.  Naming the season the turning point brings beats
      naming the event — except in the tropics, where no season is marked
      and only the event itself carries meaning.                        */
  const nextSeason = A.seasonFor(A.sunPosition(br.next.jd + 1e-6).lam, city.lat);
  const inDays = ' in ' + daysTo + (daysTo === 1 ? ' day' : ' days');
  $('seasonCount').textContent = turnsToday ? 'turning point today'
    : (season.band === 'equatorial' ? br.next.label + inDays
                                    : nextSeason.name + inDays);

  /*  Both definitions, side by side.  Meteorological seasons are whole
      months so climate records line up year to year, which is why a
      European forecast says autumn on 1 September while the Sun is still
      17 days short of the equinox.  Showing only one invites "wrong".  */
  const astroName = $('defAstroName');
  astroName.textContent = season.name;
  astroName.style.color = season.color;
  $('defAstroWhen').textContent = turnsToday
    ? '· from ' + fmtHM(startD.hour) + ' local today'
    : '· ' + fmtDate(startD) + ' – ' + fmtDate(endD);

  const met = A.meteorologicalSeason(S.month, city.lat);
  $('defMetName').textContent = met;
  $('defMetWhen').textContent = '· ' + metRange(met, city.lat);

  $('seasonSub').innerHTML = turnsToday
    ? 'The <b style="color:' + season.color + '">' + br.prev.label +
      '</b> falls today at ' + fmtHM(startD.hour) + ' local time.'
    : 'Day ' + (daysIn + 1) + ' of the astronomical season · next turning point: ' +
      br.next.label + ', ' + fmtDate(endD) + '.';

  const badges = $('seasonBadges');
  badges.innerHTML = '';
  const addBadge = (txt, cls) => {
    const b = document.createElement('span');
    b.className = 'badge' + (cls ? ' ' + cls : '');
    b.textContent = txt;
    badges.appendChild(b);
  };
  addBadge(season.hemisphere + ' hemisphere');   // meteorological now has its own row
  if (c.state === 'polar-day')   addBadge('Midnight Sun — never sets', 'warn');
  if (c.state === 'polar-night') addBadge('Polar night — never rises', 'cold');
  if (season.band === 'tropical' || season.band === 'equatorial') addBadge('Tropics', 'trop');
  $('seasonNote').textContent = season.note;

  /* ---- the Sun from there ---- */
  if (c.state === 'polar-day'){
    $('stDaylight').textContent = '24h 00m';
    // there is no sunrise OR sunset today, so neither row has a time
    $('stRise').textContent = $('stSet').textContent = 'none today';
  } else if (c.state === 'polar-night'){
    $('stDaylight').textContent = '0h 00m';
    $('stRise').textContent = $('stSet').textContent = 'none today';
  } else {
    $('stDaylight').textContent = fmtDur(c.daylight);
    $('stRise').textContent = fmtHM(c.sunrise);
    $('stSet').textContent  = fmtHM(c.sunset);
  }
  $('stNoonAlt').textContent = c.noonAlt > 0
    ? c.noonAlt.toFixed(1) + '°'
    : 'below horizon';
  $('stFlux').textContent = c.noonAlt > 0
    ? Math.round(c.fluxNoon * 100) + '%'
    : '0%';
  $('stInsol').textContent = c.insolation.toFixed(2) + ' kWh/m²';

  const yd = A.jdToDate(A.julianDay(S.year, S.month, S.day, 12) - 1);
  const prev = A.dayCircumstances(yd.year, yd.month, yd.day, city.lat, city.lon);
  const dMin = (c.daylight - prev.daylight) * 60;
  $('stTrend').textContent = (Math.abs(dMin) < 0.05 ? '±0' :
    (dMin > 0 ? '+' : '−') + Math.abs(dMin).toFixed(1)) + ' min of daylight';
  $('stTrend').style.color = Math.abs(dMin) < 0.05 ? '' : (dMin > 0 ? '#6fd08c' : '#ff8a5b');

  /* ---- sub-solar ---- */
  $('stSubLat').textContent = fmtLat(sun.dec);
  $('stDec').textContent    = (sun.dec >= 0 ? '+' : '−') + Math.abs(sun.dec).toFixed(2) + '°';
  $('stLam').textContent    = sun.lam.toFixed(2) + '°';
  $('stNextEv').textContent = daysTo + ' d — ' + br.next.short;

  const oh = A.overheadDates(S.year, city.lat, city.lon);
  $('subHint').textContent = oh.length
    ? 'At ' + city.name + ' the Sun passes directly overhead on ' +
      oh.map(d => d.day + ' ' + MON3[d.month-1]).join(' and ') + '.'
    : 'The Sun is never directly overhead at ' + city.name +
      ' — beyond the tropics it always stays at least ' +
      (Math.abs(city.lat) - A.TROPIC).toFixed(1) + '° short of the zenith at noon.';

  /* ---- distance ---- */
  const mkm = c.distKm / 1e6;
  $('stDist').textContent = mkm.toFixed(2) + 'M km';
  const pct = (sun.r - 1) * 100;
  $('stDistPct').textContent = (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%';
  const frac = A.clamp((mkm - 147.10) / (152.10 - 147.10), 0, 1);
  $('distMark').style.left = (frac * 100) + '%';

  const northWinter = season.hemisphere === 'Northern' && season.name === 'Winter';
  const closeIsh = sun.r < 0.995;
  $('mythBox').innerHTML = closeIsh
    ? '<strong>Look at this.</strong> Earth is near its <em>closest</em> point to the Sun right now — ' +
      'and it is ' + (northWinter ? 'the middle of northern winter' :
      'summer in the south, winter in the north') + '. Distance is not what makes seasons.'
    : (sun.r > 1.005
      ? '<strong>And here is the reverse.</strong> Earth is near its <em>farthest</em> point, ' +
        'yet the northern hemisphere is having its summer. The 3.3% distance swing is ' +
        'swamped by what the tilt does.'
      : 'Across the whole year this distance changes by only <strong>3.3%</strong>, ' +
        'altering sunlight by about 7%. The tilt changes the noon Sun height here by ' +
        '<strong>' + (2 * A.TROPIC).toFixed(0) + '°</strong> — a far bigger effect.');

  /* ---- 3D + sky + graphs ---- */
  OrbitView.setDate(c.jd);

  const sky = SkyView.update(city.lat, city.lon, S.year, S.month, S.day);
  $('skRiseAz').textContent = sky.riseAz == null ? '—' : compass(sky.riseAz);
  $('skSetAz').textContent  = sky.setAz  == null ? '—' : compass(sky.setAz);
  $('skNoonAlt').textContent = c.noonAlt > 0 ? c.noonAlt.toFixed(1) + '°' : 'below horizon';
  $('skMaxAlt').textContent  = sky.maxNoonAlt.toFixed(1) + '°' +
    (Math.abs(city.lat) <= A.TROPIC ? ' (straight overhead)' : '');
  $('skMinAlt').textContent  = sky.minNoonAlt > 0
    ? sky.minNoonAlt.toFixed(1) + '°'
    : sky.minNoonAlt.toFixed(1) + '° (Sun stays down)';

  if (S.year !== lastYear) rebuildEventButtons();
  lastYear = S.year;
  renderTimelineMarks();

  Graphs.draw(city.lat, city.lon, S.year, dn - 1);
}

function compass(az){
  const NAMES = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return Math.round(az) + '° ' + NAMES[Math.round(az / 22.5) % 16];
}

/*  Tick marks above the scrubber at the four turning points.  A range
    thumb travels from half its own width to the track end minus the same,
    so the offsets are expressed against that inset rather than 0-100%.  */
let lastMarksKey = null;
function renderTimelineMarks(){
  const key = S.year + '|' + S.city.lon;
  if (key === lastMarksKey) return;
  lastMarksKey = key;

  const wrap = $('tlMarks');
  wrap.innerHTML = '';
  const N = A.daysInYear(S.year);
  for (const e of A.yearEvents(S.year)){
    const d = A.jdToDate(e.jd + S.city.lon / 360);
    const frac = (A.dayOfYear(d.year, d.month, d.day) - 1) / (N - 1);
    const i = document.createElement('i');
    i.className = e.kind;
    i.style.left = 'calc(8px + ' + frac.toFixed(5) + ' * (100% - 16px))';
    i.title = e.label + ' — ' + fmtDate(d);
    wrap.appendChild(i);
  }
}

function rebuildEventButtons(){
  const wrap = $('eventBtns');
  wrap.innerHTML = '';
  A.yearEvents(S.year).forEach((e, i) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = e.short;
    b.title = e.label + ' ' + S.year + ' — ' + A.jdToDate(e.jd).year + '-' +
              pad2(A.jdToDate(e.jd).month) + '-' + pad2(A.jdToDate(e.jd).day) + ' UTC';
    b.onclick = () => { stopPlay(); jumpToEvent(i); };
    wrap.appendChild(b);
  });
}

/* ---------------------------------------------------------- playback */

let playRaf = null, playLast = 0, playAcc = 0;

function startPlay(){
  if (S.playing) return;
  S.playing = true;
  $('playBtn').textContent = '❚❚ Pause';
  $('playBtn').classList.add('on');
  playLast = performance.now(); playAcc = 0;
  const tick = t => {
    if (!S.playing) return;
    playRaf = requestAnimationFrame(tick);
    playAcc += (t - playLast) / 1000 * S.speed;
    playLast = t;
    if (playAcc >= 1){
      const n = Math.floor(playAcc);
      playAcc -= n;
      stepDays(n);
    }
  };
  playRaf = requestAnimationFrame(tick);
}

function stopPlay(){
  S.playing = false;
  if (playRaf) cancelAnimationFrame(playRaf);
  $('playBtn').textContent = '▶ Play';
  $('playBtn').classList.remove('on');
}

/* ------------------------------------------------------------- wiring */

function selectCity(ci, cityIdx){
  S.country = COUNTRIES[ci];
  $('countrySel').value = ci;
  buildCityList();
  const idx = Math.min(cityIdx || 0, S.country.cities.length - 1);
  $('citySel').value = idx;
  S.city = S.country.cities[idx];
  $('coordHint').textContent = fmtLat(S.city.lat) + ', ' + fmtLon(S.city.lon) +
    ' · ' + bandName(S.city.lat);
  OrbitView.setCity(S.city);
  SkyView.resetView();
}

function bandName(lat){
  const a = Math.abs(lat);
  if (a <= 10) return 'equatorial';
  if (a < A.TROPIC) return 'tropics';
  if (a >= A.POLAR) return lat > 0 ? 'inside the Arctic Circle' : 'inside the Antarctic Circle';
  return 'mid-latitudes';
}

function wire(){
  $('countrySel').addEventListener('change', e => {
    selectCity(+e.target.value, 0);
    refresh();
  });
  $('citySel').addEventListener('change', e => {
    selectCity(+$('countrySel').value, +e.target.value);
    refresh();
  });

  $('scrub').addEventListener('input', e => {
    stopPlay();
    const d = A.fromDayOfYear(S.year, +e.target.value + 1);
    setDate(d.year, d.month, d.day);
  });

  $('dateInput').addEventListener('change', e => {
    const m = e.target.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    stopPlay();
    setDate(+m[1], +m[2], +m[3]);
  });

  $('dayPrev').onclick = () => { stopPlay(); stepDays(-1); };
  $('dayNext').onclick = () => { stopPlay(); stepDays(1); };
  $('playBtn').onclick = () => { S.playing ? stopPlay() : startPlay(); };
  $('speedSel').addEventListener('change', e => { S.speed = parseFloat(e.target.value); });
  $('todayBtn').onclick = () => {
    stopPlay();
    const t = new Date();
    setDate(t.getFullYear(), t.getMonth() + 1, t.getDate());
  };

  document.querySelectorAll('[data-cam]').forEach(b => {
    b.onclick = () => OrbitView.setCamera(b.getAttribute('data-cam'));
  });

  const tg = (id, key) => {
    $(id).onclick = () => {
      const on = !$(id).classList.contains('on');
      setToggle(id, on);
      OrbitView.toggle(key, on);
    };
  };
  tg('tglRings', 'rings');
  tg('tglAxis', 'axis');
  tg('tglRays', 'rays');

  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
      document.querySelectorAll('.tabpane').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      $('pane-' + t.getAttribute('data-tab')).classList.add('on');
      if (t.getAttribute('data-tab') === 'graph') refresh();
    };
  });

  $('tourNext').onclick = () => {
    tourStep = tourStep >= TOUR.length - 1 ? 0 : tourStep + 1;
    renderTour();
    TOUR[tourStep].go();
  };
  $('tourPrev').onclick = () => {
    if (tourStep > 0){ tourStep--; renderTour(); TOUR[tourStep].go(); }
  };

  window.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
    if (e.key === 'ArrowLeft'){ stopPlay(); stepDays(e.shiftKey ? -7 : -1); e.preventDefault(); }
    if (e.key === 'ArrowRight'){ stopPlay(); stepDays(e.shiftKey ? 7 : 1); e.preventDefault(); }
    if (e.key === ' '){ S.playing ? stopPlay() : startPlay(); e.preventDefault(); }
  });

  let rz = null;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => Graphs.draw(S.city.lat, S.city.lon, S.year,
                                      A.dayOfYear(S.year, S.month, S.day) - 1), 140);
  });
}

/* ---------------------------------------------------------------- boot */

async function boot(){
  buildCountryList();
  const [ci, cityIdx] = guessStart();

  SkyView.init($('skyCanvas'));
  const res = await OrbitView.init($('orbitCanvas'), {});
  S.texturesOk = res.texturesOk;

  selectCity(ci, cityIdx);
  wire();
  renderTour();
  rebuildEventButtons();
  refresh();

  if (!S.texturesOk){
    $('scaleWarn').textContent = 'Offline globe — map textures unavailable';
    $('scaleWarn').title = 'The Earth texture CDN could not be reached, so a ' +
      'generated stand-in globe is shown. Every number and angle is unaffected.';
  }

  $('boot').classList.add('gone');
  setTimeout(() => { const b = $('boot'); if (b) b.remove(); }, 450);

  /*  The scene checks in the self-test read what has actually been drawn,
      so wait for a frame that used the current date and city.          */
  if (window.SeasonSelfTest){
    requestAnimationFrame(() => requestAnimationFrame(() => window.SeasonSelfTest()));
  }
}

window.addEventListener('error', ev => {
  const f = $('fatal');
  if (!f || f.style.display === 'grid') return;
  f.style.display = 'grid';
  $('fatalMsg').textContent = (ev.message || 'Unknown error') +
    '\n' + (ev.filename || '') + ':' + (ev.lineno || '') +
    '\n\nIf this says THREE is not defined, the three.js CDN could not be reached — ' +
    'this page needs a network connection the first time it loads.';
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
</script>
