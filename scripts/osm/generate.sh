#!/bin/bash

set -euo pipefail

OUTDIR="$1"
TMPDIR="$2"

PLANET_URL="https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf"
PLANET_FILE="$OUTDIR/planet.osm.pbf"
HIGHWAYS_WITH_NODES="$OUTDIR/highways_with_nodes.osm.pbf"
HIGHWAYS_WITHOUT_NODES="$OUTDIR/highways_without_nodes.osm.pbf"
ROUTES="$OUTDIR/routes.osm.pbf"

if [ ! -f "$PLANET_FILE" ]; then
  echo "Downloading data from OSM to $PLANET_FILE..."
  wget -c -O "$PLANET_FILE" "$PLANET_URL"
fi

if [ ! -d "$OUTDIR/guidepost" ]; then
  echo "Generating guidepost..."
  osmium tags-filter "$PLANET_FILE" n/information=guidepost n/tourism=information -f opl,add_metadata=false -o - | node --import=tsx ./src/generate.ts --type=guidepost --dir=$OUTDIR/guidepost
fi

if [ ! -d "$OUTDIR/toilets" ]; then
  echo "Generating toilets..."
  osmium tags-filter "$PLANET_FILE" n/amenity=toilets -f opl,add_metadata=false -o - | node --import=tsx ./src/generate.ts --type=toilets --dir=$OUTDIR/toilets
fi

if [ ! -d "$OUTDIR/drinking_water" ]; then
  echo "Generating drinking water..."
  osmium tags-filter "$PLANET_FILE" n/amenity=drinking_water -f opl,add_metadata=false -o - | node --import=tsx ./src/generate.ts --type=drinking_water --dir=$OUTDIR/drinking_water
fi

if [ ! -f "$HIGHWAYS_WITH_NODES" ]; then
  echo "Extracting highways with nodes..."
  osmium tags-filter "$PLANET_FILE" w/highway -o "$HIGHWAYS_WITH_NODES"
fi

if [ ! -d "$TMPDIR/nodes" ]; then
  echo "Indexing nodes for ways..."
  mkdir $TMPDIR || true
  osmium cat "$HIGHWAYS_WITH_NODES" -f opl,add_metadata=false -o - | node --import=tsx ./src/indexing/index-nodes.ts --out=$TMPDIR/nodes
fi

if [ ! -f "$HIGHWAYS_WITHOUT_NODES" ]; then
  echo "Extracting highways without nodes..."
  osmium tags-filter "$HIGHWAYS_WITH_NODES" w/highway -R -o "$HIGHWAYS_WITHOUT_NODES"
fi

if [ ! -d "$OUTDIR/ways" ]; then
  echo "Generating ways with index..."
  osmium cat "$HIGHWAYS_WITHOUT_NODES" -f opl,add_metadata=false -o - | node --max-old-space-size=4096 --import=tsx ./src/indexing/generate-ways.ts --nodesIndexDir=$TMPDIR/nodes --waysIndexDir=$TMPDIR/ways --waysTilesDir=$OUTDIR/ways
fi

if [ ! -f "$ROUTES" ]; then
  echo "Extracting routes..."
  osmium tags-filter "$PLANET_FILE" r/route -R -o "$ROUTES"
fi

if [ ! -d "$OUTDIR/routes" ]; then
  echo "Generating routes..."
  osmium cat "$ROUTES" -f opl,add_metadata=false -o - | node --max-old-space-size=4096 --import=tsx ./src/indexing/generate-routes.ts --waysIndexDir=$TMPDIR/ways --waysTilesDir=$OUTDIR/ways --routesDir=$OUTDIR/routes
fi

if [ ! -d "$OUTDIR/ways-split" ]; then
  echo "Splitting ways tiles..."
  node --import=tsx ./src/split.ts --src=$OUTDIR/ways --dst=$OUTDIR/ways-split --max=1000
fi
