#!/bin/bash

echo Cleaning...
rm -rf ./output || true
mkdir ./output
rm -rf ./tmp-data || true
mkdir ./tmp-data

npm run demo $@
