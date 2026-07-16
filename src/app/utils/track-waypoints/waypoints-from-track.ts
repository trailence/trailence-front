import { Track } from 'src/app/model/track';
import { TrackWayPoint, TrackWayPointElement } from './track-waypoint';
import { WayPoint } from 'src/app/model/way-point';
import { Arrays } from '../arrays';
import { PointDescriptor } from 'src/app/model/point-descriptor';
import { Point } from 'src/app/model/point';
import { TrackPointReference } from '../track-computed-data/types';

export const MAX_DEPARTURE_ARRIVAL_DISTANCE = 25;

export class WayPointFromTrack extends TrackWayPointElement {
  constructor(
    public readonly wayPoint: WayPoint,
    public isDeparture: boolean,
    public isArrival: boolean,
    public index: number,
    nearestTrackPoint: TrackPointReference,
    track: Track,
    public readonly isComputedOnly: boolean,
    public readonly otherPossibleIndexes: {newIndex: number, segmentIndex: number, pointIndex: number}[] = [],
  ) {
    super(track, nearestTrackPoint);
  }

  public static from(wp: TrackWayPoint): WayPointFromTrack | undefined {
    return wp.elements.find(e => e instanceof WayPointFromTrack);
  }

  public static search(list: TrackWayPoint[], predicate: (wp: WayPointFromTrack) => boolean): WayPointFromTrack | undefined {
    for (const twp of list) {
      const wft = this.from(twp);
      if (wft && predicate(wft)) return wft;
    }
    return undefined;
  }

  public override getWayPoint(): WayPoint | undefined {
    return this.wayPoint;
  }

  public override getPoint(): Point | undefined {
    if (this.nearestTrackPoint === undefined) return undefined;
    return this.track.getPoint(this.nearestTrackPoint);
  }

  public override getPosition(): { lat: number; lng: number; } {
    return this.getPoint()?.pos ?? this.wayPoint.point.pos;
  }

  public override getAltitude(): number | undefined {
    return this.getPoint()?.ele ?? this.wayPoint.point.ele;
  }

  public override getBreakDuration(): number {
    return 0;
  }

  public isDepartureAndArrival(): boolean {
    return this.isDeparture && this.isArrival;
  }
}

