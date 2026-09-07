# Seasons simulator

`season.html` — open it directly in a browser. No server, no install.

Shows that Earth's **axial tilt**, not its distance from the Sun, causes the
seasons: pick a city and a date, and the orbit view, sky dome and year graphs
all update from the same astronomical calculation.

## Layout

    season.html        the deliverable — self-contained, ~120 KB
    seasonweb.html     same simulator, assembled from GitHub at run time
    build.sh           rebuilds season.html from parts/
    parts/             the editable source, 11 fragments
    tests/             see below

## seasonweb.html — the always-current copy

`season.html` is a snapshot: it shows whatever was built the last time someone
ran `build.sh`. `seasonweb.html` is a ~7 KB loader that holds no simulator code
at all. On every open it fetches the eleven fragments straight from
`github.com/curiomindsinc/seasons`, concatenates them in exactly the order
`build.sh` uses, and hands the assembled document to an iframe — so it runs
whatever is on the branch right now.

Open it from disk like any other file; both mirrors send
`Access-Control-Allow-Origin: *`, so no server is needed.

    seasonweb.html                      latest main
    seasonweb.html?ref=v1.2             a tag, branch or commit SHA
    seasonweb.html?mirror=jsdelivr      jsDelivr instead of raw.githubusercontent

It reads from raw.githubusercontent by default, which reflects a push within
about five minutes; jsDelivr is a faster CDN but can pin a moving ref for up to
twelve hours. Each fragment falls back to the other mirror on its own, so one
being down or rate-limited is survivable. Requires network access — and the
repository must stay public.

## Editing

`season.html` is a **build artifact**. Edit files in `parts/`, then:

    ./build.sh

Order matters: `11-selftest` is concatenated before `10-app`, because `boot()`
in the app calls `window.SeasonSelfTest`. `seasonweb.html` repeats that order in
its own `PARTS` list — change one and change the other.

Never hand-edit `season.html`: the next `build.sh` silently overwrites it.
Anything that must survive belongs in `parts/`.

## Tests

    node tests/syntax.test.js    # every inline script block parses
    node tests/astro.test.js     # 45 astronomy checks, no dependencies
    node tests/browser.test.js   # drives real Chrome over the DevTools protocol

`syntax.test.js` pulls each inline `<script>` out of the built page and runs
`node --check` over it, reporting the line in `season.html` where any failing
block starts. It is the fastest way to catch a bad concatenation.

`astro.test.js` extracts the `window.Astro` block out of `season.html` itself,
so it can never drift from what ships. It checks equinox and solstice instants
against published UTC values (within 15 min), the Kepler solver, sub-solar
geometry, daylight length for six cities, polar day and night, season labelling
by hemisphere, overhead ("Lahaina Noon") dates, and calendar round-tripping
from 1900 to 2199.

`browser.test.js` boots the page in headless Chrome, drives the controls the
way a user would, and fails on any console error or uncaught exception. It
needs Chrome at the path in its `CHROME` constant and Node 22+ (for the global
`WebSocket`). Screenshots go to the system temp directory.

The page also runs 17 self-checks on load; results appear in the console and in
a hidden `#selftest-out` element. Three of them compare the *rendered* scene
against the maths — that the sub-solar marker really faces the Sun, that the
drawn axis is tilted by the obliquity, and that the city pin sits at the angle
spherical trigonometry predicts.

## Accuracy

Meeus low-precision solar theory with an exact Kepler solve, plus annual
aberration and nutation in longitude, so equinox and solstice instants land
within about 10 minutes of published values.

Sunrise, sunset and solar noon are **local mean solar time derived from
longitude** — there is no timezone or daylight-saving database. The UI labels
them as such.

Earth textures come from a CDN. If it is unreachable the page generates a globe
instead and says so in the header; everything else still works offline.
