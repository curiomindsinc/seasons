#!/bin/sh
# Rebuild season.html from parts/.  Run from the project root.
# Order matters: 11-selftest must come before 10-app, because boot()
# in 10-app calls window.SeasonSelfTest.
set -e
cd "$(dirname "$0")"
cat parts/01-head.html \
    parts/02-body.html \
    parts/03-astro.js \
    parts/04-cities.js \
    parts/05-orbit.js \
    parts/06-orbit2.js \
    parts/07-orbit3.js \
    parts/08-sky.js \
    parts/09-graphs.js \
    parts/11-selftest.js \
    parts/10-app.js > season.html
printf '\n</body>\n</html>\n' >> season.html
echo "season.html rebuilt: $(wc -c < season.html) bytes"
