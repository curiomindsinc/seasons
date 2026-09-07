<script>
/* =====================================================================
   Sky dome — the Sun's path across the sky as seen from the chosen city.

   Horizon frame used here: +x East, +y up, -z North.  Azimuth from
   altAz() is measured from true North going East, so
       x = cos(alt) * sin(az)
       z = -cos(alt) * cos(az)
       y = sin(alt)
   Ghost arcs for the two solstices and the equinox are drawn behind the
   current date's arc: the whole seasonal story is the gap between them.
   ===================================================================== */
(function(){
'use strict';
const A = window.Astro;
const D2R = A.D2R;

const R = 100;                            // dome radius
let renderer, scene, camera, canvas;
let arcCur, arcJun, arcDec, arcEq, sunBead, noonStick, riseDot, setDot;
let labels = [];
let running = false;
let yaw = 0, yawTo = 0, pitch = 0.30, pitchTo = 0.30;

function dir(alt, az, rad){
  const a = alt * D2R, z = az * D2R;
  return new THREE.Vector3(
    Math.cos(a) * Math.sin(z) * rad,
    Math.sin(a) * rad,
    -Math.cos(a) * Math.cos(z) * rad
  );
}

function label(text, color, px){
  const fs = 30, pad = 6, font = '600 ' + fs + 'px system-ui, Segoe UI, Roboto, sans-serif';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const c = document.createElement('canvas');
  c.width = Math.ceil(probe.measureText(text).width) + pad*2;
  c.height = fs + pad*2;
  const g = c.getContext('2d');
  g.font = font; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, pad, c.height/2 + 1);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent:true, depthTest:false, depthWrite:false
  }));
  spr.userData.aspect = c.width / c.height;
  spr.userData.px = px || 15;
  labels.push(spr);
  return spr;
}

function emptyLine(color, opacity, width){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  return new THREE.Line(g, new THREE.LineBasicMaterial({
    color: color, transparent:true, opacity: opacity, linewidth: width || 1
  }));
}

/*  Sample the Sun's track for a given declination.  Returns the points
    above (or just below) the horizon, plus the noon and rise/set data.  */
function trackPoints(latDeg, decDeg, rad){
  const pts = [];
  for (let H = -180; H <= 180; H += 1.5){
    const p = A.altAz(latDeg, decDeg, H);
    if (p.alt >= -1.2) pts.push(dir(p.alt, p.az, rad));
  }
  return pts;
}

function setLine(line, pts){
  if (!pts.length){
    line.visible = false;
    return;
  }
  line.visible = true;
  const arr = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++){
    arr[i*3] = pts[i].x; arr[i*3+1] = pts[i].y; arr[i*3+2] = pts[i].z;
  }
  line.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  line.geometry = g;
}

function build(cv){
  canvas = cv;
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias:true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b14);
  camera = new THREE.PerspectiveCamera(38, 1, 0.5, 3000);

  /* ground */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(R, 96),
    new THREE.MeshBasicMaterial({ color: 0x0d1526, transparent:true, opacity:0.95 })
  );
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -0.15;
  scene.add(ground);

  /* horizon ring */
  const hp = [];
  for (let i = 0; i <= 160; i++){
    const t = i/160 * Math.PI*2;
    hp.push(new THREE.Vector3(Math.cos(t)*R, 0, Math.sin(t)*R));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hp),
    new THREE.LineBasicMaterial({ color: 0x3d4c68 })));

  /* altitude rings at 30 and 60 degrees, and the meridian */
  for (const alt of [30, 60]){
    const p = [];
    for (let az = 0; az <= 360; az += 4) p.push(dir(alt, az, R));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),
      new THREE.LineBasicMaterial({ color: 0x223049, transparent:true, opacity:0.85 })));
  }
  /*  Meridians every 45 degrees, all meeting at the zenith.  Without them
      the altitude rings read as flat stacked ovals instead of a dome.  */
  for (let az = 0; az < 360; az += 45){
    const p = [];
    for (let alt = 0; alt <= 90; alt += 3) p.push(dir(alt, az, R));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),
      new THREE.LineBasicMaterial({
        color: az % 90 === 0 ? 0x2b3a56 : 0x1d2942, transparent:true, opacity:0.9 })));
  }

  /* cardinal points */
  const CARD = [['N',0],['E',90],['S',180],['W',270]];
  for (const [t, az] of CARD){
    const s = label(t, t === 'N' ? '#8fb6d8' : '#5c6c88', 16);
    s.position.copy(dir(3, az, R*1.02));
    scene.add(s);
  }
  for (const [t, alt] of [['30°',30],['60°',60]]){
    const s = label(t, '#3d4c68', 12);
    s.position.copy(dir(alt, 180, R*1.0));
    scene.add(s);
  }

  /* arcs, drawn back to front */
  arcJun = emptyLine(0xffd9a6, 0.42); scene.add(arcJun);
  arcDec = emptyLine(0x7fb8ff, 0.42); scene.add(arcDec);
  arcEq  = emptyLine(0x6fd08c, 0.40); scene.add(arcEq);
  arcCur = emptyLine(0xffb445, 1.0);  scene.add(arcCur);

  noonStick = emptyLine(0xffb445, 0.45); scene.add(noonStick);

  sunBead = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffd07a }));
  scene.add(sunBead);

  const dotMat = () => new THREE.MeshBasicMaterial({ color: 0xffb445, transparent:true, opacity:0.9 });
  riseDot = new THREE.Mesh(new THREE.SphereGeometry(1.9, 14, 10), dotMat());
  setDot  = new THREE.Mesh(new THREE.SphereGeometry(1.9, 14, 10), dotMat());
  scene.add(riseDot); scene.add(setDot);

  /* drag to look around */
  let dragging = false, lx = 0, ly = 0;
  cv.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY;
    cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!dragging) return;
    yawTo   -= (e.clientX - lx) * 0.006;
    pitchTo = Math.max(0.05, Math.min(1.45, pitchTo + (e.clientY - ly) * 0.005));
    lx = e.clientX; ly = e.clientY;
  });
  const up = e => { dragging = false; try { cv.releasePointerCapture(e.pointerId); } catch(err){} };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
}

