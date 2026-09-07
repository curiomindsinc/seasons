<script>
(function(){
'use strict';
const A = window.Astro;
const D2R = A.D2R;
const OV = window.__OV;                    // internals handed over from part 1

const { ORBIT_A, EARTH_R, SUN_R, RAY_LEN } = OV.consts;

/* --------------------------------------------------- orbit path + markers */

/*  Traced from the true-anomaly form of the ellipse, so the drawn path IS
    the orbit: eccentricity 0.0167, Sun at a focus.  It looks almost
    circular because it almost is — which is exactly the point when people
    assume seasons come from distance.                                     */
function rebuildOrbit(jd){
  const s = A.sunPosition(jd);
  const periEarth = A.norm360(s.lam - s.nu + 180);   // Earth's perihelion longitude
  const e = s.e, a = 1.000001018;
  const p = a * (1 - e*e);

  const pts = [];
  for (let i = 0; i <= 720; i++){
    const nu = i / 720 * 360;
    const r = p / (1 + e * Math.cos(nu * D2R));
    const L = (periEarth + nu) * D2R;
    pts.push(OV.eclToScene(r*Math.cos(L), r*Math.sin(L), 0).multiplyScalar(ORBIT_A));
  }
  OV.orbitLine.geometry.dispose();
  OV.orbitLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);

  // where Earth sits at each of the four turning points
  while (OV.markerGroup.children.length) OV.markerGroup.remove(OV.markerGroup.children[0]);
  const MARKS = [
    { lamSun:0,   text:'March equinox',     color:'#6fd08c' },
    { lamSun:90,  text:'June solstice',     color:'#ffb445' },
    { lamSun:180, text:'September equinox', color:'#6fd08c' },
    { lamSun:270, text:'December solstice', color:'#7fb8ff' }
  ];
  for (const m of MARKS){
    const nu = A.norm360(m.lamSun + 180 - periEarth);
    const r = p / (1 + e * Math.cos(nu * D2R));
    const L = (periEarth + nu) * D2R;
    const P = OV.eclToScene(r*Math.cos(L), r*Math.sin(L), 0).multiplyScalar(ORBIT_A);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(m.color) })
    );
    dot.position.copy(P);
    OV.markerGroup.add(dot);

    const lb = OV.makeLabel(m.text, m.color);
    lb.position.copy(P).multiplyScalar(1.13);
    lb.position.y += 9;
    OV.markerGroup.add(lb);
  }

  /*  Perihelion and aphelion sit only ~13 days from the solstices, so the
      labels are pushed apart along the one axis the solstice labels do not
      use — perpendicular to the orbit plane — which also keeps them legible
      in the edge-on view, where everything else collapses onto a line.   */
  for (const [nu0, txt, col, dy] of [[0,   'Perihelion — closest', '#ff9f6b', -19],
                                     [180, 'Aphelion — farthest',  '#8fb6d8',  19]]){
    const r = p / (1 + e * Math.cos(nu0 * D2R));
    const L = (periEarth + nu0) * D2R;
    const P = OV.eclToScene(r*Math.cos(L), r*Math.sin(L), 0).multiplyScalar(ORBIT_A);
    const lb = OV.makeLabel(txt, col);
    lb.position.copy(P).multiplyScalar(0.88);
    lb.position.y += dy;
    OV.markerGroup.add(lb);

    const tick = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        P.clone(), P.clone().multiplyScalar(0.88).setY(dy * 0.75)
      ]),
      new THREE.LineBasicMaterial({ color: new THREE.Color(col), transparent:true, opacity:0.35 })
    );
    OV.markerGroup.add(tick);
  }
}

/* ------------------------------------------------------------- per-frame */

const _e1 = new THREE.Vector3(1, 0, 0);
const _e2 = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _cx = new THREE.Vector3(), _cy = new THREE.Vector3(), _cz = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _tmp = new THREE.Vector3();

/*  Unit vector, in world space, of the surface point at (lat, lon). */
function surfaceDir(latDeg, lonDeg, gmstDeg, out){
  const ang = (gmstDeg + lonDeg) * D2R, la = latDeg * D2R;
  out.set(0,0,0)
     .addScaledVector(_e1, Math.cos(la) * Math.cos(ang))
     .addScaledVector(_e2, Math.cos(la) * Math.sin(ang))
     .addScaledVector(_axis, Math.sin(la));
  return out;
}

