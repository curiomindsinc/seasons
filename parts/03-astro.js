<script>
/* =====================================================================
   Why Earth Has Seasons — orbital + solar-geometry engine
   ---------------------------------------------------------------------
   Model: Keplerian two-body Earth orbit, elements from Meeus ch.25
   (low-precision solar theory).  Accuracy of the Sun's ecliptic
   longitude is a few arc-seconds over 1900-2200, which puts the
   equinox / solstice instants within a couple of minutes of the
   published values.  Nutation and aberration are ignored.
   ===================================================================== */
(function(){
'use strict';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const norm360 = x => { x %= 360; return x < 0 ? x + 360 : x; };
const norm180 = x => { x = norm360(x); return x > 180 ? x - 360 : x; };

/* ---------------------------------------------------------------- time */

// Gregorian calendar date (UTC) -> Julian Day. month is 1-12.
function julianDay(y, m, d, hoursUTC){
  hoursUTC = hoursUTC || 0;
  if (m <= 2){ y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1))
       + d + B - 1524.5 + hoursUTC / 24;
}

// Julian Day -> {year, month, day, hour} in UTC.
function jdToDate(jd){
  const z = Math.floor(jd + 0.5), f = jd + 0.5 - z;
  let A = z;
  if (z >= 2299161){
    const a = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + a - Math.floor(a / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const Dd = Math.floor(365.25 * C);
  const E = Math.floor((B - Dd) / 30.6001);
  const dayF = B - Dd - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const day = Math.floor(dayF);
  return { year: year, month: month, day: day, hour: (dayF - day) * 24 };
}

const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInYear = y => isLeap(y) ? 366 : 365;

function dayOfYear(y, m, d){
  return Math.round(julianDay(y, m, d, 0) - julianDay(y, 1, 1, 0)) + 1;   // 1-based
}
function fromDayOfYear(y, n){                                            // 1-based
  return jdToDate(julianDay(y, 1, 1, 0) + (n - 1) + 0.0001);
}

/* -------------------------------------------------------- sun position */

// Solve Kepler's equation  E - e*sin E = M  (all radians) by Newton-Raphson.
function keplerE(M, e){
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 30; i++){
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-13) break;
  }
  return E;
}

/*  Geocentric Sun.  Returns degrees except r (AU) and eot (minutes).
    lam = apparent ecliptic longitude, dec = declination,
    ra  = right ascension, eot = equation of time.                     */
function sunPosition(jd){
  const n = jd - 2451545.0;                       // days from J2000.0

  const L0 = norm360(280.46646 + 0.9856473599  * n);   // mean longitude
  const M  = norm360(357.52911 + 0.98560028    * n);   // mean anomaly
  const e  = 0.016708634 - 1.151e-9 * n;               // eccentricity
  // longitude of perigee of the Sun = L0 - M, kept exactly consistent
  const peri = 282.93735 + (0.9856473599 - 0.98560028) * n;

  const E  = keplerE(M * D2R, e);
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2),
                            Math.sqrt(1 - e) * Math.cos(E / 2));
  const a  = 1.000001018;
  const r  = a * (1 - e * Math.cos(E));                // AU

  const lamTrue = norm360(nu * R2D + peri);            // geometric longitude

  /*  Apparent longitude.  Two corrections, both small but both worth
      keeping: without them the computed equinox instants land a
      consistent ~15 minutes early against published values.           */
  const T     = n / 36525;
  const omega = norm360(125.04452 - 1934.136261 * T);  // lunar ascending node
  const cosOm = Math.cos(omega * D2R), sinOm = Math.sin(omega * D2R);
  const dPsi  = -0.004778 * sinOm;                     // nutation in longitude, deg
  const aberr = -0.0056916 / r;                        // annual aberration, deg

  const lam = norm360(lamTrue + dPsi + aberr);         // apparent longitude
  const eps = 23.4392911 - 3.563e-7 * n + 0.00256 * cosOm;   // true obliquity

  const sl = Math.sin(lam * D2R), cl = Math.cos(lam * D2R);
  const se = Math.sin(eps * D2R), ce = Math.cos(eps * D2R);

  const dec = Math.asin(clamp(se * sl, -1, 1)) * R2D;
  const ra  = norm360(Math.atan2(ce * sl, cl) * R2D);

  // Meeus 28.3
  const eot = 4 * norm180(L0 - 0.0057183 - ra + dPsi * ce);   // minutes

  return { n:n, L0:L0, M:M, e:e, nu:nu * R2D, r:r,
           lam:lam, lamTrue:lamTrue, eps:eps, dPsi:dPsi,
           dec:dec, ra:ra, eot:eot };
}

// Greenwich mean sidereal time, degrees.
function gmstDeg(jd){
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
}

// Point on Earth where the Sun is exactly overhead.
function subsolarPoint(jd){
  const s = sunPosition(jd);
  return { lat: s.dec, lon: norm180(s.ra - gmstDeg(jd)), s: s };
}

/* ------------------------------------------------- daily solar circumstances */

