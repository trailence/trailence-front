#!/bin/sh
cd /trailence
npm i && ionic serve --no-open --host=0.0.0.0 -- --proxy-config e2e/proxy.conf.json --poll=20000 --hmr=false
