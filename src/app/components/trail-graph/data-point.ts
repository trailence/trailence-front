export interface DataPoint {
  x: number;
  y: number | null;
  segmentIndex: number;
  pointIndex: number;
  time?: number;
  timeSinceStart?: number;
  timeSinceLastSpeed: number;
  lat: number;
  lng: number;
  ele?: number;
  distanceMeters: number;
  distanceFromPrevious: number;
  distanceSinceLastSpeed: number;
  grade: {gradeBefore: number | undefined; gradeAfter: number | undefined};
  eleAccuracy?: number;
  posAccuracy?: number;
  speedInMeters: number;
  isBreakPoint?: boolean;
  estimatedSpeed?: number;
  originalDataIndex?: number;
}
