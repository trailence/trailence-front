import { POI } from 'src/app/services/map/poi';
import { TrackWayPoint, TrackWayPointElement } from './track-waypoint';
import { Track } from 'src/app/model/track';
import { WayPointFromTrack } from './waypoints-from-track';
import { distance } from '../latlng';
import { WayPoint } from 'src/app/model/way-point';
import { Point } from 'src/app/model/point';
import { TrackPointReference } from '../track-computed-data/types';
import { BreakPoint } from './breakpoints';

export const GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT = 25;

export class GuidepostWayPoint extends TrackWayPointElement {

  constructor(
    track: Track,
    public readonly poi: POI,
    trackPointReference: TrackPointReference | undefined,
  ) {
    super(track, trackPointReference);
  }

  public static from(wp: TrackWayPoint): GuidepostWayPoint | undefined {
    return wp.elements.find(e => e instanceof GuidepostWayPoint);
  }

  public override getWayPoint(): WayPoint | undefined {
    return undefined;
  }

  public override getPoint(): Point | undefined {
    if (this.nearestTrackPoint === undefined) return undefined;
    return this.track.getPoint(this.nearestTrackPoint);
  }

  public override getPosition(): { lat: number; lng: number; } {
    if (this.nearestTrackPoint === undefined) return this.poi.pos;
    return this.track.getPoint(this.nearestTrackPoint).pos;
  }

  public override getAltitude(): number | undefined {
    return this.getPoint()?.ele;
  }

  public override getBreakDuration(): number {
    return 0;
  }

  public getText(): string {
    return this.poi.text!;
  }

}

export function computeGuidepostsWayPoints(track: Track, pois: POI[], wayPoints: TrackWayPoint[]): boolean {
  pois = pois.filter(poi => poi.text && poi.text.length > 0);
  if (pois.length === 0) return false;
  let changed = false;
  // attach guideposts to way points
  for (const wp of wayPoints) {
    let nearestGuidepost: POI | undefined = undefined;
    let nerestDistance = 0;
    const wpPoint = wp.point;
    if (!wpPoint) continue;
    for (const poi of pois) {
      const distance = wpPoint.pos.distanceTo(poi.pos);
      if (distance < GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT) {
        if (nearestGuidepost === undefined || distance < nerestDistance) {
          nearestGuidepost = poi;
          nerestDistance = distance;
        }
      }
    }
    if (nearestGuidepost) {
      const nearest = wp.nearestTrackPointReference;
      wp.addElement(new GuidepostWayPoint(track, nearestGuidepost, nearest));
      changed = true;
    }
  }
  let previousPoi: POI | undefined;
  let nextIndex = 0;
  for (let si = 0; si < track.segments.length; ++si) {
    const points = track.segments[si].points;
    for (let i = 0; i < points.length; ++i) {
      const point = points[i];
      let wpFound = false;
      for (let wpI = nextIndex; wpI < wayPoints.length; ++wpI) {
        const wp = wayPoints[wpI];
        if (wp.point === point) {
          nextIndex = wpI + 1;
          wpFound = true;
        }
      }
      if (wpFound || wayPoints.some(wp => isWayPointAndDistanceLessThan(wp, GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT, point.pos))) continue;
      const poi = nearest(pois, point.pos);
      if (!poi ||
          previousPoi === poi || (previousPoi && previousPoi.text === poi.text) ||
          wayPoints.some(wp => isWayPointAndDistanceLessThan(wp, GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT + 15, poi.pos))
      ) continue;
      previousPoi = poi;
      let bestDistance = point.pos.distanceTo(poi.pos);
      let index = i;
      for (let j = i + 1; j < points.length; ++j) {
        const d = points[j].pos.distanceTo(poi.pos);
        if (d < bestDistance) {
          bestDistance = d;
          index = j;
        } else if (d > bestDistance) {
          break;
        }
      }
      const guidpost = new GuidepostWayPoint(track, poi, {segmentIndex: si, pointIndex: i})
      const newWp = new TrackWayPoint(guidpost);
      let insertIndex = nextIndex;
      while (insertIndex < wayPoints.length) {
        const r = wayPoints[insertIndex];
        const time = r.time;
        const distance = r.distanceFromDeparture;
        if ((time !== undefined && point.time !== undefined && time < point.time) || (distance && distance < point.distanceFromStart(track))) {
          insertIndex++;
        } else {
          break;
        }
      }
      if (insertIndex === wayPoints.length)
        wayPoints.push(newWp);
      else
        wayPoints.splice(insertIndex, 0, newWp);
      changed = true;
      i = index;
    }
  }
  return changed;
}

function nearest(pois: POI[], pos: L.LatLng): POI | undefined {
  let nearest: POI | undefined = undefined;
  let distance = 0;
  for (const poi of pois) {
    const d = pos.distanceTo(poi.pos);
    if (d < GUIDEPOST_MAX_DISTANCE_FROM_EXISTING_WAYPOINT && (nearest === undefined || d < distance)) {
      nearest = poi;
      distance = d;
    }
  }
  return nearest;
}

function isWayPointAndDistanceLessThan(wp: TrackWayPoint, maxDistance: number, pos: {lat: number, lng: number}): boolean {
  return wp.elements.some(e =>
    (e instanceof WayPointFromTrack && distance(pos, e.wayPoint.point.pos) < maxDistance) ||
    (e instanceof BreakPoint && distance(pos, e.getPoint()!.pos) < maxDistance)
  );
}
