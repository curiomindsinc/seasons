/*  Drive season.html in a real (headless) Chrome over the DevTools
    protocol: change city, date and camera, capture console errors and
    screenshots.  Node 22+ has a global WebSocket, so no dependencies.   */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'file:///' + path.join(__dirname, '..', 'season.html').split(path.sep).join('/');
const PORT = 9333;
const OUT = require('os').tmpdir();

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main(){
  const profile = path.join(os.tmpdir(), 'seasoncdp' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    '--window-size=1680,1000',
    'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++){
    await sleep(300);
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      targets = await r.json();
    } catch(e){ /* not up yet */ }
  }
  if (!targets) throw new Error('Chrome DevTools endpoint never came up');
  const page = targets.find(t => t.type === 'page');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const consoleMsgs = [];
  const exceptions = [];

  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)){
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    } else if (m.method === 'Runtime.consoleAPICalled'){
      consoleMsgs.push({
        level: m.params.type,
        text: m.params.args.map(a =>
          a.value !== undefined ? String(a.value) :
          (a.description || a.type)).join(' ')
      });
    } else if (m.method === 'Runtime.exceptionThrown'){
      const d = m.params.exceptionDetails;
      exceptions.push((d.exception && d.exception.description) || d.text);
    }
  });

  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });

  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails){
      throw new Error('eval failed: ' +
        ((r.exceptionDetails.exception && r.exceptionDetails.exception.description)
         || r.exceptionDetails.text));
    }
    return r.result.value;
  };

  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    return name;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(9000);                       // boot + texture fetch

  const results = [];
  const check = async (label, expr) => {
    const v = await evaluate(expr);
    results.push([label, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    return v;
  };

  /* --- did it boot? --- */
  await check('self-test', 'document.getElementById("selftest-out").textContent.split("\\n")[0]');
  await check('fatal overlay', 'getComputedStyle(document.getElementById("fatal")).display');
  await check('boot overlay gone', '!document.getElementById("boot")');
  await check('textures loaded', 'document.getElementById("scaleWarn").textContent');
  await check('timeline marks', 'document.getElementById("tlMarks").children.length');
  await check('canvas has pixels',
    '(function(){const c=document.getElementById("orbitCanvas");return c.width+"x"+c.height})()');
  await check('sky canvas',
    '(function(){const c=document.getElementById("skyCanvas");return c.width+"x"+c.height})()');

  /* --- drive the UI: Tromso in December should be polar night --- */
  await evaluate(`(function(){
    const cs = document.getElementById('countrySel');
    const opts = [...cs.options];
    const i = opts.findIndex(o => o.textContent === 'Norway');
    cs.value = i; cs.dispatchEvent(new Event('change'));
    const ct = document.getElementById('citySel');
    const j = [...ct.options].findIndex(o => o.textContent.indexOf('Tromso') === 0);
    ct.value = j; ct.dispatchEvent(new Event('change'));
    // use the jump button, the way a user would
    document.getElementById('eventBtns').children[3].click();
  })()`);
  await sleep(700);
  await check('Tromso Dec-solstice date', 'document.getElementById("dateLabel").textContent');
  await check('Tromso Dec-solstice season', 'document.getElementById("seasonName").textContent');
  await check('Tromso season sub', 'document.getElementById("seasonSub").textContent.slice(0,72)');
  await check('Tromso daylight', 'document.getElementById("stDaylight").textContent');
  await check('Tromso badges',
    '[...document.getElementById("seasonBadges").children].map(b=>b.textContent).join(" / ")');
  await check('Tromso noon altitude', 'document.getElementById("stNoonAlt").textContent');
  await evaluate('OrbitView.setCamera("earth")');
  await sleep(1800);
  await check('city label at globe zoom', `(function(){
    const OV = OrbitView._internals;
    const L = OV.cityLabel;
    const w = L.getWorldPosition(new THREE.Vector3());
    const p = w.clone().project(OV.camera);
    const cv = OV.canvas;
    return 'vis=' + L.visible +
      ' inLabels=' + (OV.labels.indexOf(L) >= 0) +
      ' parent=' + (L.parent ? L.parent.type : 'NONE') +
      ' tex=' + (L.material.map ? L.material.map.image.width + 'x' + L.material.map.image.height : 'null') +
      ' scale=' + L.scale.x.toFixed(3) + ',' + L.scale.y.toFixed(3) +
      ' screen=' + Math.round((p.x*0.5+0.5)*cv.clientWidth) + ',' +
                   Math.round((-p.y*0.5+0.5)*cv.clientHeight) + ' z=' + p.z.toFixed(3);
  })()`);
  await evaluate('OrbitView.setCamera("earth")');
  await sleep(1600);
  await shot('shot-tromso-dec.png');

  /* --- same place, June: midnight sun --- */
  await evaluate(`(function(){
    const di = document.getElementById('dateInput');
    di.value='2026-06-21'; di.dispatchEvent(new Event('change'));
  })()`);
  await sleep(700);
  await check('Tromso 21 Jun season', 'document.getElementById("seasonName").textContent');
  await check('Tromso 21 Jun daylight', 'document.getElementById("stDaylight").textContent');
  await sleep(900);
  await shot('shot-tromso-jun.png');

  /* --- southern hemisphere flip --- */
  await evaluate(`(function(){
    const cs=document.getElementById('countrySel');
    cs.value=[...cs.options].findIndex(o=>o.textContent==='Australia');
    cs.dispatchEvent(new Event('change'));
    const ct=document.getElementById('citySel');
    ct.value=[...ct.options].findIndex(o=>o.textContent.indexOf('Sydney')===0);
    ct.dispatchEvent(new Event('change'));
    document.getElementById('eventBtns').children[3].click();
  })()`);
  await sleep(700);
  await check('Sydney Dec-solstice date', 'document.getElementById("dateLabel").textContent');
  await check('Sydney Dec-solstice season', 'document.getElementById("seasonName").textContent');
  await check('Sydney daylight', 'document.getElementById("stDaylight").textContent');
  await check('Sydney hemisphere badge',
    'document.getElementById("seasonBadges").children[0].textContent');
  await evaluate(`(function(){
    const di=document.getElementById('dateInput');
    di.value='2026-12-19'; di.dispatchEvent(new Event('change'));
  })()`);
  await sleep(400);
  await check('Sydney two days earlier', 'document.getElementById("seasonName").textContent');
  await evaluate(`(function(){
    document.getElementById('eventBtns').children[3].click();
  })()`);
  await sleep(400);

  /*  --- the two calendars must both be legible ---
      Vienna on 6 September: European forecasters call this autumn (the
      meteorological season starts 1 Sep) while the Sun is still 17 days
      short of the equinox.  The card has to show both, or it reads as a
      bug to anyone who checked a local weather site.                    */
  const pick = (country, city) => `(function(){
    const cs=document.getElementById('countrySel');
    cs.value=[...cs.options].findIndex(o=>o.textContent===${JSON.stringify(country)});
    cs.dispatchEvent(new Event('change'));
    const ct=document.getElementById('citySel');
    ct.value=[...ct.options].findIndex(o=>o.textContent.indexOf(${JSON.stringify(city)})===0);
    ct.dispatchEvent(new Event('change'));
    const di=document.getElementById('dateInput');
  })()`;
  await evaluate(pick('Austria', 'Vienna'));
  await evaluate(`(function(){
    const di=document.getElementById('dateInput');
    di.value='2026-09-06'; di.dispatchEvent(new Event('change'));
  })()`);
  await sleep(700);
  await check('Vienna 6 Sep headline',  'document.getElementById("seasonName").textContent');
  await check('Vienna countdown',       'document.getElementById("seasonCount").textContent');
  await check('Vienna astronomical',
    'document.getElementById("defAstroName").textContent + " " + document.getElementById("defAstroWhen").textContent');
  await check('Vienna meteorological',
    'document.getElementById("defMetName").textContent + " " + document.getElementById("defMetWhen").textContent');
  await check('both definitions same size', `(function(){
    const a=getComputedStyle(document.querySelector('#seasonDefs dd b')).fontSize;
    const rows=[...document.querySelectorAll('#seasonDefs dd b')].map(e=>getComputedStyle(e).fontSize);
    return rows.every(s=>s===a) ? 'yes ('+a+')' : 'NO: '+rows.join(' vs ');
  })()`);

  /* --- southern flip of the meteorological block, and the tropics --- */
  await evaluate(pick('Argentina', 'Buenos Aires'));
  await sleep(500);
  await check('Buenos Aires met row',
    'document.getElementById("defMetName").textContent + " " + document.getElementById("defMetWhen").textContent');
  await evaluate(pick('Singapore', 'Singapore'));
  await sleep(500);
  await check('Singapore headline', 'document.getElementById("seasonName").textContent');
  await check('Singapore countdown', 'document.getElementById("seasonCount").textContent');

  /*  --- the axis must not swing ---
      The whole lesson collapses if the tilt appears to follow the Sun.
      Take the rendered spin axis in world space at four points around the
      orbit: every pair must be parallel, and each must sit 23.44 deg off
      the ecliptic normal.  What changes is the angle to the *Sun*, which
      is measured here too and must swing by twice the obliquity.        */
  await check('axis fixed in space', `(function(){
    const OV = OrbitView._internals;
    const OV2 = window.__OV2;
    const dirs = [], toSun = [];
    for (const [m,d] of [[3,20],[6,21],[9,23],[12,21]]){
      OV2.applyDate(Astro.julianDay(2026,m,d,12));
      const ax = new THREE.Vector3(0,1,0)
        .applyQuaternion(OV.earthMesh.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      dirs.push(ax);
      const sun = OV.earthGroup.position.clone().multiplyScalar(-1).normalize();
      toSun.push(THREE.MathUtils.radToDeg(Math.acos(ax.dot(sun))));
    }
    let spread = 0;
    for (const a of dirs) for (const b of dirs)
      spread = Math.max(spread, THREE.MathUtils.radToDeg(Math.acos(
        Math.min(1, a.dot(b)))));
    const north = new THREE.Vector3(0,1,0);
    const tilt = dirs.map(a => THREE.MathUtils.radToDeg(Math.acos(a.dot(north))));
    const swing = Math.max(...toSun) - Math.min(...toSun);
    return 'spread=' + spread.toFixed(4) + 'deg' +
           '  tilt=' + tilt.map(t=>t.toFixed(3)).join('/') +
           '  angleToSun=' + toSun.map(t=>t.toFixed(1)).join('/') +
           '  swing=' + swing.toFixed(2) + 'deg' +
           '  ' + (spread < 0.01 && Math.abs(tilt[0]-23.4393) < 0.01 &&
                   Math.abs(swing - 2*23.4393) < 0.3 ? 'OK' : 'FAIL');
  })()`);

  /* --- edge-on view of the whole orbit --- */
  await evaluate('OrbitView.setCamera("side")');
  await sleep(1600);
  await shot('shot-orbit-side.png');

  /* --- graphs tab --- */
  await evaluate(`document.querySelector('[data-tab="graph"]').click()`);
  await sleep(900);
  await shot('shot-graphs.png');
  await check('graph canvases painted', `(function(){
    return ['gDaylight','gAltitude','gDistance'].map(id=>{
      const c=document.getElementById(id);
      const g=c.getContext('2d');
      const d=g.getImageData(0,0,c.width,c.height).data;
      let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;
      return id+':'+(n>2000?'painted':'BLANK('+n+')');
    }).join(' ');
  })()`);

  /* --- play/pause advances the date --- */
  await evaluate(`document.querySelector('[data-tab="sky"]').click();
                  document.getElementById('speedSel').value='30';
                  document.getElementById('speedSel').dispatchEvent(new Event('change'));
                  document.getElementById('playBtn').click();`);
  await sleep(2500);
  const during = await evaluate('document.getElementById("dateLabel").textContent');
  await evaluate('document.getElementById("playBtn").click()');
  await sleep(400);
  results.push(['play advanced date', during]);

  /* --- guided tour runs all five steps --- */
  for (let i = 0; i < 5; i++){
    await evaluate('document.getElementById("tourNext").click()');
    await sleep(350);
  }
  await check('tour step 5', 'document.getElementById("tourBody").textContent.slice(0,58)');
  await sleep(1200);
  await shot('shot-tour5.png');

  /* --- extreme latitudes must not blow up --- */
  await check('extreme latitudes', `(function(){
    const out=[];
    for (const [la,lo,lab] of [[89.99,0,'N pole'],[-89.99,0,'S pole'],
                               [0,0,'equator'],[66.56,25,'Arctic circle'],
                               [-77.85,166.67,'McMurdo']]){
      for (const [m,d] of [[6,21],[12,21],[3,20]]){
        const c=Astro.dayCircumstances(2026,m,d,la,lo);
        if(!isFinite(c.daylight)||!isFinite(c.noonAlt)||!isFinite(c.insolation))
          out.push(lab+' '+m+'/'+d+' NON-FINITE');
      }
    }
    return out.length?out.join('; '):'all finite';
  })()`);

  /* --- year boundaries and leap years --- */
  await check('year rollover', `(function(){
    const out=[];
    for (const y of [1900,2000,2024,2026,2100,2199]){
      const N=Astro.daysInYear(y);
      const ev=Astro.yearEvents(y);
      if(ev.some(e=>e.jd==null)) out.push(y+' missing event');
      const d=Astro.fromDayOfYear(y,N);
      if(d.month!==12||d.day!==31) out.push(y+' last day = '+d.month+'/'+d.day);
    }
    return out.length?out.join('; '):'ok 1900-2199';
  })()`);

  console.log('\n--- driven checks ---');
  for (const [k, v] of results) console.log('  ' + k.padEnd(24) + ' ' + v);

  console.log('\n--- page console ---');
  const noisy = consoleMsgs.filter(m => m.level === 'error' || m.level === 'warning');
  if (!noisy.length) console.log('  no errors or warnings');
  else noisy.forEach(m => console.log('  [' + m.level + '] ' + m.text.slice(0, 200)));

  console.log('\n--- uncaught exceptions ---');
  console.log(exceptions.length ? exceptions.map(e => '  ' + e.split('\n')[0]).join('\n')
                                : '  none');

  ws.close();
  chrome.kill();
  await sleep(400);
  try { fs.rmSync(profile, { recursive:true, force:true }); } catch(e){}
}

main().catch(e => { console.error(e); process.exit(1); });
