import { Track } from 'src/app/model/track';
import { OsmWaysTrackPoint } from './match-osm-ways';
import { PointDescriptor } from 'src/app/model/point-descriptor';
import { TrackPointReference } from './types';
import { distance } from '../latlng';

export function buildOsmTrack(baseTrack: Track, osm: OsmWaysTrackPoint[][]): Track {
  const newTrack = baseTrack.newTrack('osm-match');
  for (const osmSegment of osm) {
    const segment = newTrack.newSegment();
    // TODO remove duplicated points, because resolved osm may return the same point consecutively
    let previousOriginalPoint: {reference: TrackPointReference, newTrackIndex: number} | undefined = undefined;
    const points: PointDescriptor[] = [];
    for (const osmPoint of osmSegment) {
      const originalPoint = osmPoint.originalTrackPoint ? baseTrack.getPoint(osmPoint.originalTrackPoint) : undefined;
      const newTrackIndex = points.length;
      points.push({
        pos: osmPoint.osm?.point ?? originalPoint!.pos,
        ele: originalPoint?.ele,
        time: originalPoint?.time,
      });
      // if we have 2 successive referenced points, with only osm points in between
      // there are intermediary points added => resolve elevation and time
      if (osmPoint.originalTrackPoint) {
        if (previousOriginalPoint?.reference.pointIndex === osmPoint.originalTrackPoint.pointIndex - 1 && previousOriginalPoint.newTrackIndex < newTrackIndex - 1)
          resolveElevationAndTime(points, previousOriginalPoint.newTrackIndex, newTrackIndex);
        previousOriginalPoint = {reference: osmPoint.originalTrackPoint, newTrackIndex};
      }
    }
    segment.appendMany(points);
  }
  return newTrack;
}

function resolveElevationAndTime(points: PointDescriptor[], from: number, to: number): void {
  if (to === from + 1) return;
  const fromEle = points[from].ele;
  const toEle = points[to].ele;
  const fromTime = points[from].time;
  const toTime = points[to].time;
  const hasEle = fromEle !== undefined && toEle !== undefined;
  const hasTime = fromTime !== undefined && toTime !== undefined;
  if (!hasEle && !hasTime) return;
  let totalDistance = 0;
  for (let i = from + 1; i <= to; ++i) totalDistance += distance(points[i - 1].pos, points[i].pos);
  if (totalDistance === 0) return;
  let d = 0;
  for (let i = from + 1; i < to; ++i) {
    d += distance(points[i - 1].pos, points[i].pos);
    if (hasEle) {
      points[i].ele ??= fromEle + (d * (toEle - fromEle) / totalDistance);
    }
    if (hasTime) {
      points[i].time ??= fromTime + (d * (toTime - fromTime) / totalDistance);
    }
  }
}