export function computeWayPointsFromTrack(track: Track): WayPointFromTrack[] {
  if (!track.departurePoint) return [];
  const wayPoints = track.wayPoints;
  if (wayPoints.length === 0) {
    // just departure / arrival
    const isArrival = track.arrivalPoint!.distanceTo(track.departurePoint.pos) === 0 || (track.arrivalPoint!.distanceTo(track.departurePoint.pos) <= 25 && track.metadata.distance > 25);
    const result = [new WayPointFromTrack(
      new WayPoint(track.departurePoint, '', ''),
      true, isArrival, -1, {segmentIndex: 0, pointIndex: 0}, track, true
    )];
    if (isArrival) return result;
    if (track.arrivalPoint !== track.departurePoint) {
      let segmentIndex = track.segments.length - 1;
      for (; segmentIndex >= 0; --segmentIndex) {
        const pt = track.segments[segmentIndex].arrivalPoint;
        if (pt) break;
      }
      result.push(new WayPointFromTrack(
        new WayPoint(track.arrivalPoint!, '', ''),
        false, true, -1,
        {segmentIndex, pointIndex: track.segments[segmentIndex].points.length - 1},
        track, true
      ));
    }
    return result;
  }
  const eligibles: TrackPointReference[][] = [];
  for (const wp of wayPoints) {
    eligibles.push(findEligiblePoints(wp.point, track));
  }
  while (!allFound(eligibles)) {
    while (removeUnordered(eligibles));
    if (allFound(eligibles)) break;
    // we cannot determine, let's take the first have more than 1 eligible, and keep the first one...
    for (const points of eligibles) {
      if (points.length > 1) {
        points.splice(1, points.length - 1);
        break;
      }
    }
  }
  // we have eligible points, create the computed
  const computed: WayPointFromTrack[] = [];
  for (let i = 0; i < eligibles.length; ++i) {
    computed.push(new WayPointFromTrack(wayPoints[i], false, false, -1, eligibles[i][0], track, false));
  }
  // order them
  computed.sort(TrackWayPointElement.compare);
  // handle departure and arrival
  let departure, arrival;
  const firstKnownIndex = computed.findIndex(c => c.nearestTrackPoint !== undefined);
  if (firstKnownIndex >= 0) {
    const firstKnown = computed[firstKnownIndex];
    if ((firstKnown.nearestTrackPoint?.segmentIndex === 0 && firstKnown.nearestTrackPoint.pointIndex === 0) ||
        (track.departurePoint && track.departurePoint.pos.distanceTo(firstKnown.wayPoint.point.pos) < 25)) {
      // match the departure
      firstKnown.isDeparture = true;
      if (firstKnownIndex > 0) {
        computed.splice(firstKnownIndex, 1);
        computed.splice(0, 0, firstKnown);
      }
      departure = firstKnown;
    }
  }
  const lastKnownIndex = Arrays.findLastIndex(computed, c => c.nearestTrackPoint !== undefined); // NOSONAR
  if (lastKnownIndex >= 0) {
    const lastKnown = computed[lastKnownIndex];
    if ((lastKnown.nearestTrackPoint?.segmentIndex === track.segments.length - 1 && lastKnown.nearestTrackPoint.pointIndex === track.segments.at(-1)!.points.length - 1) ||
        (track.arrivalPoint && track.arrivalPoint.pos.distanceTo(lastKnown.wayPoint.point.pos) <= MAX_DEPARTURE_ARRIVAL_DISTANCE)) {
      // match the arrival
      lastKnown.isArrival = true;
      if (lastKnownIndex < computed.length - 1) {
        computed.splice(lastKnownIndex, 1);
        computed.push(lastKnown);
      }
      arrival = lastKnown;
    }
  }
  if (!departure) {
    if (arrival && track.departurePoint.pos.distanceTo(arrival.wayPoint.point.pos) <= MAX_DEPARTURE_ARRIVAL_DISTANCE) {
      arrival.isDeparture = true;
      const index = computed.indexOf(arrival);
      if (index > 0) {
        computed.splice(index, 1);
        computed.splice(0, 0, arrival);
      }
      departure = arrival;
    } else {
      departure = new WayPointFromTrack(
        new WayPoint(track.departurePoint, '', ''),
        true, !arrival && track.departurePoint.distanceTo(track.arrivalPoint!.pos) <= MAX_DEPARTURE_ARRIVAL_DISTANCE,
        -1, {segmentIndex: 0, pointIndex: 0}, track, true
      );
      computed.splice(0, 0, departure);
      if (departure.isArrival) arrival = departure;
    }
  }
  if (!arrival) {
    if (track.departurePoint.distanceTo(track.arrivalPoint!.pos) <= MAX_DEPARTURE_ARRIVAL_DISTANCE) {
      departure.isArrival = true;
    } else {
      arrival = new WayPointFromTrack(
        new WayPoint(track.arrivalPoint!, '', ''),
        false, true, -1,
        {segmentIndex: track.segments.length - 1, pointIndex: track.segments.at(-1)!.points.length - 1},
        track, true
      );
      computed.push(arrival);
    }
  }
  // add index
  let index = 1;
  for (const c of computed) {
    if (!c.isDeparture && (!c.isArrival || !c.isComputedOnly)) c.index = index++;
  }
  addOtherPossibleIndexes(track, computed);
  return computed;
}

