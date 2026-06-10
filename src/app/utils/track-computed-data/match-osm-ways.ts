import { Way } from 'src/app/services/map/way';
import { ClosestMatch, ClosestPointOnSegment, closestPointOnSegment, distance, earthBBox, EarthBBox, EarthPoint, findClosestPointOnPath, isPointInBBox } from '../latlng';

export interface OsmWaysTrackPoint {
  originalSegmentIndex?: number;
  originalPointIndex?: number;
  osmWayId?: string;
  osmWayPoint?: EarthPoint;
  distanceMeters?: number;
  osmWayPosition?: OsmWayPosition;
}

export type OsmWayPosition = {type: 'exact', index: number} | {type: 'segment', indexBefore: number, indexAfter: number};

interface PointMatch {
  way: Way;
  closest: ClosestMatch;
  originalPoint: EarthPoint;
}

export function matchOsmWays(segments: EarthPoint[][], ways: Way[]): OsmWaysTrackPoint[][] {
  const t1 = Date.now();
  // way map
  const wayMap = new Map<string, Way>();
  for (const way of ways) wayMap.set(way.id, way);
  const t2 = Date.now();
  console.log('way map in', t2 - t1);
  // match every point with ways
  const matches = matchPoints(segments, ways, wayMap);
  const t3 = Date.now();
  console.log('match points in', t3 - t2);
  // sort points by distance
  for (const segment of matches) for (const point of segment) point.sort((p1, p2) => p1.closest.distanceMeters - p2.closest.distanceMeters);
  const t4 = Date.now();
  console.log('sort in', t4 - t3);
  // resolve ambiguities
  resolveAmbiguities(matches);
  const t5 = Date.now();
  console.log('resolve ambiguities in', t5 - t4);
  // unresolved
  processUnresolved(matches, segments);
  const t6 = Date.now();
  console.log('process unresolved in', t6 - t5);
  // result
  const result: OsmWaysTrackPoint[][] = [];
  for (let si = 0; si < matches.length; ++si) {
    const segment = matches[si];
    const segmentResult: OsmWaysTrackPoint[] = [];
    result.push(segmentResult);
    let previousResolved: PointMatch | undefined = undefined;;
    for (let pi = 0; pi < segment.length; ++pi) {
      const point = segment[pi];
      const resolved: PointMatch | undefined = point[0];
      if (previousResolved && resolved) addOsmPathBetween(segmentResult, previousResolved, resolved, wayMap);
      if (point.length > 1) console.log('unresolved ambiguity', pi, segmentResult.length, point);
      segmentResult.push({
        originalSegmentIndex: si,
        originalPointIndex: pi,
        osmWayId: resolved?.way.id,
        osmWayPoint: resolved?.closest?.point,
        distanceMeters: resolved?.closest?.distanceMeters,
        osmWayPosition: toOsmWayPosition(resolved?.closest)
      });
      previousResolved = resolved;
    }
  }
  const t7 = Date.now();
  console.log('result in', t7 - t6);
  console.log('----------------------------------')
  console.log(result)
  console.log('----------------------------------')
  return result;
}

const MATCH_THRESHOLD = 20;

function matchPoints(segments: EarthPoint[][], ways: Way[], wayMap: Map<string, Way>): PointMatch[][][] {
  const waysSegments = waysToSegments(ways);
  const matches: PointMatch[][][] = [];
  for (const segment of segments) {
    const segmentMatches: PointMatch[][] = [];
    matches.push(segmentMatches);
    for (const point of segment) {
      const pointMatches: PointMatch[] = [];
      segmentMatches.push(pointMatches);

      const matchMap = findClosestPointOnPathSegments(waysSegments, point);
      for (const entry of matchMap.entries()) {
        pointMatches.push({
          way: wayMap.get(entry[0])!,
          closest: closestPointOnSegmentToClosestMatch(entry[1].closest, entry[1].segment),
          originalPoint: point,
        })
      }

      /*
      for (const way of ways) {
        const match = findClosestPointOnPath(way.points, point, MATCH_THRESHOLD);
        if (match) pointMatches.push({closest: match, way});
      }
      */
    }
  }
  return matches
}

