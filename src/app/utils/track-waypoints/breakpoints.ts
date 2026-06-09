import { Track } from 'src/app/model/track';
import { ComputedPreferences } from 'src/app/services/preferences/preferences';
import { detectLongBreaksFromTrack } from 'src/app/services/track-edition/time/break-detection';
import { TrackUtils } from '../track-utils';
import { TrackWayPoint, TrackWayPointElement } from './track-waypoint';
import { WayPoint } from 'src/app/model/way-point';
import { Segment } from 'src/app/model/segment';
import { Point } from 'src/app/model/point';

export class BreakPoint extends TrackWayPointElement {

  constructor(
    track: Track,
    segmentIndex: number,
    pointIndex: number,
    public readonly isBreak: boolean,
    public readonly isPause: boolean,
    public readonly isResume: boolean,
    public readonly isPauseResume: boolean,
    public readonly duration: number,
  ) {
    super(track, segmentIndex, pointIndex);
  }

  public static from(wp: TrackWayPoint): BreakPoint | undefined {
    return wp.elements.find(e => e instanceof BreakPoint);
  }

  public override getWayPoint(): WayPoint | undefined {
    return undefined;
  }

  public override getPoint(): Point | undefined {
    return this.track.segments[this.nearestSegmentIndex!].points[this.nearestPointIndex!];
  }

  public override getPosition(): { lat: number; lng: number; } {
    return this.getPoint()!.pos;
  }

  public override getAltitude(): number | undefined {
    return this.getPoint()!.ele;
  }

  public override getBreakDuration(): number {
    return this.duration;
  }

}

export function computeBreakPoints(track: Track, prefs: ComputedPreferences): BreakPoint[] {
  const breaks = detectLongBreaksFromTrack(track, prefs.longBreakMinimumDuration, prefs.longBreakMaximumDistance);
  const result: BreakPoint[] = [];
  for (const b of breaks) {
    const segment = track.segments[b.segmentIndex];
    const point = segment.points[b.pointIndex];
    const duration = TrackUtils.durationBetween(segment.points[Math.max(0, b.startIndex - 1)], segment.points[Math.min(segment.points.length - 1, b.endIndex + 1)]);
    result.push(new BreakPoint(track, b.segmentIndex, b.pointIndex, true, false, false, false, duration));
  }
  let previous: Segment | undefined;
  let previousIndex = -1;
  const segments = track.segments;
  for (let si = 0; si < segments.length; ++si) {
    const segment = segments[si];
    if (segment.points.length < 2) continue;
    if (previous !== undefined) {
      const distance = segment.departurePoint!.distanceTo(previous.arrivalPoint!.pos);
      const duration = TrackUtils.durationBetween(previous.arrivalPoint!, segment.departurePoint!);
      if (distance > 15) {
        result.push(
          new BreakPoint(track, previousIndex, previous.points.length - 1, false, true, false, false, duration),
          new BreakPoint(track, si, 0, false, false, true, false, duration)
        );
      } else {
        result.push(new BreakPoint(track, si, 0, false, false, false, true, duration));
      }
    }
    previous = segment;
    previousIndex = si;
  }
  return result;
}
