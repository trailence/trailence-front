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
docker compose up -d --wait
if [ $? -ne 0 ]; then
  echo "Error starting docker containers"
  exit 1
fi
cd ..
npm run wdio -- --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD $@ | grep -v "BIDI COMMAND" | grep -v "BIDI RESULT"
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "Error during tests"
  exit 1
fi
if [ $? -ne 0 ]; then
  echo "Error during tests"
  exit 1
fi
cd github
docker compose down