export function closestPointOnSegmentToClosestMatch(c: ClosestPointOnSegment, segment: SegmentInfo): ClosestMatch {
  if (c.t <= 1e-9)
    return {
      type: "vertex",
      index: segment.aIndex,
      point: c.point,
      distanceMeters: c.distanceMeters,
    }
  if (c.t >= 1 - 1e-9)
    return {
      type: "vertex",
      index: segment.bIndex,
      point: c.point,
      distanceMeters: c.distanceMeters,
    }
  return {
    type: "segment",
    indexBefore: segment.aIndex,
    indexAfter: segment.bIndex,
    t: c.t,
    point: c.point,
    distanceMeters: c.distanceMeters,
  }
}

interface SegmentInfo {
  way: Way;
  a: EarthPoint;
  b: EarthPoint;
  aIndex: number;
  bIndex: number;
  bbox: EarthBBox;
}

function waysToSegments(ways: Way[]): SegmentInfo[] {
  const segments: SegmentInfo[] = [];
  for (const way of ways) {
    if (way.points.length < 2) continue;
    for (let i = 1; i < way.points.length; ++i) {
      const a = way.points[i - 1];
      const b = way.points[i];
      segments.push({
        way,
        a,
        b,
        aIndex: i - 1,
        bIndex: i,
        bbox: earthBBox(a, b),
      })
    }
  }
  return segments;
}

const metersPerDegreeLat = 111_320;
function findClosestPointOnPathSegments(segments: SegmentInfo[], point: EarthPoint): Map<string, {closest: ClosestPointOnSegment, segment: SegmentInfo}> {
  const metersPerDegreeLng = 111_320 * Math.cos(point.lat * Math.PI / 180);
  const tolerance = { lat: MATCH_THRESHOLD / metersPerDegreeLat, lng: MATCH_THRESHOLD / metersPerDegreeLng };
  const matching = new Map<string, {closest: ClosestPointOnSegment, segment: SegmentInfo}>();
  for (const segment of segments) {
    if (!isPointInBBox(point, segment.bbox, tolerance)) continue;
    const closest = closestPointOnSegment(point, segment.a, segment.b);
    if (!closest || closest.distanceMeters > MATCH_THRESHOLD) continue;
    const previous = matching.get(segment.way.id);
    if (!previous) matching.set(segment.way.id, {segment, closest});
    else if (closest.distanceMeters < previous.closest.distanceMeters) {
      previous.segment = segment;
      previous.closest = closest;
    }
  }
  return matching;
}

interface ResolveResult {
  resolved: number;
  remaining: number;
}

function resolveAmbiguities(matches: PointMatch[][][]) {
  const logStart = 0;
  const logEnd = -1;
  for (let i = logStart; i <= logEnd; ++i) console.log(i, matches[0][i]);

  let result = resolveAmbiguitiesBasedOnNonAmbiguous(matches, true);
  console.log('ambiguities based on non ambiguous', result);
  for (let i = logStart; i <= logEnd; ++i) console.log(i, matches[0][i]);
  if (!result.remaining) return;

  result = resolveAmbiguitiesBasedOnEachSideGoingBackToSameWayInShortDistance(matches, false);
  console.log('ambiguities based on each side going back to same way in short distance, only using non ambiguous sides', result);
  for (let i = logStart; i <= logEnd; ++i) console.log(i, matches[0][i]);
  if (!result.remaining) return;

  result = resolveAmbiguitiesBasedOnNonAmbiguous(matches, false);
  console.log('ambiguities based on non ambiguous, including non best', result);
  for (let i = logStart; i <= logEnd; ++i) console.log(i, matches[0][i]);
  if (!result.remaining) return;

  // when a previous non ambiguous is different from a subsequent non ambiguous, and that both have a node in common, we most probably changed way on that node
  result = resolveAmbiguitiesBasedOnNonAmbiguousChangeOfConnectedWays(matches);
  console.log('ambiguities based on non ambiguous change of connected ways', result);
  for (let i = logStart; i <= logEnd; ++i) console.log(i, matches[0][i]);
  if (!result.remaining) return;

  result = resolveAmbiguitiesBasedImpossibleConnectionThenPossibleConnection(matches);
  console.log('ambiguities based on change of connected ways event with ambiguities', result);
  for (let i = logStart; i <= logEnd; ++i) console.log(i, matches[0][i]);
  if (!result.remaining) return;

  /*
  result = resolveAmbiguitiesBasedOnEachSideGoingBackToSameWayInShortDistance(matches, true);
  console.log('ambiguities based on each side going back to same way in short distance, using also ambiguous sides', result);
  for (let i = 1607; i <= 1618; ++i) console.log(i, matches[0][i]);
  if (!result.remaining) return;
  result = resolveAmbiguitiesBasedOnNonAmbiguous(matches, false);
  console.log('ambiguities based on non ambiguous including non best', result);
  for (let i = 1607; i <= 1618; ++i) console.log(i, matches[0][i]);
  if (!result.remaining) return;
  */
}

