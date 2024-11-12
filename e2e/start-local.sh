#!/bin/bash

export TRAILENCE_BACK_VERSION="snapshot-dev"
export DB_USERNAME="postgres"
export DB_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"
export JWT_SECRET="$(echo $RANDOM | md5sum | head -c 32)"
export TRAILENCE_INIT_USER="user@trailence.org"
export TRAILENCE_INIT_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"

docker compose down
npm i
docker compose up -d --wait && npm run wdio
