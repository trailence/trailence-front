#!/bin/bash
cd ..
rm ./downloads/* || true
rmdir ./downloads || true
mkdir ./downloads
npm run wdio -- --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD $@