/** When a non ambiguous point is found, resolved backward and forward if distance is good */
function resolveAmbiguitiesBasedOnNonAmbiguous(matches: PointMatch[][][], onlyIfBest: boolean): ResolveResult {
  const result: ResolveResult = {resolved: 0, remaining: 0};
  let previousResolved: string | undefined = undefined;
  for (const segment of matches) {
    for (let pi = 0; pi < segment.length; ++pi) {
      const point = segment[pi];
      if (point.length !== 1) {
        result.remaining++;
        continue;
      }
      // no ambiguity here
      const wayId = point[0].way.id;
      // resolve backward
      for (let pi2 = pi - 1; pi2 >= 0; --pi2) {
        const point2 = segment[pi2];
        if (point2.length < 2) break;
        const same = point2.find(m => m.way.id === wayId);
        if (!same) break;
        const previous = previousResolved && previousResolved !== wayId ? point2.find(m => m.way.id === previousResolved) : undefined;
        if (previous && previous.closest.distanceMeters <= same.closest.distanceMeters) break;
        if (onlyIfBest && same !== point2[0]) break;
        segment[pi2] = [same];
        result.remaining--;
        result.resolved++;
      }
      previousResolved = wayId;
      // resolve forward
      for (let pi2 = pi + 1; pi2 < segment.length; pi2++) {
        const point2 = segment[pi2];
        if (point2.length < 2) break;
        if (point2[0].way.id === wayId) {
          // the closest is the same => resolve
          segment[pi2] = [point2[0]];
          result.resolved++;
        }
      }
    }
  }
  return result;
}

function resolveAmbiguitiesBasedOnNonAmbiguousChangeOfConnectedWays(matches: PointMatch[][][]): ResolveResult {
  const result: ResolveResult = {resolved: 0, remaining: 0};
  for (const segment of matches) {
    let previousMatch: PointMatch | undefined = undefined;
    let previousMatchIndex: number | undefined = undefined;
    for (let pi = 0; pi < segment.length; ++pi) {
      const point = segment[pi];
      if (point.length !== 1) {
        result.remaining++;
        continue;
      }
      // no ambiguity here
      const newMatch = point[0];
      if (previousMatch && previousMatch.way.id !== newMatch.way.id) {
        const connectingPoint = getConnectingPoint(previousMatch, newMatch);
        if (connectingPoint) {
          let pi2;
          for (pi2 = pi - 1; pi2 > previousMatchIndex!; --pi2) {
            const point2 = segment[pi2];
            if (point2.length === 0) break;
            const previous = point2.find(e => e.way.id === previousMatch?.way.id);
            const next = point2.find(e => e.way.id === newMatch?.way.id);
            if (previous && (!next || previous.closest.distanceMeters <= next.closest.distanceMeters)) {
              if (segment[pi2].length > 1) {
                segment[pi2] = [previous];
                result.resolved++;
              }
            } else if (next) {
              if (segment[pi2].length > 1) {
                segment[pi2] = [next];
                result.resolved++;
              }
            } else {
              break;
            }
          }
          if (pi2 != previousMatchIndex) {
            // other direction: from previousMatch to pi2
            for (let pi3 = previousMatchIndex! + 1; pi3 < pi2; ++pi3) {
              const point2 = segment[pi3];
              if (point2.length === 0) break;
              const previous = point2.find(e => e.way.id === previousMatch?.way.id);
              const next = point2.find(e => e.way.id === newMatch?.way.id);
              if (previous && (!next || previous.closest.distanceMeters <= next.closest.distanceMeters)) {
                if (segment[pi3].length > 1) {
                  segment[pi3] = [previous];
                  result.resolved++;
                }
              } else if (next) {
                if (segment[pi3].length > 1) {
                  segment[pi3] = [next];
                  result.resolved++;
                }
              } else {
                break;
              }
            }
          }
        }
      }
      previousMatch = newMatch;
      previousMatchIndex = pi;
    }
  }
  return result;
}

