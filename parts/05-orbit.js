<script>
/* =====================================================================
   Orbit view — Sun, Earth's real elliptical orbit, and a tilted Earth
   whose axis stays fixed in space while it goes round.

   Frames
   ------
   Ecliptic frame: x toward the March equinox, z toward ecliptic north.
   Scene frame (three.js, y up): scene = (ecl.x, ecl.z, -ecl.y).
   That mapping is right-handed, so cross products keep their meaning.

   Earth's north pole points at ecliptic latitude 90-eps, longitude 90,
   i.e. ecl (0, sin eps, cos eps) -> scene (0, cos eps, -sin eps).
   A point at (lat, lon) then lies along
        cos(lat) * [ cos(GMST+lon)*e1 + sin(GMST+lon)*e2 ] + sin(lat)*axis
   with e1 the March-equinox direction and e2 = axis x e1.  No fudge
   factors: the sub-solar marker lands where the terminator says it should.

   Sphere UVs in three.js put u=0.5 at +X and v=1 at the north pole, so an
   equirectangular map lines up with
        local(lat,lon) = (cos lat cos lon, sin lat, -cos lat sin lon)
   which is what surfaceDir() reproduces in world space.
   ===================================================================== */
(function(){
'use strict';

const A = window.Astro;
const D2R = A.D2R;

/* Scale.  The orbit's SHAPE is exact (e = 0.0167, Sun at a focus) but the
   bodies are wildly enlarged or nothing would be visible: at this scale a
   true-size Earth would be 0.0043 units across.                         */
const consts = { ORBIT_A: 100, EARTH_R: 7.6, SUN_R: 11.5, RAY_LEN: 23 };
const { ORBIT_A, EARTH_R, SUN_R } = consts;

const OV = window.__OV = {
  consts: consts,
  labels: [],
  ZERO: new THREE.Vector3(0,0,0),
  state: {
    jd: 2451545,
    city: { name:'', lat:51.51, lon:-0.13 },
    show: { rings:true, axis:true, rays:true }
  },
  rig: {
    target:   new THREE.Vector3(0,0,0),
    targetTo: new THREE.Vector3(0,0,0),
    r: 300, rTo: 300,
    theta: 0.90, thetaTo: 0.90,
    phi:   1.02, phiTo:   1.02
  }
};

/* ------------------------------------------------------------ helpers */

OV.eclToScene = function(x, y, z){ return new THREE.Vector3(x, z, -y); };

OV.makeLabel = function(text, color){
  const pad = 9, fs = 30, font = '600 ' + fs + 'px system-ui, Segoe UI, Roboto, sans-serif';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const c = document.createElement('canvas');
  c.width = Math.ceil(probe.measureText(text).width) + pad*2;
  c.height = fs + pad*2;
  const g = c.getContext('2d');
  g.font = font;
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(5,7,13,.60)';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color || '#dce3f0';
  g.fillText(text, pad, c.height/2 + 1);

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent:true, depthTest:false, depthWrite:false
  }));
  spr.renderOrder = 20;
  spr.userData.aspect = c.width / c.height;
  OV.labels.push(spr);
  return spr;
};

function radialSprite(size, inner, mid){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.26, mid);
  grd.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/* A believable-looking planet for when the texture CDN is unreachable.
   Clearly a stand-in rather than a map — the geometry is what teaches.  */