function applyDate(jd){
  const s   = A.sunPosition(jd);
  const eps = s.eps * D2R;
  const G   = A.gmstDeg(jd);

  // Earth's position: heliocentric longitude is the Sun's plus 180
  const L = (s.lam + 180) * D2R;
  const pos = OV.eclToScene(s.r*Math.cos(L), s.r*Math.sin(L), 0).multiplyScalar(ORBIT_A);
  OV.earthGroup.position.copy(pos);

  // axis fixed in space; e2 completes a right-handed equatorial basis
  _axis.set(0, Math.cos(eps), -Math.sin(eps)).normalize();
  _e2.copy(_axis).cross(_e1).normalize();

  const g = G * D2R, cg = Math.cos(g), sg = Math.sin(g);
  _cx.set(0,0,0).addScaledVector(_e1, cg).addScaledVector(_e2, sg);
  _cy.copy(_axis);
  _cz.set(0,0,0).addScaledVector(_e1, sg).addScaledVector(_e2, -cg);
  _m.makeBasis(_cx, _cy, _cz);
  OV.earthMesh.quaternion.setFromRotationMatrix(_m);

  // direction Earth -> Sun
  const sunDir = _tmp.copy(pos).multiplyScalar(-1).normalize();
  OV.earthMat.uniforms.sunDir.value.copy(sunDir);

  // city pin
  const cd = surfaceDir(OV.state.city.lat, OV.state.city.lon, G, new THREE.Vector3());
  OV.cityGroup.userData.pin.position.copy(cd).multiplyScalar(EARTH_R * 1.02);
  OV.cityGroup.userData.pin.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), cd);

  // sub-solar point
  const sub = A.subsolarPoint(jd);
  const sd = surfaceDir(sub.lat, sub.lon, G, new THREE.Vector3());
  OV.subGroup.position.copy(sd).multiplyScalar(EARTH_R * 1.006);
  OV.subGroup.userData.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), sd);

  // Sun-Earth line
  const lp = OV.sunLine.geometry.attributes.position;
  lp.setXYZ(0, 0, 0, 0);
  lp.setXYZ(1, pos.x, pos.y, pos.z);
  lp.needsUpdate = true;

  /*  Parallel sunlight: segments along the Sun->Earth direction, each one
      stopping exactly where it meets the globe.  Parallel rays striking a
      tilted sphere is the whole mechanism in one picture.               */
  const dir = _tmp.copy(pos).normalize();          // Sun -> Earth
  const up  = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(0,1,0);
  const ux  = new THREE.Vector3().crossVectors(up, dir).normalize();
  const uy  = new THREE.Vector3().crossVectors(dir, ux).normalize();

  const kids = OV.rayGroup.children;
  let k = 0;
  // kept short and sparse: these should read as parallel light arriving,
  // not as a searchlight beam aimed at the planet
  const RINGS = [[0,1],[0.46,6],[0.80,10]];
  for (const [frac, count] of RINGS){
    for (let i = 0; i < count && k < kids.length; i++, k++){
      const ang = (i / count) * Math.PI * 2 + frac * 1.7;
      const rr = frac * EARTH_R * 0.99;
      const off = new THREE.Vector3()
        .addScaledVector(ux, Math.cos(ang) * rr)
        .addScaledVector(uy, Math.sin(ang) * rr);
      const back = Math.sqrt(Math.max(0, EARTH_R*EARTH_R - rr*rr));
      const end = new THREE.Vector3().copy(pos).add(off).addScaledVector(dir, -back);
      const st  = new THREE.Vector3().copy(end).addScaledVector(dir, -RAY_LEN);
      const p = kids[k].geometry.attributes.position;
      p.setXYZ(0, st.x, st.y, st.z);
      p.setXYZ(1, end.x, end.y, end.z);
      p.needsUpdate = true;
      kids[k].visible = true;
    }
  }
  for (; k < kids.length; k++) kids[k].visible = false;

  return { sun:s, pos:pos, gmst:G, sub:sub };
}

/* ----------------------------------------------------------- camera rig */

const CAMS = {
  side:  { r: 300, phi: 1.50, theta: 0.55, follow:false },   // near the orbit plane
  top:   { r: 330, phi: 0.10, theta: 0.00, follow:false },   // straight down
  three: { r: 300, phi: 1.02, theta: 0.90, follow:false },
  earth: { r: 30,  phi: 1.15, theta: 0.70, follow:true, sunLock:true }
};
let camMode = 'three';

/*  At globe zoom the camera is held relative to the SUN, not to fixed
    space.  Otherwise scrubbing through the year swings the viewer round
    to the night side and the terminator — the thing worth looking at —
    disappears.  Dragging changes the offset from the Sun rather than an
    absolute bearing, so the user keeps full control.                   */