function resolveAmbiguitiesBasedImpossibleConnectionThenPossibleConnection(matches: PointMatch[][][]): ResolveResult {
  const result: ResolveResult = {resolved: 0, remaining: 0};
  for (const segment of matches) {
    for (let pi1 = 0; pi1 < segment.length; pi1++) {
      const point1 = segment[pi1];
      if (point1.length === 0) continue;
      if (point1.length > 1) result.remaining++;
      const best1 = point1[0];
      // search next point, being ambiguous, where the best fit is on a way which has no connection with point1
      let nextStrangeIndex: number | undefined = undefined;
      for (let pi2 = pi1 + 1; pi2 < segment.length; ++pi2) {
        const point2 = segment[pi2];
        if (point2.length === 0) continue;
        if (point2.length === 1) break; // next point is non ambiguous => non eligible
        if (!getConnectingPoint(best1, point2[0])) {
          // no connection, seems strange => eligible
          nextStrangeIndex = pi2;
          break;
        }
      }
      if (nextStrangeIndex === undefined) continue;
      // search a next point, not too far, where best fit is a way having a connection to point1
      let nextConnectedIndex: number | undefined = undefined;
      for (let pi2 = nextStrangeIndex + 1; pi2 < segment.length; ++pi2) {
        const point2 = segment[pi2];
        if (point2.length === 0) continue;
        const d = distance(point2[0].closest.point, best1.closest.point);
        if (d > 50) break; // too far
        const connection = getConnectingPoint(best1, point2[0]);
        if (!connection) continue;
        const d1 = distance(best1.closest.point, connection.point);
        const d2 = distance(point2[0].closest.point, connection.point);
        if (d1 + d2 > 60) break; // too far
        nextConnectedIndex = pi2;
        break;
      }
      if (nextConnectedIndex === undefined) continue;
      // we have a connection, which seems better => resolve in between if the distance done is enough similar to the original distance
      const fromWayId = best1.way.id;
      const toWayId = segment[nextConnectedIndex][0].way.id;
      let newDistance = 0;
      let originalDistance = 0;
      let previousPoint = best1.closest.point;
      let previousOriginal = best1.originalPoint;
      for (let pi2 = pi1 + 1; pi2 < nextConnectedIndex; ++pi2) {
        const point2 = segment[pi2];
        if (point2.length === 0) continue;
        const match1 = point2.find(e => e.way.id === fromWayId);
        const match2 = point2.find(e => e.way.id === toWayId);
        let od = distance(previousOriginal, point2[0].originalPoint);
        previousOriginal = point2[0].originalPoint;
        originalDistance += od;
        if (match1 && (!match2 || match1.closest.distanceMeters <= match2.closest.distanceMeters)) {
          newDistance += distance(previousPoint, match1.closest.point);
          previousPoint = match1.closest.point;
        } else if (match2) {
          newDistance += distance(previousPoint, match2.closest.point);
          previousPoint = match2.closest.point;
        } else {
          newDistance += od;
        }
      }
      if (newDistance > originalDistance * 1.5) continue; // too much additional distance
      for (let pi2 = pi1 + 1; pi2 < nextConnectedIndex; ++pi2) {
        const point2 = segment[pi2];
        if (point2.length === 0) continue;
        const match1 = point2.find(e => e.way.id === fromWayId);
        const match2 = point2.find(e => e.way.id === toWayId);
        if (match1 && (!match2 || match1.closest.distanceMeters <= match2.closest.distanceMeters)) {
          if (segment[pi2].length > 1) {
            segment[pi2] = [match1];
            result.resolved++;
          }
        } else if (match2) {
          if (segment[pi2].length > 1) {
            segment[pi2] = [match2];
            result.resolved++;
          }
        }
      }
    }
  }
  return result;
}