OV.proceduralEarth = function(night){
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  if (night){ g.fillStyle = '#04070f'; g.fillRect(0,0,W,H); }
  else {
    const sea = g.createLinearGradient(0,0,0,H);
    sea.addColorStop(0,'#0d2947'); sea.addColorStop(.5,'#12518a'); sea.addColorStop(1,'#0d2947');
    g.fillStyle = sea; g.fillRect(0,0,W,H);
  }

  const GX = 48, GY = 24, lat0 = [];
  let s = 20260905;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y <= GY; y++){
    lat0[y] = [];
    for (let x = 0; x < GX; x++) lat0[y][x] = rnd();
  }
  const sm = t => t*t*(3-2*t);
  function noise(u, v){
    const fx = u*GX, fy = v*GY;
    const x0 = Math.floor(fx) % GX, y0 = Math.min(GY-1, Math.floor(fy));
    const tx = sm(fx - Math.floor(fx)), ty = sm(fy - Math.floor(fy));
    const x1 = (x0+1) % GX, y1 = Math.min(GY, y0+1);
    return (lat0[y0][x0]*(1-tx) + lat0[y0][x1]*tx)*(1-ty)
         + (lat0[y1][x0]*(1-tx) + lat0[y1][x1]*tx)*ty;
  }

  const img = g.getImageData(0,0,W,H), d = img.data;
  for (let y = 0; y < H; y++){
    const v = y / H, lat = 90 - v*180;
    for (let x = 0; x < W; x++){
      const u = x / W;
      const n = noise(u,v)*0.62 + noise(u*3,v*3)*0.26 + noise(u*7,v*7)*0.12;
      const i = (y*W + x)*4;
      const land = n > 0.52 && Math.abs(lat) < 84;
      const ice  = Math.abs(lat) > 71 || (land && Math.abs(lat) > 62);
      if (night){
        if (land && n > 0.60 && rnd() > 0.9945){ d[i]=255; d[i+1]=214; d[i+2]=150; d[i+3]=255; }
      } else if (ice){
        d[i]=232; d[i+1]=240; d[i+2]=248; d[i+3]=255;
      } else if (land){
        const dry = Math.abs(Math.abs(lat) - 24) < 11;
        d[i]   = dry ? 178 : 58 + n*40;
        d[i+1] = dry ? 152 : 96 + n*70;
        d[i+2] = dry ? 96  : 52 + n*26;
        d[i+3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
};

/* ------------------------------------------------------------ shaders */

const EARTH_VERT = [
  'varying vec2 vUv;',
  'varying vec3 vNW;',
  'varying vec3 vVW;',
  'void main(){',
  '  vUv = uv;',
  '  vNW = normalize(mat3(modelMatrix) * normal);',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  vVW = normalize(cameraPosition - wp.xyz);',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '}'
].join('\n');

const EARTH_FRAG = [
  'uniform sampler2D dayMap;',
  'uniform sampler2D nightMap;',
  'uniform vec3 sunDir;',
  'varying vec2 vUv;',
  'varying vec3 vNW;',
  'varying vec3 vVW;',
  'void main(){',
  '  vec3 N = normalize(vNW);',
  '  float d = dot(N, normalize(sunDir));',
  // soft terminator: the Sun is not a point, and twilight is real
  '  float lit = smoothstep(-0.09, 0.11, d);',
  '  vec3 day   = texture2D(dayMap, vUv).rgb;',
  '  vec3 night = texture2D(nightMap, vUv).rgb;',
  '  vec3 dayLit = day * (0.16 + 0.94 * clamp(d, 0.0, 1.0));',
  '  vec3 col = mix(night * 1.35 + day * 0.035, dayLit, lit);',
  // thin cool rim so the globe reads against black
  '  float rim = pow(1.0 - max(dot(N, normalize(vVW)), 0.0), 3.2);',
  '  col += vec3(0.16, 0.36, 0.62) * rim * (0.22 + 0.78 * lit);',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

/* --------------------------------------------------------------- build */

OV.build = function(canvas){
  OV.canvas = canvas;
  OV.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  OV.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = OV.scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050a);
  OV.camera = new THREE.PerspectiveCamera(42, 1, 0.4, 6000);

  /* stars */
  const sc = 2400, N = 1800;
  const pos = new Float32Array(N*3), col = new Float32Array(N*3);
  for (let i = 0; i < N; i++){
    const u = Math.random()*2-1, th = Math.random()*Math.PI*2, rr = Math.sqrt(1-u*u);
    pos[i*3] = Math.cos(th)*rr*sc; pos[i*3+1] = u*sc; pos[i*3+2] = Math.sin(th)*rr*sc;
    const b = 0.32 + Math.random()*0.68;
    col[i*3] = b; col[i*3+1] = b*(0.93+Math.random()*0.07); col[i*3+2] = b*(0.95+Math.random()*0.05);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos,3));
  sg.setAttribute('color', new THREE.BufferAttribute(col,3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
    size:2.1, vertexColors:true, sizeAttenuation:false })));

  /* sun */
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(SUN_R, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd07a })
  ));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialSprite(256, 'rgba(255,228,175,.95)', 'rgba(255,168,54,.40)'),
    transparent:true, depthWrite:false, blending: THREE.AdditiveBlending
  }));
  glow.scale.set(SUN_R*5.4, SUN_R*5.4, 1);
  scene.add(glow);

  OV.sunLabel = OV.makeLabel('Sun', '#ffcf8a');
  OV.sunLabel.position.set(0, SUN_R*1.95, 0);
  scene.add(OV.sunLabel);

  /* orbit path, filled in by rebuildOrbit */
  OV.orbitLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x3f5d7a, transparent:true, opacity:0.9 })
  );
  scene.add(OV.orbitLine);

  OV.markerGroup = new THREE.Group();
  scene.add(OV.markerGroup);

  OV.sunLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffb445, transparent:true, opacity:0.30 })
  );
  scene.add(OV.sunLine);

  /* earth */
  OV.earthGroup = new THREE.Group();
  scene.add(OV.earthGroup);

  OV.earthMat = new THREE.ShaderMaterial({
    uniforms: {
      dayMap:   { value: null },
      nightMap: { value: null },
      sunDir:   { value: new THREE.Vector3(1,0,0) }
    },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG
  });
  OV.earthMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 64), OV.earthMat);
  OV.earthGroup.add(OV.earthMesh);

  /* rotation axis, extended past the poles */
  OV.axisLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -EARTH_R*1.9, 0), new THREE.Vector3(0, EARTH_R*1.9, 0)
    ]),
    new THREE.LineBasicMaterial({ color: 0xff8f5b })
  );
  OV.earthMesh.add(OV.axisLine);

  /* latitude circles */
  OV.ringGroup = new THREE.Group();
  OV.earthMesh.add(OV.ringGroup);
  const RINGS = [[0, 0x6fd08c], [A.TROPIC, 0xc79bff], [-A.TROPIC, 0xc79bff],
                 [A.POLAR, 0x7fb8ff], [-A.POLAR, 0x7fb8ff]];
  for (let i = 0; i < RINGS.length; i++){
    const lat = RINGS[i][0];
    const pts = [];
    const rr = Math.cos(lat*D2R) * EARTH_R * 1.003, yy = Math.sin(lat*D2R) * EARTH_R * 1.003;
    for (let j = 0; j <= 128; j++){
      const t = j/128*Math.PI*2;
      pts.push(new THREE.Vector3(Math.cos(t)*rr, yy, Math.sin(t)*rr));
    }
    OV.ringGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: RINGS[i][1], transparent:true, opacity:0.72 })
    ));
  }

  /* city pin */
  OV.cityGroup = new THREE.Group();
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R*0.05, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x5bc8ff })
  );
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(EARTH_R*0.011, EARTH_R*0.011, EARTH_R*0.26, 8),
    new THREE.MeshBasicMaterial({ color: 0x5bc8ff, transparent:true, opacity:0.85 })
  );
  stick.position.y = -EARTH_R*0.13;
  pin.add(stick);
  OV.cityGroup.add(pin);
  OV.cityGroup.userData.pin = pin;
  OV.earthGroup.add(OV.cityGroup);

  OV.cityLabel = OV.makeLabel('', '#bfe6ff');
  OV.earthGroup.add(OV.cityLabel);

  /* sub-solar marker */
  OV.subGroup = new THREE.Group();
  const subRing = new THREE.Mesh(
    new THREE.RingGeometry(EARTH_R*0.055, EARTH_R*0.085, 28),
    new THREE.MeshBasicMaterial({ color: 0xff5f5f, side: THREE.DoubleSide,
                                  transparent:true, opacity:0.95, depthTest:false })
  );
  const subDot = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R*0.028, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5f5f, depthTest:false })
  );
  subRing.renderOrder = 6; subDot.renderOrder = 6;
  OV.subGroup.add(subRing); OV.subGroup.add(subDot);
  OV.subGroup.userData.ring = subRing;
  OV.earthGroup.add(OV.subGroup);

  /* parallel sunlight */
  OV.rayGroup = new THREE.Group();
  scene.add(OV.rayGroup);
  const rayMat = new THREE.LineBasicMaterial({ color: 0xffcf8a, transparent:true, opacity:0.40 });
  for (let i = 0; i < 44; i++){
    OV.rayGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      rayMat
    ));
  }
};
})();
</script>
