#!/bin/bash


./launch_docker.sh &
docker_pid=$!

cd ..
npm ci --no-audit
code=$?
if [[ $code -ne 0 ]]; then
  exit 1
fi

npm run wdio -- --test-only=nothing/

wait -n $docker_pid
code=$?
if [[ $code -ne 0 ]]; then
  exit 1
fi
