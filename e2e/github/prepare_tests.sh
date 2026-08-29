#!/bin/bash

# fake nginx initial content
mkdir ../../www || true
mkdir ../../www/browser || true
echo wait > ../../www/browser/index.html

./launch_docker.sh &
docker_pid=$!

cd ..
npm ci --no-audit --ignore-scripts
code=$?
if [[ $code -ne 0 ]]; then
  echo "Error installing node modules"
  exit 1
fi

echo "Prepare wdio: --preparation $@"
./run.sh --preparation $@

echo "Waiting for artifact to be ready"
./github/wait_artifact.sh prepare-e2e-web-app 120 3

echo "Waiting for docker env to be ready"
wait -n $docker_pid
code=$?
if [[ $code -ne 0 ]]; then
  echo "Error starting docker"
  exit 1
fi

echo "Removing temporary nginx files"
rm ../www/browser/index.html
rmdir ../www/browser
rmdir ../www

echo "       --- End of preparation ---"
