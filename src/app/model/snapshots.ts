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
  bounds?: L.LatLngTuple[];
  breaksDuration: number;
  estimatedDuration: number;
  localUpdate: number;
}

export interface SimplifiedTrackSnapshot {
  points: SimplifiedPoint[];
}
export interface SimplifiedPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: number;
}