const H_RISE = -0.833;                 // deg: refraction + solar semi-diameter
const AU_KM  = 149597870.7;
const S0     = 1361;                   // solar constant, W/m^2

/*  Everything a place needs for one calendar day.
    Times come back as local MEAN solar time (hours) — longitude only,
    no time zone, no daylight saving.                                    */
function dayCircumstances(year, month, day, latDeg, lonDeg){
  // iterate once so declination is evaluated at local solar noon
  let jd = julianDay(year, month, day, 12 - lonDeg / 15);
  let s  = sunPosition(jd);
  jd = julianDay(year, month, day, 12 - lonDeg / 15 - s.eot / 60);
  s  = sunPosition(jd);

  const phi = latDeg * D2R, dec = s.dec * D2R;
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
  const sinDec = Math.sin(dec), cosDec = Math.cos(dec);

  const cosH = (Math.sin(H_RISE * D2R) - sinPhi * sinDec) / (cosPhi * cosDec);

  let daylight, H0deg, state, sunrise = null, sunset = null;
  if (cosH < -1){ daylight = 24; H0deg = 180; state = 'polar-day'; }
  else if (cosH > 1){ daylight = 0; H0deg = 0; state = 'polar-night'; }
  else {
    H0deg = Math.acos(cosH) * R2D;
    daylight = 2 * H0deg / 15;
    state = 'normal';
  }

  const noonLMT = 12 - s.eot / 60;                       // local mean solar time
  if (state === 'normal'){
    sunrise = noonLMT - daylight / 2;
    sunset  = noonLMT + daylight / 2;
  }

  // altitude of the Sun at solar noon (and at solar midnight, for polar day)
  const noonAlt = 90 - Math.abs(latDeg - s.dec);
  const midnightAlt = -(90 - Math.abs(-latDeg - s.dec));

  // instantaneous energy per m^2 at noon, relative to the Sun straight up
  const fluxNoon = noonAlt > 0 ? Math.sin(noonAlt * D2R) : 0;

  // daily mean insolation at the top of the atmosphere, kWh/m^2/day
  const H0 = H0deg * D2R;
  const distFactor = Math.pow(1 / s.r, 2);
  const q = (S0 / Math.PI) * distFactor *
            (H0 * sinPhi * sinDec + cosPhi * cosDec * Math.sin(H0));
  const insolation = Math.max(0, q) * 24 / 1000;         // kWh/m^2/day

  return {
    jd:jd, sun:s, daylight:daylight, H0:H0deg, state:state,
    sunrise:sunrise, sunset:sunset, noonLMT:noonLMT,
    noonAlt:noonAlt, midnightAlt:midnightAlt,
    fluxNoon:fluxNoon, insolation:insolation,
    distKm:s.r * AU_KM
  };
}

// Sun altitude/azimuth for an hour angle H (degrees, 0 = solar noon).
function altAz(latDeg, decDeg, Hdeg){
  const phi = latDeg * D2R, dec = decDeg * D2R, H = Hdeg * D2R;
  const sinAlt = Math.sin(phi) * Math.sin(dec) +
                 Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec),
                        Math.cos(phi) * Math.sin(dec) -
                        Math.sin(phi) * Math.cos(dec) * Math.cos(H));
  return { alt: alt * R2D, az: norm360(az * R2D) };     // az from true North, eastward
}

/* --------------------------------------- equinoxes, solstices, overhead dates */

/*  Find the instant in `year` when the Sun's ecliptic longitude equals
    `target` (0/90/180/270).  Scans day by day for a genuine ascending
    crossing — a wrap from +180 to -180 is rejected — then bisects.      */
