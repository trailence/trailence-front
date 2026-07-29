#!/bin/bash

echo Cleaning...
rm -rf ./output || true
mkdir ./output
rm -rf ./tmp-data || true
mkdir ./tmp-data

echo "Creating user if needed..."
node --import=tsx ./scripts/init_demo.ts --trailence-username=demo@trailence.org --trailence-password=thisisdemo --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD

echo "Launching demo..."
npm run demo $@

echo "Next step: check screen shots, then npm run deploy_demo --ssversion=x"
