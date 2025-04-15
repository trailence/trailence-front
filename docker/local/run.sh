#!/bin/bash

docker compose down
cd ../..
npm run build --configuration=production
npm run generate-public-pages
cd www
mkdir nginx
cd ..
npm run generate-local-nginx
cd docker/local
docker compose up -d --wait
