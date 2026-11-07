export interface TrackMetadataSnapshot {
  uuid: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  distance: number;
  positiveElevation?: number;
  negativeElevation?: number;
  highestAltitude?: number;
  lowestAltitude?: number;
  duration?: number;
  startDate?: number;
  /** [[north, east], [south, west]] */
  bounds?: [[number, number],[number, number]];
  breaksDuration: number;
  estimatedDuration: number;
  localUpdate: number;
}

export function trackBoundsToEarthBBox(bounds: [[number, number],[number, number]]): {minlat: number, maxlat: number, minlng: number, maxlng: number} {
  return {minlat: bounds[1][0], maxlat: bounds[0][0], minlng: bounds[1][1], maxlng: bounds[0][1]};
}

export interface SimplifiedTrackSnapshot {
  uuid: string;
  owner: string;
  points: SimplifiedPoint[];
}
export interface SimplifiedPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: number;
}
