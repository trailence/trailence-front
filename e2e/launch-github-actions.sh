#!/bin/bash

export TRAILENCE_BACK_VERSION="$DOCKER_METADATA_OUTPUT_VERSION"
export IS_CI=1
./_launch.sh
