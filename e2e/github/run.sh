#!/bin/bash

export TRAILENCE_BACK_VERSION="$DOCKER_METADATA_OUTPUT_VERSION"
if [ -z $TRAILENCE_BACK_VERSION ]
then
  export TRAILENCE_BACK_VERSION="snapshot-dev"
else
  BACK_VERSION_EXISTS=$(curl -s -X GET https://hub.docker.com/v2/repositories/trailence/back/tags?name=$TRAILENCE_BACK_VERSION | awk -F, '{print $1}' | awk -F: '{print $2}')
  if [ $BACK_VERSION_EXISTS = "0" ]
  then
    export TRAILENCE_BACK_VERSION="snapshot-dev"
  fi
fi
export IS_CI=1
export DB_USERNAME="postgres"
export DB_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"
export JWT_SECRET="$(echo $RANDOM | md5sum | head -c 32)"
export TRAILENCE_INIT_USER="user@trailence.org"
export TRAILENCE_INIT_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"

docker compose down
cd .. && npm i && cd github
docker compose up -d --wait && npm run wdio -- --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD $@ | grep -v "BIDI COMMAND" && docker compose down