let sunOffset = 0.62;

function sunTheta(){
  const p = OV.earthGroup.position;
  return Math.atan2(-p.x, -p.z);          // bearing of Earth -> Sun
}

function setCamera(mode){
  const c = CAMS[mode]; if (!c) return;
  camMode = mode;
  OV.rig.rTo = c.r; OV.rig.phiTo = c.phi;
  if (c.sunLock){ sunOffset = 0.62; OV.rig.thetaTo = sunTheta() + sunOffset; }
  else OV.rig.thetaTo = c.theta;
}

function updateRig(dt){
  const rg = OV.rig, k = 1 - Math.pow(0.0016, dt);
  const cam = CAMS[camMode] || CAMS.three;
  rg.targetTo.copy(cam.follow ? OV.earthGroup.position : OV.ZERO);
  rg.target.lerp(rg.targetTo, k);

  if (cam.sunLock){
    // keep the shortest path as the Sun bearing wraps through +/-pi
    const want = sunTheta() + sunOffset;
    rg.thetaTo = rg.theta + Math.atan2(Math.sin(want - rg.theta),
                                       Math.cos(want - rg.theta));
  }

  rg.r     += (rg.rTo - rg.r) * k;
  rg.theta += (rg.thetaTo - rg.theta) * k;
  rg.phi   += (rg.phiTo - rg.phi) * k;

  const sp = Math.sin(rg.phi);
  OV.camera.position.set(
    rg.target.x + rg.r * sp * Math.sin(rg.theta),
    rg.target.y + rg.r * Math.cos(rg.phi),
    rg.target.z + rg.r * sp * Math.cos(rg.theta)
  );
  OV.camera.lookAt(rg.target);
}

/* ------------------------------------------------------- mouse / touch */

function attachControls(canvas){
  const rg = OV.rig;
  let dragging = false, panning = false, lx = 0, ly = 0;

  const down = ev => {
    dragging = true;
    panning = (ev.button === 2 || ev.shiftKey);
    lx = ev.clientX; ly = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  };
  const move = ev => {
    if (!dragging) return;
    const dx = ev.clientX - lx, dy = ev.clientY - ly;
    lx = ev.clientX; ly = ev.clientY;
    if (panning){
      const s = rg.r * 0.0022;
      const right = new THREE.Vector3().setFromMatrixColumn(OV.camera.matrix, 0);
      const up    = new THREE.Vector3().setFromMatrixColumn(OV.camera.matrix, 1);
      rg.targetTo.addScaledVector(right, -dx*s).addScaledVector(up, dy*s);
      rg.target.copy(rg.targetTo);
      camMode = 'free';
      CAMS.free = { r: rg.rTo, phi: rg.phiTo, theta: rg.thetaTo, follow:false };
    } else {
      const cam = CAMS[camMode] || CAMS.three;
      if (cam.sunLock) sunOffset -= dx * 0.0055;   // spin relative to the Sun
      else rg.thetaTo -= dx * 0.0055;
      rg.phiTo = Math.max(0.045, Math.min(Math.PI - 0.045, rg.phiTo - dy * 0.0055));
    }
  };
  const up = ev => {
    dragging = false;
    try { canvas.releasePointerCapture(ev.pointerId); } catch(e){}
  };

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', ev => {
    ev.preventDefault();
    rg.rTo = Math.max(EARTH_R*1.9, Math.min(1400, rg.rTo * Math.pow(1.0016, ev.deltaY)));
  }, { passive:false });

  // pinch to zoom
  let pinch0 = null;
  canvas.addEventListener('touchstart', ev => {
    if (ev.touches.length === 2){
      pinch0 = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX,
                          ev.touches[0].clientY - ev.touches[1].clientY);
    }
  }, { passive:true });
  canvas.addEventListener('touchmove', ev => {
    if (ev.touches.length === 2 && pinch0){
      const d = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX,
                           ev.touches[0].clientY - ev.touches[1].clientY);
      rg.rTo = Math.max(EARTH_R*1.9, Math.min(1400, rg.rTo * (pinch0 / Math.max(1,d))));
      pinch0 = d;
    }
  }, { passive:true });
  canvas.addEventListener('touchend', () => { pinch0 = null; }, { passive:true });
}

window.__OV2 = { rebuildOrbit, applyDate, setCamera, updateRig, attachControls,
                 getCamMode: () => camMode };
})();
</script>
