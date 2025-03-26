#!/bin/bash
cd ..
rm ./downloads/* || true
rmdir ./downloads || true
mkdir ./downloads
export MOZ_REMOTE_SETTINGS_DEVTOOLS=1
export WSLENV="MOZ_REMOTE_SETTINGS_DEVTOOLS"
npm run wdio -- --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD --db_user=$DB_USERNAME --db_password=$DB_PASSWORD $@
