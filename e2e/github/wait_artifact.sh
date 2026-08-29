#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_NAME="$1"
TIMEOUT_SECONDS="${2:-120}"
INTERVAL_SECONDS="${3:-5}"

start=$(date +%s)

while true; do
    if gh api \
        "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?name=${ARTIFACT_NAME}" \
        --jq '.artifacts[] | select(.expired == false)' \
        | grep -q .; then

        echo "Artifact '$ARTIFACT_NAME' is ready."
        exit 0
    fi

    elapsed=$(( $(date +%s) - start ))

    if (( elapsed >= TIMEOUT_SECONDS )); then
        echo "::error::Timed out waiting for artifact '$ARTIFACT_NAME' after ${TIMEOUT_SECONDS}s"
        exit 1
    fi

    echo "Artifact '$ARTIFACT_NAME' not ready yet (${elapsed}s elapsed)..."
    sleep "$INTERVAL_SECONDS"
done
