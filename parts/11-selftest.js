<script>
/* =====================================================================
   Self-test.  Runs once after boot and reports to the console.  It
   checks the astronomy against published values and the 3D scene
   geometry against the astronomy, so a silent regression in either one
   shows up immediately.
   ===================================================================== */
window.SeasonSelfTest = function(){
  const A = window.Astro;
  let pass = 0, fail = 0;
  const rows = [];
  function ok(cond, label, got){
    (cond ? pass++ : fail++);
    rows.push({ '': cond ? 'PASS' : 'FAIL', check: label, value: got == null ? '' : String(got) });
  }

  /* --- turning points land on the right calendar days --- */
  const want2026 = [[3,20],[6,21],[9,23],[12,21]];
  A.yearEvents(2026).forEach((e, i) => {
    const d = A.jdToDate(e.jd);
    ok(d.month === want2026[i][0] && Math.abs(d.day - want2026[i][1]) <= 1,
       '2026 ' + e.label,
       d.year + '-' + d.month + '-' + d.day + ' ' +
       String(Math.floor(d.hour)).padStart(2,'0') + ':' +
       String(Math.round((d.hour % 1) * 60)).padStart(2,'0') + ' UTC');
  });

  /* --- the sub-solar point reaches exactly the tropics --- */
  ok(Math.abs(A.subsolarPoint(A.julianDay(2026,6,21,12)).lat - A.TROPIC) < 0.1,
     'June solstice sub-solar latitude = Tropic of Cancer',
     A.subsolarPoint(A.julianDay(2026,6,21,12)).lat.toFixed(3) + '°');
  ok(Math.abs(A.subsolarPoint(A.julianDay(2026,12,21,12)).lat + A.TROPIC) < 0.1,
     'December solstice sub-solar latitude = Tropic of Capricorn',
     A.subsolarPoint(A.julianDay(2026,12,21,12)).lat.toFixed(3) + '°');

  /* --- daylight, hemispheres, poles --- */
  const eq = A.dayCircumstances(2026, 6, 21, 0, 0);
  ok(Math.abs(eq.daylight - 12.1) < 0.15, 'equator daylight stays ~12h at the solstice',
     eq.daylight.toFixed(2) + 'h');
  ok(A.dayCircumstances(2026,12,15,69.65,18.96).state === 'polar-night',
     'Tromso is in polar night on 15 Dec');
  ok(A.dayCircumstances(2026,6,21,69.65,18.96).state === 'polar-day',
     'Tromso has midnight sun on 21 Jun');

  const lamJan = A.sunPosition(A.julianDay(2026,1,15,12)).lam;
  ok(A.seasonFor(lamJan, 43.65).name === 'Winter', 'Toronto in January = Winter');
  ok(A.seasonFor(lamJan, -33.87).name === 'Summer', 'Sydney in January = Summer');
  ok(A.seasonFor(lamJan, 1.35).headline === 'No marked seasons',
     'Singapore is never labelled winter or summer');

  const lon = A.dayCircumstances(2026,6,21,51.51,-0.13).daylight;
  ok(Math.abs(lon - 16.63) < 0.3, 'London midsummer daylight', lon.toFixed(2) + 'h');

  /* --- perihelion falls in northern winter --- */
  let best = null;
  for (let n = 1; n <= 366; n++){
    const d = A.fromDayOfYear(2026, n);
    const r = A.sunPosition(A.julianDay(d.year, d.month, d.day, 12)).r;
    if (!best || r < best.r) best = { r:r, d:d };
  }
  ok(best.d.month === 1 && best.d.day <= 6, 'Earth is closest to the Sun in early January',
     best.d.day + ' Jan, ' + (best.r * A.AU_KM / 1e6).toFixed(2) + 'M km');

  /* --- scene geometry agrees with the astronomy ---
     The rendered sub-solar marker must actually face the Sun, and the
     drawn axis must be tilted by exactly the obliquity.               */
  try {
    const OV = window.OrbitView._internals;
    const sunDir = OV.earthMat.uniforms.sunDir.value.clone().normalize();

    const subPos = OV.subGroup.position.clone().normalize();
    const dot = subPos.dot(sunDir);
    ok(dot > 0.9995, 'rendered sub-solar marker points straight at the Sun',
       'cos = ' + dot.toFixed(6));

    const axis = new THREE.Vector3(0,1,0)
      .applyQuaternion(OV.earthMesh.quaternion).normalize();
    const tilt = Math.acos(Math.abs(axis.y)) * A.R2D;
    ok(Math.abs(tilt - A.TROPIC) < 0.02, 'rendered axis tilt equals the obliquity',
       tilt.toFixed(4) + '°');

    // the pin must sit at the right angular distance from the sub-solar point
    const pin = OV.cityGroup.userData.pin.position.clone().normalize();
    const zenithAngle = Math.acos(A.clamp(pin.dot(subPos), -1, 1)) * A.R2D;
    const city = OV.state.city;
    const dec = A.sunPosition(OV.state.jd).dec;
    const sub = A.subsolarPoint(OV.state.jd);
    const phi = city.lat * A.D2R, dl = (city.lon - sub.lon) * A.D2R, de = dec * A.D2R;
    const expected = Math.acos(A.clamp(
      Math.sin(phi)*Math.sin(de) + Math.cos(phi)*Math.cos(de)*Math.cos(dl), -1, 1)) * A.R2D;
    ok(Math.abs(zenithAngle - expected) < 0.05,
       'city pin sits at the correct angle from the sub-solar point',
       zenithAngle.toFixed(3) + '° vs ' + expected.toFixed(3) + '°');
  } catch (err){
    ok(false, 'scene geometry checks', String(err));
  }

  const style = fail ? 'color:#ff6b6b;font-weight:700' : 'color:#4ec98a;font-weight:700';
  console.log('%cSeasons simulator self-test: ' + pass + ' passed, ' + fail + ' failed',
              style);
  if (console.table) console.table(rows);
  else rows.forEach(r => console.log(r['']+ '  ' + r.check + '  ' + r.value));

  // also leave the result in the DOM, so an automated headless run can read it
  let out = document.getElementById('selftest-out');
  if (!out){
    out = document.createElement('div');
    out.id = 'selftest-out';
    out.hidden = true;
    document.body.appendChild(out);
  }
  out.textContent = 'SELFTEST ' + pass + ' passed, ' + fail + ' failed\n' +
    rows.map(r => r[''] + '  ' + r.check + (r.value ? '  [' + r.value + ']' : '')).join('\n');

  return { pass: pass, fail: fail };
};
</script>
