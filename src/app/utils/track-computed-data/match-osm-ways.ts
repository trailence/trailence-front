import { Way } from 'src/app/services/map/way';
import { ClosestMatch, EarthPoint, findClosestPointOnPath } from '../latlng';

export interface OsmWaysTrackPoint {
  originalSegmentIndex: number | undefined;
  originalPointIndex: number | undefined;
  osmWayId: string | undefined;
  osmWayPoint: EarthPoint | undefined;
  distanceMeters: number | undefined;
  osmWayPosition: OsmWayPosition | undefined;
}

export type OsmWayPosition = {type: 'exact', index: number} | {type: 'segment', indexBefore: number, indexAfter: number};

interface PointMatch {
  way: Way;
  closest: ClosestMatch;
}

export function matchOsmWays(segments: {lat: number, lng: number}[][], ways: Way[]): OsmWaysTrackPoint[][] {
  // match every point with ways
  const matches: PointMatch[][][] = [];
  for (const segment of segments) {
    const segmentMatches: PointMatch[][] = [];
    matches.push(segmentMatches);
    for (const point of segment) {
      const pointMacthes: PointMatch[] = [];
      segmentMatches.push(pointMacthes);
      for (const way of ways) {
        const match = findClosestPointOnPath(way.points, point, 20);
        if (match) pointMacthes.push({closest: match, way});
      }
    }
  }
  // resolve ambiguities
  let previousResolved: string | undefined = undefined;
  for (const segment of matches) {
    for (let pi = 0; pi < segment.length; ++pi) {
      const point = segment[pi];
      if (point.length === 1) {
        // no ambiguity here
        const wayId = point[0].way.id;
        // resolve backward
        for (let pi2 = pi - 1; pi2 >= 0; --pi2) {
          const point2 = segment[pi2];
          if (point2.length === 1) break;
          const same = point2.find(m => m.way.id === wayId);
          const previous = previousResolved ? point2.find(m => m.way.id === previousResolved) : undefined;
          if (same) {
            if (previous && previous.closest.distanceMeters <= same.closest.distanceMeters) break;
            segment[pi2] = [same];
          }
        }
        previousResolved = wayId;
      }
    }
  }
  console.log('--------------------------------------------');
  console.log();
  console.log(matches);
  console.log();
  console.log('--------------------------------------------');
  const result: OsmWaysTrackPoint[][] = [];
  // TODO improve by adding points from osm
  for (let si = 0; si < matches.length; ++si) {
    const segment = matches[si];
    const segmentResult: OsmWaysTrackPoint[] = [];
    result.push(segmentResult);
    for (let pi = 0; pi < segment.length; ++pi) {
      const point = segment[pi];
      const resolved: PointMatch | undefined = point[0];
      segmentResult.push({
        originalSegmentIndex: si,
        originalPointIndex: pi,
        osmWayId: resolved?.way.id,
        osmWayPoint: resolved?.closest?.point,
        distanceMeters: resolved?.closest?.distanceMeters,
        osmWayPosition: toOsmWayPosition(resolved?.closest)
      });
    }
  }
  return result;
}

function toOsmWayPosition(match: ClosestMatch | undefined): OsmWayPosition | undefined {
  if (!match) return undefined;
  if (match.type === 'vertex') return {type: 'exact', index: match.index};
  return {type: 'segment', indexBefore: match.indexBefore, indexAfter: match.indexAfter};
}