function findEligiblePoints(point: PointDescriptor, track: Track): TrackPointReference[] { // NOSONAR
  const result: TrackPointReference[] = [];
  const p = point.pos;
  const t = point.time;
  let currentBest: Point | undefined = undefined;
  let currentBestIndexes: TrackPointReference | undefined = undefined;
  let globalBestDistance: number | undefined = undefined;
  let globalBestIndexes: TrackPointReference | undefined = undefined;
  const segments = track.segments;
  for (let segmentIndex = 0; segmentIndex < segments.length; ++segmentIndex) {
    const points = segments[segmentIndex].points;
    for (let pointIndex = 0; pointIndex < points.length; ++pointIndex) {
      const pt = points[pointIndex];
      const pos = pt.pos;
      const time = pt.time;
      const distance = pos.distanceTo(p);
      if (globalBestDistance === undefined || distance < globalBestDistance) {
        globalBestDistance = distance;
        globalBestIndexes = {segmentIndex, pointIndex};
      }
      if (t) {
        if (time && time === t) {
          // perfect match on time, take this point except if currentBest is also a perfect match on time and is closer in distance
          if (!currentBest?.time || currentBest.time !== t || currentBest.distanceTo(p) > pos.distanceTo(p)) {
            currentBest = pt;
            currentBestIndexes = {segmentIndex, pointIndex};
          }
          continue;
        }
        // if we have a currentBest before or equals in time, and we are now later, no more to check
        if (currentBest?.time && currentBest.time <= t && time && time > t) {
          return [currentBestIndexes!];
        }
        // if the previous point was before in time, and we are now later, we take the closest
        if (pointIndex > 0 && time) {
          const previous = points[pointIndex - 1];
          if (previous.time && previous.time <= t && time > t) {
            const diff1 = previous.distanceTo(p);
            const diff2 = pos.distanceTo(p);
            return [{segmentIndex, pointIndex: diff1 <= diff2 ? pointIndex - 1 : pointIndex}];
          }
        }
      }
      if (distance > 50) {
        // we are out of 50 meters around
        if (currentBest) {
          result.push(currentBestIndexes!);
          currentBest = undefined;
          currentBestIndexes = undefined;
        }
        continue;
      }
      // we are 50 meters around
      if (!currentBest) {
        currentBest = pt;
        currentBestIndexes = {segmentIndex, pointIndex};
        continue;
      }
      if (distance < currentBest.distanceTo(p)) {
        currentBest = pt;
        currentBestIndexes = {segmentIndex, pointIndex};
      }
    }
    // end of segment, if we have a currentBest, it is eligible
    if (currentBest) {
      result.push(currentBestIndexes!);
      currentBest = undefined;
      currentBestIndexes = undefined;
    }
  }
  // if we have several eligibles, with one having a perfect match, and not the others, keep only the perfect match
  if (result.length > 1) {
    let perfectMatch = undefined;
    let perfectMatchOnTime = false;
    let perfectMatchOnPosition = false;
    for (const match of result) {
      const pt = segments[match.segmentIndex].points[match.pointIndex];
      const isPerfectMatchOnTime = pt.time !== undefined && t !== undefined && pt.time === t;
      const isPerfectMatchOnPosition = pt.pos.lat === p.lat && pt.pos.lng === p.lng;
      if (isPerfectMatchOnTime || isPerfectMatchOnPosition) {
        if (perfectMatch === undefined || (!perfectMatchOnTime && (isPerfectMatchOnTime || (isPerfectMatchOnPosition && !perfectMatchOnPosition)))) {
          perfectMatch = match;
          perfectMatchOnTime = isPerfectMatchOnTime;
          perfectMatchOnPosition = isPerfectMatchOnPosition;
        }
      }
    }
    if (perfectMatch) return [perfectMatch];
  }
  if (result.length === 0) result.push(globalBestIndexes!);
  return result;
}

function allFound(eligibles: {segmentIndex: number; pointIndex: number}[][]): boolean {
  for (const points of eligibles) if (points.length > 1) return false;
  return true;
}