function getConnectingPoint(from: PointMatch, to: PointMatch): {point: EarthPoint, indexFrom: number, indexTo: number} | undefined {
  // TODO smarter
  const commonPoints: {point: EarthPoint, indexFrom: number, indexTo: number}[] = [];
  for (let i1 = 0; i1 < from.way.points.length; ++i1) {
    const p1 = from.way.points[i1];
    for (let i2 = 0; i2 < to.way.points.length; ++i2) {
      const p2 = to.way.points[i2];
      if (p1.lat === p2.lat && p1.lng === p2.lng) {
        commonPoints.push({point: p1, indexFrom: i1, indexTo: i2});
      }
    }
  }
  if (commonPoints.length === 0) return undefined;
  let best = commonPoints[0];
  if (commonPoints.length === 1) return best;
  let bestDistance = distance(best.point, from.closest.point) + distance(best.point, to.closest.point);
  for (let i = 1; i < commonPoints.length; ++i) {
    const p = commonPoints[i];
    let d = distance(p.point, from.closest.point) + distance(p.point, to.closest.point);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}

/** When there is an ambiguity on a short distance, and the non ambiguous before and after are the same => we stay on that way
*/
function resolveAmbiguitiesBasedOnEachSideGoingBackToSameWayInShortDistance(matches: PointMatch[][][], allowNonAmbiguous: boolean): ResolveResult {
  // TODO even improve: if closest is quickly not on the same way, but go back on the same, we could consider we stay on the way
  const result: ResolveResult = {remaining: 0, resolved: 0};
  for (const segment of matches) {
    for (let pi = 1; pi < segment.length - 1; ++pi) {
      const point = segment[pi];
      const previous = segment[pi - 1];
      if (point.length > 1) result.remaining++;
      if (point.length > 1 && (previous.length === 1 || allowNonAmbiguous)) {
        // look forward if we go back to previous
        const wayId = previous[0].way.id;
        let same = point.find(p => p.way.id === wayId);
        if (!same) continue;
        const sames: PointMatch[] = [same];
        let d = distance(same.closest.point, previous[0].closest.point);
        if (d > 50) continue;
        let pi2;
        let found = false;
        for (pi2 = pi + 1; pi2 < segment.length; ++pi2) {
          const point2 = segment[pi2];
          if (point2.length === 0) continue;
          if (point2[0].way.id === wayId && (allowNonAmbiguous || point2.length === 1)) {
            found = true;
            break;
          }
          same = point2.find(p => p.way.id === wayId);
          if (!same) break;
          d += distance(same.closest.point, sames.at(-1)!.closest.point);
          if (d > (allowNonAmbiguous ? 50 : 200)) break;
          sames.push(same);
        }
        if (found) {
          result.remaining--; // current one
          for (let i = 0; i < sames.length; ++i) {
            if (segment[pi + i].length > 1) result.resolved++;
            segment[pi + i] = [sames[i]];
          }
        }
      }
    }
  }
  return result;
}

function processUnresolved(matches: PointMatch[][][], original: EarthPoint[][]): void {
  for (let si = 0; si < matches.length; ++si) {
    const segment = matches[si];
    const originalSegment = original[si];
    for (let pi1 = 0; pi1 < segment.length; ++pi1) {
      const point = segment[pi1];
      if (point.length > 0) continue;
      // we have an unresolved point
      // if before and after unresolved points, in a reasonable distance, we were on the same way => let's resolve
      if (pi1 === 0) {
        // TODO the beginning is unresolved
        continue;
      }
      const previousPoint = segment[pi1 - 1];
      if (previousPoint.length === 0) continue;
      const previousMatch = previousPoint[0];
      let pi2: number;
      let point2: PointMatch[] | undefined;
      for (pi2 = pi1 + 1; pi2 < segment.length; ++pi2) {
        point2 = segment[pi2];
        if (point2.length > 0) break;
      }
      if (!point2) {
        // TODO the end is unresolved
        continue;
      }
      const nextMatch = point2[0];
      if (previousMatch.way.id === nextMatch.way.id) {
        const d = distance(nextMatch.closest.point, previousMatch.closest.point);
        if (d > 50) break; // too far
      }
      // let's resolve in between
      for (let pi = pi1; pi < pi2; ++pi) {
        const match = findClosestPointOnPath(previousMatch.way.points, originalSegment[pi], MATCH_THRESHOLD * 2.5);
        if (match)
          segment[pi] = [{
            closest: match,
            originalPoint: originalSegment[pi],
            way: previousMatch.way,
          }];
      }
    }
  }
}

function addOsmPathBetween(path: OsmWaysTrackPoint[], previousMatch: PointMatch, newMatch: PointMatch, ways: Map<string, Way>) {
  if (previousMatch.way.id === newMatch.way.id) {
    addOsmPathBetweenSameWay(path, previousMatch, newMatch, ways.get(previousMatch.way.id)!);
  } else {
    const common = getConnectingPoint(previousMatch, newMatch);
    if (common) {
      const d1 = distance(common.point, previousMatch.closest.point);
      const d2 = distance(common.point, newMatch.closest.point);
      const d3 = distance(previousMatch.closest.point, newMatch.closest.point);
      if (d1 + d2 < d3 * 1.75) { // not too much additional distance
        path.push({
          osmWayId: previousMatch.way.id,
          osmWayPoint: common.point,
          osmWayPosition: {type: 'exact', index: common.indexFrom},
        });
      }
    }
  }
}

function addOsmPathBetweenSameWay(path: OsmWaysTrackPoint[], previousMatch: PointMatch, newMatch: PointMatch, way: Way) {
  if (previousMatch.closest.type === 'vertex') {
    const from = previousMatch.closest.index;
    if (newMatch.closest.type === 'vertex') {
      const to = newMatch.closest.index;
      if (from === to) return; // same point
      const increment = from < to ? 1 : -1;
      if (from + increment === to) // already exactly on path
      addOsmPathBetweenSameWayPoints(path, from + increment, to - increment, way);
    } else {
      const to1 = newMatch.closest.indexBefore;
      const to2 = newMatch.closest.indexAfter;
      if (to1 === from || to2 === from) return; // already going through
      if (to1 < from) {
        if (to2 > from) return; // already going through
        // to is before => going to to2
        addOsmPathBetweenSameWayPoints(path, from - 1, to2, way);
      } else {
        addOsmPathBetweenSameWayPoints(path, from + 1, to1, way);
      }
    }
  } else if (newMatch.closest.type === 'vertex') {
    const to = newMatch.closest.index;
    const from1 = previousMatch.closest.indexBefore;
    const from2 = previousMatch.closest.indexAfter;
    if (from1 === to || from2 === to) return; // already going through
    if (from1 < to) {
      if (from2 > to) return; // already going through
      // from is before => going from from2
      addOsmPathBetweenSameWayPoints(path, from2, to - 1, way);
    } else {
      addOsmPathBetweenSameWayPoints(path, from1, to + 1, way);
    }
  } else {
    const from1 = previousMatch.closest.indexBefore;
    const from2 = previousMatch.closest.indexAfter;
    const to1 = newMatch.closest.indexBefore;
    const to2 = newMatch.closest.indexAfter;
    if (from2 <= to1) addOsmPathBetweenSameWayPoints(path, from2, to1, way);
    else if (from1 >= to2) addOsmPathBetweenSameWayPoints(path, from1, to2, way);
  }
}

function addOsmPathBetweenSameWayPoints(path: OsmWaysTrackPoint[], from: number, to: number, way: Way) {
  const increment = from < to ? 1 : -1;
  let index = from;
  do {
    path.push({
      osmWayId: way.id,
      osmWayPoint: way.points[index],
      osmWayPosition: {type: 'exact', index},
    });
    if (index === to) return;
    index += increment;
  } while (index > 0 && index < way.points.length);
}

function toOsmWayPosition(match: ClosestMatch | undefined): OsmWayPosition | undefined {
  if (!match) return undefined;
  if (match.type === 'vertex') return {type: 'exact', index: match.index};
  return {type: 'segment', indexBefore: match.indexBefore, indexAfter: match.indexAfter};
}
