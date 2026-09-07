<script>
/* =====================================================================
   Year graphs — daylight length, noon Sun height, and Earth-Sun distance
   across a whole year for the chosen city.  Plain 2D canvas.
   ===================================================================== */
(function(){
'use strict';
const A = window.Astro;

const CSS = getComputedStyle(document.documentElement);
const C = {
  grid:  '#1b2436',
  axis:  '#2a3650',
  text:  '#7c8aa5',
  dim:   '#4d5a72',
  sun:   '#ffb445',
  cool:  '#5bc8ff',
  green: '#6fd08c'
};
const MONTH_LABEL = ['J','F','M','A','M','J','J','A','S','O','N','D'];

function setup(cv){
  const w = cv.clientWidth || 320;
  const h = parseInt(cv.getAttribute('height'), 10) || 180;
  const pr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.floor(w*pr) || cv.height !== Math.floor(h*pr)){
    cv.width = Math.floor(w*pr);
    cv.height = Math.floor(h*pr);
    cv.style.height = h + 'px';
  }
  const g = cv.getContext('2d');
  g.setTransform(pr, 0, 0, pr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g:g, w:w, h:h };
}

/*  opts: { title, unit, values[], today, events[], color, fill,
            yMin, yMax, fmt, band }                                    */
function drawChart(cv, opts){
  const { g, w, h } = setup(cv);
  const L = 40, Rp = 10, T = 20, B = 20;
  const pw = w - L - Rp, ph = h - T - B;
  const n = opts.values.length;

  let lo = opts.yMin, hi = opts.yMax;
  if (lo == null || hi == null){
    lo = Math.min.apply(null, opts.values);
    hi = Math.max.apply(null, opts.values);
    const pad = (hi - lo) * 0.16 || 1;
    lo -= pad; hi += pad;
  }
  const X = i => L + (i / (n - 1)) * pw;
  const Y = v => T + ph - ((v - lo) / (hi - lo)) * ph;

  g.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  g.textBaseline = 'middle';

  /* horizontal grid */
  const ticks = opts.ticks || 4;
  g.strokeStyle = C.grid; g.lineWidth = 1;
  g.fillStyle = C.dim; g.textAlign = 'right';
  for (let i = 0; i <= ticks; i++){
    const v = lo + (hi - lo) * i / ticks;
    const y = Math.round(Y(v)) + 0.5;
    g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
    g.fillText(opts.fmt ? opts.fmt(v) : v.toFixed(0), L - 6, y);
  }

  /* a highlighted horizontal band, e.g. 12h of daylight or 0 altitude */
  if (opts.band != null && opts.band >= lo && opts.band <= hi){
    const y = Math.round(Y(opts.band)) + 0.5;
    g.save();
    g.strokeStyle = C.axis; g.setLineDash([3,3]);
    g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
    g.restore();
  }

  /* month ticks */
  g.textAlign = 'center'; g.fillStyle = C.dim;
  for (let m = 0; m < 12; m++){
    const dn = A.dayOfYear(opts.year, m + 1, 1) - 1;
    const x = X(dn);
    g.strokeStyle = C.grid;
    g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke();
    const dnMid = A.dayOfYear(opts.year, m + 1, 15) - 1;
    g.fillText(MONTH_LABEL[m], X(dnMid), h - B / 2 + 2);
  }

  /* solstice / equinox verticals */
  for (const e of opts.events){
    const x = X(e.dn);
    g.strokeStyle = e.kind === 'so' ? 'rgba(255,180,69,.34)' : 'rgba(111,208,140,.34)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke();
  }

  /* the curve */
  if (opts.fill){
    g.beginPath();
    g.moveTo(X(0), T + ph);
    for (let i = 0; i < n; i++) g.lineTo(X(i), Y(opts.values[i]));
    g.lineTo(X(n-1), T + ph);
    g.closePath();
    const grd = g.createLinearGradient(0, T, 0, T + ph);
    grd.addColorStop(0, opts.fill);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fill();
  }
  g.beginPath();
  for (let i = 0; i < n; i++){
    const x = X(i), y = Y(opts.values[i]);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.strokeStyle = opts.color; g.lineWidth = 1.8; g.stroke();

  /* today */
  const ti = Math.max(0, Math.min(n - 1, opts.today));
  const tx = X(ti), ty = Y(opts.values[ti]);
  g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(tx, T); g.lineTo(tx, T + ph); g.stroke();
  g.fillStyle = opts.color;
  g.beginPath(); g.arc(tx, ty, 3.6, 0, Math.PI*2); g.fill();
  g.strokeStyle = '#05070d'; g.lineWidth = 1.4; g.stroke();

  /* title and the value under the cursor */
  g.textAlign = 'left';
  g.font = '600 11px system-ui, Segoe UI, Roboto, sans-serif';
  g.fillStyle = C.text;
  g.fillText(opts.title, L, T - 9);

  g.textAlign = 'right';
  g.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  g.fillStyle = opts.color;
  g.fillText(opts.readout, L + pw, T - 9);
}

function hoursText(v){
  const hh = Math.floor(v), mm = Math.round((v - hh) * 60);
  return mm === 60 ? (hh + 1) + 'h 00m' : hh + 'h ' + String(mm).padStart(2,'0') + 'm';
}

/*  The year-long series only change when the place or the year changes,
    so they are cached: scrubbing through dates just redraws.          */
let cache = null;
function series(lat, lon, year){
  const key = lat + '|' + lon + '|' + year;
  if (cache && cache.key === key) return cache;
  const N = A.daysInYear(year);
  const daylight = new Array(N), noonAlt = new Array(N), dist = new Array(N);
  for (let i = 0; i < N; i++){
    const d = A.fromDayOfYear(year, i + 1);
    const c = A.dayCircumstances(year, d.month, d.day, lat, lon);
    daylight[i] = c.daylight;
    noonAlt[i]  = c.noonAlt;
    dist[i]     = c.distKm / 1e6;
  }
  const events = A.yearEvents(year).map(e => {
    // place the mark on the local calendar day the event falls on
    const d = A.jdToDate(e.jd + lon / 360);
    return { dn: A.dayOfYear(d.year, d.month, d.day) - 1, kind: e.kind };
  });
  cache = { key:key, N:N, daylight:daylight, noonAlt:noonAlt, dist:dist, events:events };
  return cache;
}

window.Graphs = {
  draw(lat, lon, year, todayDn){
    const s = series(lat, lon, year);
    const N = s.N, daylight = s.daylight, noonAlt = s.noonAlt, dist = s.dist;
    const events = s.events;
    const ti = Math.max(0, Math.min(N - 1, todayDn));

    drawChart(document.getElementById('gDaylight'), {
      year:year, values:daylight, today:ti, events:events,
      color:C.sun, fill:'rgba(255,180,69,.20)',
      yMin:0, yMax:24, ticks:4, band:12,
      fmt: v => Math.round(v) + 'h',
      title:'Daylight', readout: hoursText(daylight[ti])
    });

    /*  Altitude always tops out at 90; the floor drops in 30-degree steps
        only as far as a polar winter actually needs, so the gridlines stay
        on round numbers instead of landing on 17 and 42.                */
    const altMin = Math.min.apply(null, noonAlt);
    const yLo = Math.min(0, Math.floor(altMin / 30) * 30);
    drawChart(document.getElementById('gAltitude'), {
      year:year, values:noonAlt, today:ti, events:events,
      color:C.cool, fill:'rgba(91,200,255,.18)',
      yMin:yLo, yMax:90, ticks:(90 - yLo) / 30, band:0,
      fmt: v => Math.round(v) + '°',
      title:'Sun height at noon',
      readout: noonAlt[ti].toFixed(1) + '°'
    });

    /*  Fixed scale, because the point is how little this moves.  Letting it
        auto-fit would magnify a 3.3% wobble into a dramatic-looking curve. */
    drawChart(document.getElementById('gDistance'), {
      year:year, values:dist, today:ti, events:events,
      color:C.green, fill:'rgba(111,208,140,.14)',
      yMin:146.5, yMax:152.5, ticks:3,
      fmt: v => v.toFixed(1),
      title:'Distance to the Sun (million km)',
      readout: dist[ti].toFixed(2) + 'M km'
    });

    return { daylight:daylight, noonAlt:noonAlt, dist:dist };
  },
  hoursText: hoursText
};
})();
</script>
