#!/bin/bash

export BRANCH=$(git rev-parse --abbrev-ref HEAD | sed 's/\//-/g')
export TRAILENCE_BACK_VERSION="snapshot-$BRANCH"
BACK_VERSION_EXISTS=$(curl -s -X GET https://hub.docker.com/v2/repositories/trailence/back/tags?name=$TRAILENCE_BACK_VERSION | awk -F, '{print $1}' | awk -F: '{print $2}')
if [ $BACK_VERSION_EXISTS = "0" ]
then
  export TRAILENCE_BACK_VERSION="snapshot-dev"
fi
echo "Run with backend version $TRAILENCE_BACK_VERSION"

export DB_USERNAME="postgres"
export DB_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"
export JWT_SECRET="$(echo $RANDOM | md5sum | head -c 32)"
export TRAILENCE_INIT_USER="user@trailence.org"
export TRAILENCE_INIT_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"
export OUTDOOR_ACTIVE_KEY="yourtest-outdoora-ctiveapi"

echo "Shutdown docker compose"
docker compose down
echo "Install NPM packages"
cd .. && npm i && cd local
echo "Starting docker compose"
docker compose up -d --pull always --wait
echo "Database user is $DB_USERNAME with password $DB_PASSWORD"
echo "Initial user is $TRAILENCE_INIT_USER with password $TRAILENCE_INIT_PASSWORD"
echo "Start tests using run.sh. Example: ./run.sh --tests=1:browser:chrome:desktop:01000/"
/bin/bash
