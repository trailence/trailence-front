#!/bin/bash

export TRAILENCE_BACK_VERSION="snapshot-dev"
export DB_USERNAME="postgres"
export DB_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"
export JWT_SECRET="$(echo $RANDOM | md5sum | head -c 32)"
export TRAILENCE_INIT_USER="user@trailence.org"
export TRAILENCE_INIT_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"
export OUTDOOR_ACTIVE_KEY="yourtest-outdoora-ctiveapi"

docker compose down
cd .. && npm i && cd local
docker compose up -d --wait
echo "Database user is $DB_USERNAME with password $DB_PASSWORD"
echo "Initial user is $TRAILENCE_INIT_USER with password $TRAILENCE_INIT_PASSWORD"
/bin/bash
