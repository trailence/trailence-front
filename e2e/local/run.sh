#!/bin/bash
cd ..
export MOZ_REMOTE_SETTINGS_DEVTOOLS=1
export WSLENV="MOZ_REMOTE_SETTINGS_DEVTOOLS"
./run.sh --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD --db-username=$DB_USERNAME --db-password=$DB_PASSWORD $@
