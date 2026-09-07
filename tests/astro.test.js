/*  Astronomy checks for season.html.
 *  Pulls the Astro engine straight out of the published page, so there is
 *  no second copy to drift.   Run:  node tests/astro.test.js
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'season.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]);
const src = blocks.find(b => b.indexOf('window.Astro') >= 0);
if (!src) throw new Error('could not find the Astro block in season.html');
const win = {};
new Function('window', src)(win);
const A = win.Astro;

let fails = 0;
function ok(cond, label, extra){
  if (cond) console.log('  PASS  ' + label + (extra ? '   ' + extra : ''));
  else { fails++; console.log('  FAIL  ' + label + (extra ? '   ' + extra : '')); }
}
function fmt(d){
  const p = n => String(n).padStart(2, '0');
  const h = Math.floor(d.hour), m = Math.round((d.hour - h) * 60);
  return d.year + '-' + p(d.month) + '-' + p(d.day) + ' ' + p(h) + ':' + p(m) + 'Z';
}

console.log('\n== equinox / solstice instants (published UTC in brackets) ==');
const known = {
  2026: ['2026-03-20 14:46','2026-06-21 08:24','2026-09-23 00:05','2026-12-21 20:50'],
  2025: ['2025-03-20 09:01','2025-06-21 02:42','2025-09-22 18:19','2025-12-21 15:03'],
  2000: ['2000-03-20 07:35','2000-06-21 01:48','2000-09-22 17:27','2000-12-21 13:37']
};
for (const y of [2000, 2025, 2026]){
  A.yearEvents(y).forEach((e, i) => {
    const want = known[y][i];
    const w = want.match(/(\d+)-(\d+)-(\d+) (\d+):(\d+)/);
    const wantJd = A.julianDay(+w[1], +w[2], +w[3], +w[4] + w[5] / 60);
    const diffMin = (e.jd - wantJd) * 1440;
    ok(Math.abs(diffMin) < 15, y + ' ' + e.label.padEnd(20) + fmt(e.date),
       '[' + want + 'Z]  delta=' + diffMin.toFixed(1) + ' min');
  });
}

console.log('\n== Kepler solver ==');
{
  let maxC = 0, maxRes = 0;
  for (let k = 0; k < 4000; k++){
    const s = A.sunPosition(2451545 + k * 20);
    const M = s.M * A.D2R, e = s.e;
    const Cser = (2*e - e*e*e/4) * Math.sin(M)
               + (5/4)*e*e * Math.sin(2*M)
               + (13/12)*e*e*e * Math.sin(3*M);
    maxC = Math.max(maxC, Math.abs(A.norm180(s.nu - s.M) * A.D2R - Cser) * A.R2D);
    const E = 2 * Math.atan(Math.sqrt((1-e)/(1+e)) * Math.tan(s.nu * A.D2R / 2));
    maxRes = Math.max(maxRes, Math.abs(A.norm180((E - e*Math.sin(E)) * A.R2D - s.M)));
  }
  ok(maxC * 3600 < 1.0, 'equation of centre matches its e-series',
     'max delta = ' + (maxC * 3600).toFixed(3) + ' arcsec over 1900-2200');
  ok(maxRes * 3600 < 0.01, 'E - e*sin(E) = M holds for the returned true anomaly',
     'max residual = ' + (maxRes * 3600).toFixed(5) + ' arcsec');
}

console.log('\n== sub-solar point ==');
{
  const sp = A.subsolarPoint(A.julianDay(2026, 3, 20, 12));
  ok(Math.abs(sp.lat) < 0.5, 'March equinox noon: sub-solar lat ~0', sp.lat.toFixed(3));
  ok(Math.abs(sp.lon) < 5, '12:00 UTC: sub-solar lon near Greenwich', sp.lon.toFixed(2));
  const j = A.julianDay(2026, 6, 21, 12), j2 = A.julianDay(2026, 12, 21, 12);
  ok(Math.abs(A.subsolarPoint(j).lat - 23.44) < 0.06,
     'June solstice sub-solar lat = +23.44', A.subsolarPoint(j).lat.toFixed(3));
  ok(Math.abs(A.subsolarPoint(j2).lat + 23.44) < 0.06,
     'December solstice sub-solar lat = -23.44', A.subsolarPoint(j2).lat.toFixed(3));
  const s = A.sunPosition(A.julianDay(2026, 11, 3, 12));
  const sp2 = A.subsolarPoint(A.julianDay(2026, 11, 3, 12));
  ok(Math.abs(sp2.lon - (-s.eot / 4)) < 0.2, 'sub-solar lon equals -EoT/4 at 12:00 UTC',
     sp2.lon.toFixed(3) + ' vs ' + (-s.eot / 4).toFixed(3));
}

console.log('\n== daylight ==');
{
  let mn = 99, mx = 0;
  for (let m = 1; m <= 12; m++){
    const c = A.dayCircumstances(2026, m, 15, 0, 0);
    mn = Math.min(mn, c.daylight); mx = Math.max(mx, c.daylight);
  }
  ok(mn > 12.0 && mx < 12.2, 'equator stays near 12h all year',
     mn.toFixed(3) + 'h .. ' + mx.toFixed(3) + 'h');

  const cases = [
    ['London    21 Jun', 51.51,   -0.13,  6, 21, 16.63, 0.35],
    ['London    21 Dec', 51.51,   -0.13, 12, 21,  7.87, 0.35],
    ['Anchorage 21 Dec', 61.22, -149.90, 12, 21,  5.45, 0.40],
    ['Anchorage 21 Jun', 61.22, -149.90,  6, 21, 19.35, 0.40],
    ['Quito     15 Mar', -0.18,  -78.47,  3, 15, 12.10, 0.20],
    ['Sydney    21 Dec',-33.87,  151.21, 12, 21, 14.42, 0.25]
  ];
  for (const c of cases){
    const r = A.dayCircumstances(2026, c[3], c[4], c[1], c[2]);
    ok(Math.abs(r.daylight - c[5]) < c[6], c[0],
       r.daylight.toFixed(2) + 'h (expect ~' + c[5] + 'h)');
  }
}

console.log('\n== polar day / night ==');
{
  ok(A.dayCircumstances(2026, 12, 15, 69.65, 18.96).state === 'polar-night',
     'Tromso 15 Dec = polar night');
  ok(A.dayCircumstances(2026, 6, 21, 69.65, 18.96).state === 'polar-day',
     'Tromso 21 Jun = midnight sun');
  ok(A.dayCircumstances(2026, 12, 21, -77.85, 166.67).state === 'polar-day',
     'McMurdo 21 Dec = midnight sun');
}

console.log('\n== seasons ==');
{
  const lam = A.sunPosition(A.julianDay(2026, 1, 15, 12)).lam;
  ok(A.seasonFor(lam, 43.65).name === 'Winter', 'Toronto 15 Jan = Winter');
  ok(A.seasonFor(lam, -33.87).name === 'Summer', 'Sydney 15 Jan = Summer');
  ok(A.seasonFor(lam, 1.35).headline === 'No marked seasons',
     'Singapore is never labelled winter or summer');
  const lam2 = A.sunPosition(A.julianDay(2026, 7, 15, 12)).lam;
  ok(A.seasonFor(lam2, 43.65).name === 'Summer', 'Toronto 15 Jul = Summer');
  ok(A.seasonFor(lam2, -33.87).name === 'Winter', 'Sydney 15 Jul = Winter');
  ok(A.meteorologicalSeason(1, 45) === 'Winter' &&
     A.meteorologicalSeason(1, -45) === 'Summer', 'meteorological seasons flip by hemisphere');
}

console.log('\n== noon altitude and overhead dates ==');
{
  const c = A.dayCircumstances(2026, 6, 21, 23.4392911, 0);
  ok(Math.abs(c.noonAlt - 90) < 0.1, 'Tropic of Cancer at June solstice: Sun overhead',
     c.noonAlt.toFixed(3));
  ok(Math.abs(A.dayCircumstances(2026, 3, 20, 51.51, -0.13).noonAlt - 38.5) < 0.6,
     'London equinox noon altitude = 90 - lat');
  // Bishop Museum "Lahaina Noon" for Honolulu: about 26 May and 15-16 July
  const hono = A.overheadDates(2026, 21.3069, -157.86);
  const hs = hono.map(d => d.month + '/' + d.day).join(' and ');
  ok(hono.length === 2 && hono[0].month === 5 && Math.abs(hono[0].day - 26) <= 1 &&
     hono[1].month === 7 && Math.abs(hono[1].day - 16) <= 1,
     'Honolulu overhead dates match the published pair', hs);
  ok(A.overheadDates(2026, 45, 0).length === 0, 'no overhead date at 45N');
  const eq = A.overheadDates(2026, 0, 0);
  ok(eq.length === 2 && eq[0].month === 3 && eq[1].month === 9,
     'equator overhead dates are the two equinoxes',
     eq.map(d => d.month + '/' + d.day).join(' and '));
}

console.log('\n== the misconception, stated numerically ==');
{
  let best = null;
  for (let n = 1; n <= 366; n++){
    const d = A.fromDayOfYear(2026, n);
    const r = A.sunPosition(A.julianDay(d.year, d.month, d.day, 12)).r;
    if (!best || r < best.r) best = { r: r, d: d };
  }
  ok(best.d.month === 1 && best.d.day <= 6, 'Earth is closest to the Sun in early January',
     best.d.day + ' Jan, ' + (best.r * A.AU_KM / 1e6).toFixed(2) + 'M km');
  const jan = A.dayCircumstances(2026, 1, 3, 43.65, -79.38);
  ok(A.seasonFor(jan.sun.lam, 43.65).name === 'Winter',
     '...yet Toronto is in Winter then');
  const junN = A.dayCircumstances(2026, 6, 21, 45, 0).insolation;
  const decN = A.dayCircumstances(2026, 12, 21, 45, 0).insolation;
  ok(junN > 3 * decN, '45N: June insolation far exceeds December',
     junN.toFixed(2) + ' vs ' + decN.toFixed(2) + ' kWh/m2/day');
  ok(A.dayCircumstances(2026, 6, 21, 89.9, 0).insolation >
     A.dayCircumstances(2026, 6, 21, 0, 0).insolation,
     'North Pole beats the equator at June solstice (24h Sun)');
}

console.log('\n== calendar and horizon frame ==');
{
  let bad = 0;
  for (const y of [1999, 2000, 2024, 2026, 2100]){
    for (let n = 1; n <= A.daysInYear(y); n++){
      const d = A.fromDayOfYear(y, n);
      if (A.dayOfYear(d.year, d.month, d.day) !== n || d.year !== y) bad++;
    }
  }
  ok(bad === 0, 'dayOfYear and fromDayOfYear round-trip', bad + ' mismatches');
  ok(Math.abs(A.altAz(45, 10, 0).az - 180) < 1e-6, 'noon Sun is due South at 45N');
  const s = A.altAz(-45, -10, 0).az;
  ok(Math.abs(s) < 1e-6 || Math.abs(s - 360) < 1e-6, 'noon Sun is due North at 45S');
  const e = A.altAz(45, 0, -90).az;
  ok(e > 45 && e < 135, 'morning Sun is in the East half', 'az=' + e.toFixed(1));

  let nonFinite = 0;
  for (const [la, lo] of [[89.99,0],[-89.99,0],[0,0],[66.56,25],[-77.85,166.67]]){
    for (const [m, d] of [[6,21],[12,21],[3,20],[9,23]]){
      const c = A.dayCircumstances(2026, m, d, la, lo);
      if (!isFinite(c.daylight) || !isFinite(c.noonAlt) || !isFinite(c.insolation)) nonFinite++;
    }
  }
  ok(nonFinite === 0, 'extreme latitudes stay finite', nonFinite + ' bad values');
}

console.log('\n' + (fails ? '*** ' + fails + ' FAILURES ***' : 'ALL CHECKS PASSED') + '\n');
process.exit(fails ? 1 : 0);
