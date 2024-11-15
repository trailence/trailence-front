#!/bin/bash
cd .. && npm run wdio -- --trailence-init-username=$TRAILENCE_INIT_USER --trailence-init-password=$TRAILENCE_INIT_PASSWORD --test-only=$1
