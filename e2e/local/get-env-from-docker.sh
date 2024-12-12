#!/bin/bash

DOCKER_CONTAINER=$(docker ps | grep "trailence-e2e-back" | awk '{print $1}')
export TRAILENCE_INIT_PASSWORD=$(docker inspect $DOCKER_CONTAINER | grep TRAILENCE_INIT_PASSWORD | awk -F'=' '{print $2}' | awk -F'"' '{print $1}')
export TRAILENCE_INIT_USER=$(docker inspect $DOCKER_CONTAINER | grep TRAILENCE_INIT_USER | awk -F'=' '{print $2}' | awk -F'"' '{print $1}')
echo "Initial user is $TRAILENCE_INIT_USER with password $TRAILENCE_INIT_PASSWORD"
/bin/bash
