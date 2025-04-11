#!/bin/bash

./launch_docker.sh &
docker_pid=$!

cd ..
npm ci --no-audit
code=$?
if [[ $code -ne 0 ]]; then
  echo "Error installing node modules"
  exit 1
fi

echo "Prepare wdio: --preparation $@"
./run.sh --preparation $@

wait -n $docker_pid
code=$?
if [[ $code -ne 0 ]]; then
  echo "Error starting docker"
  exit 1
fi

echo "       --- End of preparation ---"
