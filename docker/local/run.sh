#!/bin/bash

docker compose down
rm -f -r context
mkdir context

cd ../..
npm run build --configuration=production
npm run generate-public-pages
npm run generate-local-nginx
cd docker/local
cp ../nginx.conf ./context

docker compose up -d --build --pull always --wait