/*  Update for a place and date.  Returns the numbers the panel shows. */
function update(lat, lon, year, month, day){
  const cur = A.dayCircumstances(year, month, day, lat, lon);
  const dec = cur.sun.dec;

  const ev = A.yearEvents(year);
  const decJun = A.sunPosition(ev[1].jd).dec;
  const decDec = A.sunPosition(ev[3].jd).dec;

  setLine(arcCur, trackPoints(lat, dec, R));
  setLine(arcJun, trackPoints(lat, decJun, R * 0.995));
  setLine(arcDec, trackPoints(lat, decDec, R * 0.995));
  setLine(arcEq,  trackPoints(lat, 0, R * 0.995));

  const noon = A.altAz(lat, dec, 0);
  const visible = noon.alt > -1.2;
  sunBead.visible = visible;
  noonStick.visible = visible;
  if (visible){
    const p = dir(noon.alt, noon.az, R);
    sunBead.position.copy(p);
    setLine(noonStick, [dir(0, noon.az, R), p]);
  }

  let riseAz = null, setAz = null;
  if (cur.state === 'normal'){
    riseAz = A.altAz(lat, dec, -cur.H0).az;
    setAz  = A.altAz(lat, dec,  cur.H0).az;
    riseDot.visible = setDot.visible = true;
    riseDot.position.copy(dir(0, riseAz, R));
    setDot.position.copy(dir(0, setAz, R));
  } else {
    riseDot.visible = setDot.visible = false;
  }

  /*  Extremes of the noon altitude over a year, in closed form.
      Noon altitude is 90 - |lat - dec| and dec sweeps [-eps, +eps], so
      inside the tropics the Sun reaches the zenith and outside them the
      best it manages is 90 - (|lat| - eps).                            */
  const eps = cur.sun.eps, absLat = Math.abs(lat);
  const maxAlt = absLat <= eps ? 90 : 90 - (absLat - eps);
  const minAlt = 90 - (absLat + eps);

  return { cur:cur, riseAz:riseAz, setAz:setAz, noonAlt:noon.alt,
           maxNoonAlt:maxAlt, minNoonAlt:minAlt };
}

function frame(){
  if (!running) return;
  requestAnimationFrame(frame);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;

  const pr = renderer.getPixelRatio();
  if (canvas.width !== Math.floor(w*pr) || canvas.height !== Math.floor(h*pr)){
    renderer.setSize(w, h, false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
  }

  yaw += (yawTo - yaw) * 0.12;
  pitch += (pitchTo - pitch) * 0.12;

  /*  Pull back far enough that the dome fits the NARROWER of the two
      field-of-view angles.  The panel is tall and thin, so fitting only
      the vertical fov would push the horizon off both sides.          */
  const vfov = camera.fov * D2R;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const d = (R * 1.16) / Math.tan(Math.min(vfov, hfov) / 2);
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * d,
    Math.sin(pitch) * d,
    Math.cos(yaw) * Math.cos(pitch) * d
  );
  camera.lookAt(0, R * 0.16, 0);

  const k = 2 * Math.tan(camera.fov/2 * D2R) / h;
  for (const s of labels){
    const dist = s.position.distanceTo(camera.position);
    const sz = dist * k * s.userData.px;
    s.scale.set(sz * s.userData.aspect, sz, 1);
  }

  renderer.render(scene, camera);
}

window.SkyView = {
  init(cv){ build(cv); running = true; requestAnimationFrame(frame); },
  update: update,
  resetView(){ yawTo = 0; pitchTo = 0.30; }
};
})();
</script>