function removeUnordered(eligibles: {segmentIndex: number; pointIndex: number}[][]): boolean { // NOSONAR
  let changed = false;
  for (let i = 0; i < eligibles.length; ++i) {
    const points = eligibles[i];
    if (points.length < 2) continue;
    // more than 1 eligible point, if we have points before all previous, remove them
    if (i > 0 && eligibles[i - 1].length > 0) {
      for (let j = 0; j < points.length; ++j) {
        const p = points[j];
        let beforeCount = 0;
        for (const previous of eligibles[i - 1]) {
          if (p.segmentIndex < previous.segmentIndex || (p.segmentIndex === previous.segmentIndex && p.pointIndex < previous.pointIndex)) {
            beforeCount++;
          } else {
            break;
          }
        }
        if (beforeCount === eligibles[i - 1].length) {
          // this point is before all previous, remove it
          points.splice(j, 1);
          j--;
          changed = true;
          if (points.length === 1) break;
        }
      }
    }
    if (points.length < 2) continue;
    // if we have points after all next, remove them
    if (i < eligibles.length - 1&& eligibles[i + 1].length > 0) {
      for (let j = 0; j < points.length; ++j) {
        const p = points[j];
        let afterCount = 0;
        for (const next of eligibles[i + 1]) {
          if (p.segmentIndex > next.segmentIndex || (p.segmentIndex === next.segmentIndex && p.pointIndex > next.pointIndex)) {
            afterCount++;
          } else {
            break;
          }
        }
        if (afterCount === eligibles[i + 1].length) {
          // this point is after all next, remove it
          points.splice(j, 1);
          j--;
          changed = true;
          if (points.length === 1) break;
        }
      }
    }
  }
  return changed;
}

function addOtherPossibleIndexes(track: Track, list: WayPointFromTrack[]) {
  for (const wp of list) {
    if (wp.index >= 0) addOtherPossibleIndexesFor(track, wp, list);
  }
}

function addOtherPossibleIndexesFor(track: Track, wp: WayPointFromTrack, list: WayPointFromTrack[]) {
  const segments = track.segments;
  let currentBestSi = -1;
  let currentBestPi = -1;
  let currentBestDistance = 0;
  for (let si = 0; si < segments.length; ++si) {
    const segment = segments[si];
    const points = segment.points;
    for (let pi = 0; pi < points.length; ++pi) {
      const point = points[pi];
      const d = point.distanceTo(wp.wayPoint.point.pos);
      if (d < 25) {
        if (currentBestSi === -1 || d < currentBestDistance) {
          currentBestSi = si;
          currentBestPi = pi;
          currentBestDistance = d;
        }
      } else if (currentBestSi !== -1) {
        // area left
        addPossibleIndexFor(wp, list, currentBestSi, currentBestPi);
        currentBestSi = -1;
      }
    }
  }
  if (currentBestSi !== -1) {
    // area left
    addPossibleIndexFor(wp, list, currentBestSi, currentBestPi);
  }
}

function addPossibleIndexFor(wp: WayPointFromTrack, list: WayPointFromTrack[], si: number, pi: number) {
  let maxIndex = 0;
  for (const cwp of list) {
    if (cwp.index < 0) continue;
    if (cwp.index > maxIndex) maxIndex = cwp.index;
    if (cwp.nearestTrackPoint === undefined) continue;
    if (cwp.nearestTrackPoint.segmentIndex > si || cwp.nearestTrackPoint.segmentIndex === si && cwp.nearestTrackPoint.pointIndex >= pi) {
      if (wp === cwp) return;
      if (wp.otherPossibleIndexes.some(i => cwp.index === i.newIndex)) return;
      wp.otherPossibleIndexes.push({newIndex: cwp.index, segmentIndex: si, pointIndex: pi});
      return;
    }
  }
  if (wp.otherPossibleIndexes.some(i => i.newIndex === maxIndex)) return;
  wp.otherPossibleIndexes.push({newIndex: maxIndex, segmentIndex: si, pointIndex: pi});
}
