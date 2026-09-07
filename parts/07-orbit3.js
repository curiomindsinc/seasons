<script>
(function(){
'use strict';
const OV  = window.__OV;
const OV2 = window.__OV2;
const D2R = window.Astro.D2R;

const TEX_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/';
const TEX_DAY   = TEX_BASE + 'earth_atmos_2048.jpg';
const TEX_NIGHT = TEX_BASE + 'earth_lights_2048.png';
const TEX_TIMEOUT = 12000;

let running = false, lastT = 0, dirty = true;
let onFrame = null;                       // app callback, gets the frame's astro data

/*  Load both maps, but never let a slow or blocked CDN stop the sim:
    after TEX_TIMEOUT (or on any error) we fall back to a generated globe
    and carry on.  The geometry lesson does not depend on the imagery.  */
function loadTextures(){
  return new Promise(resolve => {
    let settled = false;
    const finish = ok => { if (!settled){ settled = true; resolve(ok); } };
    const timer = setTimeout(() => finish(false), TEX_TIMEOUT);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    let day = null, night = null, failed = false;

    const check = () => {
      if (failed){ clearTimeout(timer); finish(false); return; }
      if (day && night){
        clearTimeout(timer);
        OV.earthMat.uniforms.dayMap.value = day;
        OV.earthMat.uniforms.nightMap.value = night;
        finish(true);
      }
    };
    const fail = () => { failed = true; check(); };

    loader.load(TEX_DAY,   t => { day = t;   check(); }, undefined, fail);
    loader.load(TEX_NIGHT, t => { night = t; check(); }, undefined, fail);
  });
}

function useFallbackTextures(){
  OV.earthMat.uniforms.dayMap.value   = OV.proceduralEarth(false);
  OV.earthMat.uniforms.nightMap.value = OV.proceduralEarth(true);
}

function resize(){
  const c = OV.canvas;
  const w = c.clientWidth || 1, h = c.clientHeight || 1;
  if (c.width !== Math.floor(w * OV.renderer.getPixelRatio()) ||
      c.height !== Math.floor(h * OV.renderer.getPixelRatio())){
    OV.renderer.setSize(w, h, false);
    OV.camera.aspect = w / h;
    OV.camera.updateProjectionMatrix();
  }
}

/*  Sprites keep a constant on-screen height, so labels stay legible from
    a whole-orbit view and from two Earth-radii away alike.              */
const TARGET_PX = 17;
function scaleLabels(){
  const h = OV.canvas.clientHeight || 1;
  const k = 2 * Math.tan(OV.camera.fov / 2 * D2R) * TARGET_PX / h;
  const cam = OV.camera.position;
  for (const s of OV.labels){
    const d = s.getWorldPosition(_v).distanceTo(cam);
    const sz = d * k;
    s.scale.set(sz * s.userData.aspect, sz, 1);
  }
}
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

function frame(t){
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
  lastT = t;

  resize();
  if (dirty){
    const info = OV2.applyDate(OV.state.jd);
    dirty = false;
    if (onFrame) onFrame(info);
  }
  OV2.updateRig(dt);
  scaleLabels();

  /*  Sit the label just clear of the pin.  Anything much beyond ~1.15 R
      leaves the canvas entirely once the camera is down at globe zoom.  */
  const pin = OV.cityGroup.userData.pin;
  OV.cityLabel.position.copy(pin.position).multiplyScalar(1.15);

  /*  The sub-solar ring is drawn with depthTest off so it never gets
      z-fought by the globe surface — which means it would otherwise show
      through from the far side, putting the "Sun overhead" marker on the
      night face.  Hide both markers past the visible horizon instead.
      A point is over the horizon when  n . e > R / |E - C|.            */
  const toCam = _v2.copy(OV.camera.position).sub(OV.earthGroup.position);
  const dist = toCam.length();
  toCam.divideScalar(dist || 1);
  const cosHorizon = Math.min(0.999, OV.consts.EARTH_R / Math.max(dist, 0.001));
  OV.subGroup.visible   = _v3.copy(OV.subGroup.position).normalize().dot(toCam) > cosHorizon;
  OV.cityLabel.visible  = _v3.copy(pin.position).normalize().dot(toCam) > cosHorizon;

  /*  Orbit-scale annotations are noise once the camera is at the globe —
      and worse, their opaque backgrounds sit on top of the city label.  */
  const wide = OV.rig.r > 90;
  OV.markerGroup.visible = wide;
  OV.sunLabel.visible = wide;
  OV.orbitLine.visible = wide;      // the ellipse runs straight through the
  OV.sunLine.visible = wide;        // globe at this zoom; it only adds clutter

  OV.renderer.render(OV.scene, OV.camera);
}

window.OrbitView = {
  async init(canvas, opts){
    opts = opts || {};
    onFrame = opts.onFrame || null;
    OV.build(canvas);
    OV2.attachControls(canvas);

    // start on the fallback so the very first frame is never blank
    useFallbackTextures();
    OV2.rebuildOrbit(OV.state.jd);

    running = true;
    lastT = performance.now();
    requestAnimationFrame(frame);

    const ok = await loadTextures();
    return { texturesOk: ok };
  },

  setDate(jd){
    if (jd === OV.state.jd) return;
    OV.state.jd = jd;
    dirty = true;
  },

  setCity(city){
    OV.state.city = city;
    const lbl = OV.makeLabel(city.name, '#bfe6ff');
    OV.earthGroup.remove(OV.cityLabel);
    const i = OV.labels.indexOf(OV.cityLabel);
    if (i >= 0) OV.labels.splice(i, 1);
    if (OV.cityLabel.material.map) OV.cityLabel.material.map.dispose();
    OV.cityLabel.material.dispose();
    OV.cityLabel = lbl;
    OV.earthGroup.add(lbl);
    dirty = true;
  },

  setCamera(mode){ OV2.setCamera(mode); },

  toggle(what, on){
    OV.state.show[what] = on;
    if (what === 'rings') OV.ringGroup.visible = on;
    if (what === 'axis')  OV.axisLine.visible  = on;
    if (what === 'rays')  OV.rayGroup.visible  = on;
  },

  rebuildOrbit(jd){ OV2.rebuildOrbit(jd); },

  // exposed for the self-test
  _internals: OV
};
})();
</script>
