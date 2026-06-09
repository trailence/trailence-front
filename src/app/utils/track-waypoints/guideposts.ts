import { POI } from 'src/app/services/map/poi';
import { TrackWayPoint, TrackWayPointElement } from './track-waypoint';
import { Track } from 'src/app/model/track';
import { WayPointFromTrack } from './waypoints-from-track';
import { distance } from '../latlng';
import { WayPoint } from 'src/app/model/way-point';
import { Point } from 'src/app/model/point';

export class GuidepostWayPoint extends TrackWayPointElement {

  constructor(
    track: Track,
    public readonly poi: POI,
    segmentIndex: number | undefined,
    pointIndex: number | undefined,
  ) {
    super(track, segmentIndex, pointIndex);
  }

  public static from(wp: TrackWayPoint): GuidepostWayPoint | undefined {
    return wp.elements.find(e => e instanceof GuidepostWayPoint);
  }

  public override getWayPoint(): WayPoint | undefined {
    return undefined;
  }

  public override getPoint(): Point | undefined {
    if (this.nearestSegmentIndex === undefined) return undefined;
    return this.track.segments[this.nearestSegmentIndex].points[this.nearestPointIndex!];
  }

  public override getPosition(): { lat: number; lng: number; } {
    if (this.nearestSegmentIndex === undefined) return this.poi.pos;
    return this.track.segments[this.nearestSegmentIndex].points[this.nearestPointIndex!].pos;
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
      if (distance < 25) {
        if (nearestGuidepost === undefined || distance < nerestDistance) {
          nearestGuidepost = poi;
          nerestDistance = distance;
        }
      }
    }
    if (nearestGuidepost) {
      const nearest = wp.nearestIndex;
      wp.addElement(new GuidepostWayPoint(track, nearestGuidepost, nearest?.segmentIndex, nearest?.pointIndex));
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
      if (wpFound || wayPoints.some(wp => isWayPointAndDistanceLessThan(wp, 25, point.pos))) continue;
      const poi = nearest(pois, point.pos);
      if (!poi ||
          previousPoi === poi || (previousPoi && previousPoi.text === poi.text) ||
          wayPoints.some(wp => isWayPointAndDistanceLessThan(wp, 40, poi.pos))
      ) continue;
      previousPoi = poi;
      let distance = point.pos.distanceTo(poi.pos);
      let index = i;
      for (let j = i + 1; j < points.length; ++j) {
        const d = points[j].pos.distanceTo(poi.pos);
        if (d < distance) {
          distance = d;
          index = j;
        } else if (d > distance) {
          break;
        }
      }
      const guidpost = new GuidepostWayPoint(track, poi, si, i)
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
    if (d < 25 && (nearest === undefined || d < distance)) {
      nearest = poi;
      distance = d;
    }
  }
  return nearest;
}

function isWayPointAndDistanceLessThan(wp: TrackWayPoint, maxDistance: number, pos: {lat: number, lng: number}): boolean {
  return wp.elements.some(e => e instanceof WayPointFromTrack && distance(pos, e.wayPoint.point.pos) < maxDistance);
}
