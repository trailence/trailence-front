import * as fs from 'node:fs';
import { COUNTRIES, Country } from './countries';

interface GeoJson {
  features: GeoJsonFeature[];
}

interface GeoJsonFeature {
  properties: GeoJsonFeatureProperties;
  geometry: GeoJsonGeometry;
}

interface GeoJsonFeatureProperties {
  SOVEREIGNT: string;
}

type GeoJsonGeometry = Polygon | MultiPolygon;

interface Polygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}


async function generateCountryBorder(country: Country, geoJson: GeoJson) {
  const coordinates: number[][][][] = [];
  for (const feature of geoJson.features) {
    if (feature.properties.SOVEREIGNT !== country.name) continue;
    if (feature.geometry.type === 'MultiPolygon')
      coordinates.push(...feature.geometry.coordinates);
    else
      coordinates.push(feature.geometry.coordinates);
  }
  const exteriorBoundary: number[][][] = [];
  for (const polygon of coordinates) {
    exteriorBoundary.push(polygon[0]);
  }
  fs.writeFileSync('../../src/assets/countries/' + country.code + '.borders.1.json', JSON.stringify(exteriorBoundary));
}


async function downloadData() {
  const response = await globalThis.fetch('https://github.com/martynafford/natural-earth-geojson/raw/refs/heads/master/50m/cultural/ne_50m_admin_0_countries.json');
  if (!response.ok) throw new Error('Cannot download data: ' + response.status);
  return await response.json() as GeoJson;
}

downloadData()
.then(async geoJson => {
  for (const country of COUNTRIES)
    await generateCountryBorder(country, geoJson);
});