function findLongitudeCrossing(year, target){
  const start = julianDay(year, 1, 1, 0);
  const end   = start + daysInYear(year) + 1;
  const f = jd => norm180(sunPosition(jd).lam - target);

  let prevJd = start, prevF = f(start);
  for (let jd = start + 1; jd <= end; jd += 1){
    const cur = f(jd);
    if (prevF < 0 && cur >= 0 && (cur - prevF) < 180){
      let lo = prevJd, hi = jd;
      for (let i = 0; i < 60; i++){
        const mid = (lo + hi) / 2;
        if (f(mid) < 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prevJd = jd; prevF = cur;
  }
  return null;
}

const EVENT_DEFS = [
  { lam:0,   key:'marEq', label:'March equinox',     short:'Mar equinox',  kind:'eq' },
  { lam:90,  key:'junSol', label:'June solstice',    short:'Jun solstice', kind:'so' },
  { lam:180, key:'sepEq',  label:'September equinox', short:'Sep equinox', kind:'eq' },
  { lam:270, key:'decSol', label:'December solstice', short:'Dec solstice',kind:'so' }
];

const _eventCache = {};
function yearEvents(year){
  if (_eventCache[year]) return _eventCache[year];
  const out = EVENT_DEFS.map(def => {
    const jd = findLongitudeCrossing(year, def.lam);
    return Object.assign({}, def, { jd: jd, date: jdToDate(jd) });
  });
  _eventCache[year] = out;
  return out;
}

/*  Dates when the Sun stands directly overhead at a latitude inside the
    tropics.  Returns 0, 1 or 2 dates.                                    */
function overheadDates(year, latDeg, lonDeg){
  const eps = sunPosition(julianDay(year, 7, 1, 0)).eps;
  const ratio = Math.sin(latDeg * D2R) / Math.sin(eps * D2R);
  if (Math.abs(ratio) > 1) return [];
  const l1 = norm360(Math.asin(clamp(ratio, -1, 1)) * R2D);
  const l2 = norm360(180 - l1);
  const targets = Math.abs(norm180(l1 - l2)) < 0.001 ? [l1] : [l1, l2];
  const shift = (lonDeg || 0) / 360;      // report the LOCAL calendar date
  return targets
    .map(t => findLongitudeCrossing(year, t))
    .filter(jd => jd !== null)
    .map(jd => jdToDate(jd + shift))
    .sort((a, b) => (a.month * 100 + a.day) - (b.month * 100 + b.day));
}

/* ------------------------------------------------------------- seasons */

const TROPIC = 23.4392911, POLAR = 90 - TROPIC;

const SEASON_COLOR = { Spring:'#6fd08c', Summer:'#ffb445', Autumn:'#ff8a5b', Winter:'#7fb8ff' };

/*  Astronomical season for a latitude at a given solar longitude, plus
    honest handling of the tropics, where axial tilt does not produce a
    hot/cold cycle worth calling "summer" or "winter".                   */
function seasonFor(lamDeg, latDeg){
  const north = latDeg >= 0;
  const q = Math.floor(norm360(lamDeg) / 90);            // 0..3
  const NORTH = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const SOUTH = ['Autumn', 'Winter', 'Spring', 'Summer'];
  const name = north ? NORTH[q] : SOUTH[q];

  const absLat = Math.abs(latDeg);
  let band, headline, note;

  if (absLat <= 10){
    band = 'equatorial';
    headline = 'No marked seasons';
    note = 'Within about 10° of the equator the Sun is high all year and day length barely ' +
           'changes, so there is no thermal summer or winter. What people track here is the ' +
           'wet and dry seasons, driven by the rain belt (ITCZ) sliding north and south — ' +
           'itself a consequence of the same sub-solar march you see on the globe.';
  } else if (absLat < TROPIC){
    band = 'tropical';
    headline = name;
    note = 'This is inside the tropics: the Sun still passes directly overhead twice a year, ' +
           'and the temperature swing between "' + name + '" and the opposite season is small. ' +
           'Wet and dry seasons usually matter more here than warm and cold.';
  } else if (absLat >= POLAR){
    band = 'polar';
    headline = name;
    note = 'Beyond the ' + (north ? 'Arctic' : 'Antarctic') + ' Circle the tilt is extreme ' +
           'enough that the Sun can stay up for a full 24 hours in summer and never rise at ' +
           'all in winter.';
  } else {
    band = 'temperate';
    headline = name;
    note = 'A mid-latitude place, where axial tilt produces the classic four-season cycle: ' +
           'long high-Sun days in summer, short low-Sun days in winter.';
  }
  // an equatorial place gets the tropics colour: calling it "summer orange"
  // would undercut the very point the label is making
  const color = band === 'equatorial' ? '#c79bff' : SEASON_COLOR[name];
  return { name:name, headline:headline, band:band, note:note,
           color:color, quarter:q, hemisphere: north ? 'Northern' : 'Southern' };
}

/*  Meteorological season — fixed three-month blocks. Shown for contrast. */
function meteorologicalSeason(month, latDeg){
  const NORTH = { 12:'Winter', 1:'Winter', 2:'Winter', 3:'Spring', 4:'Spring', 5:'Spring',
                  6:'Summer', 7:'Summer', 8:'Summer', 9:'Autumn', 10:'Autumn', 11:'Autumn' };
  const n = NORTH[month];
  if (latDeg >= 0) return n;
  return { Winter:'Summer', Spring:'Autumn', Summer:'Winter', Autumn:'Spring' }[n];
}

/* --------------------------------------------------------------- export */
window.Astro = {
  D2R:D2R, R2D:R2D, TAU:TAU, clamp:clamp, norm360:norm360, norm180:norm180,
  julianDay:julianDay, jdToDate:jdToDate, isLeap:isLeap, daysInYear:daysInYear,
  dayOfYear:dayOfYear, fromDayOfYear:fromDayOfYear,
  sunPosition:sunPosition, gmstDeg:gmstDeg, subsolarPoint:subsolarPoint,
  dayCircumstances:dayCircumstances, altAz:altAz,
  findLongitudeCrossing:findLongitudeCrossing, yearEvents:yearEvents,
  overheadDates:overheadDates, seasonFor:seasonFor,
  meteorologicalSeason:meteorologicalSeason,
  EVENT_DEFS:EVENT_DEFS, TROPIC:TROPIC, POLAR:POLAR, AU_KM:AU_KM, S0:S0
};
})();
</script>
