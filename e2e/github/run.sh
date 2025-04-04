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
echo "Run with backend version $TRAILENCE_BACK_VERSION"
export IS_CI=1
export DB_USERNAME="postgres"
export DB_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"
export JWT_SECRET="$(echo $RANDOM | md5sum | head -c 32)"
export TRAILENCE_INIT_USER="user@trailence.org"
export TRAILENCE_INIT_PASSWORD="$(echo $RANDOM | md5sum | head -c 20)"
export OUTDOOR_ACTIVE_KEY="yourtest-outdoora-ctiveapi"

docker compose down
docker compose up -d --wait
if [ $? -ne 0 ]; then
  echo "Error starting docker containers"
  exit 1
fi
cd ..
rm ./downloads/* || true
rmdir ./downloads || true
mkdir ./downloads

export MOZ_REMOTE_SETTINGS_DEVTOOLS=1

npm run wdio -- --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD --db_user=$DB_USERNAME --db_password=$DB_PASSWORD $@ | grep -v "BIDI COMMAND" | grep -v "BIDI RESULT" | grep -v "INFO webdriver: RESULT {\"/home"
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
