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
  docker ps -a
  for container_id in $(docker ps -a -q --filter name=trailence);
  do
    echo " --- Logs from container $container_id ---"
    docker logs $container_id
  done
  exit 1
fi

rm ./docker.env || true
echo "IS_CI=1" >> ./docker.env
echo "DB_USERNAME=$DB_USERNAME" >> ./docker.env
echo "DB_PASSWORD=$DB_PASSWORD" >> ./docker.env
echo "TRAILENCE_INIT_USER=$TRAILENCE_INIT_USER" >> ./docker.env
echo "TRAILENCE_INIT_PASSWORD=$TRAILENCE_INIT_PASSWORD" >> ./docker.env
