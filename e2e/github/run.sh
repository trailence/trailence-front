#!/bin/bash

# as the nginx directory changed, we restart it
front_container=$(docker ps -q --filter name=front)
docker restart $front_container

set -a && source docker.env && set +a
cd ..
export MOZ_REMOTE_SETTINGS_DEVTOOLS=1

./run.sh --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD --db-username=$DB_USERNAME --db-password=$DB_PASSWORD $@
code=$?

back_container=$(docker ps -q --filter name=back)
docker logs $back_container > ./output/back.log
docker logs $front_container > ./output/nginx.log

cd github
docker compose down

if [[ $code -ne 0 ]]; then
  echo "Error during tests: $code"
  exit 1
fi
