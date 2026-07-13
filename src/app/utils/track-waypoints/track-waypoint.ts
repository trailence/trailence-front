import { Track } from 'src/app/model/track';
import { WayPoint } from 'src/app/model/way-point';
import { Point } from 'src/app/model/point';
import { IdGenerator } from '../component-utils';
import { TrackPointReference } from '../track-computed-data/types';

export class TrackWayPoint {

  constructor(firstElement: TrackWayPointElement) {
    this.elements.push(firstElement);
  }

  public readonly id = IdGenerator.generateId();
  public readonly elements: TrackWayPointElement[] = [];
  public estimatedTimeSinceStart: number | undefined = undefined;

  public addElement(element: TrackWayPointElement) {
    this.elements.push(element);
  }

  public get nearestTrackPointReference(): TrackPointReference | undefined {
    for (const element of this.elements) if (element.nearestTrackPoint !== undefined) return element.nearestTrackPoint;
    return undefined;
  }

  public get point(): Point | undefined {
    for (const element of this.elements) {
      const p = element.getPoint();
      if (p) return p;
    }
    return undefined;
  }

  public get position(): {lat: number, lng: number} {
    return this.elements[0]!.getPosition();
  }

  public get altitude(): number | undefined {
    for (const element of this.elements) {
      const a = element.getAltitude();
      if (a !== undefined) return a;
    }
    return undefined;
  }

  public get time(): number | undefined {
    return this.point?.time;
  }

  public get durationSinceDeparture(): number | undefined {
    return this.point?.durationFromStart(this.elements[0]!.track);
  }

  public getDurationFromDepartureWithoutBreaks(wayPoints: TrackWayPoint[]): number | undefined {
    const duration = this.durationSinceDeparture;
    if (duration === undefined) return undefined;
    let breaks = 0;
    for (const wp of wayPoints) {
      if (wp === this) return duration - breaks;
      for (const e of wp.elements) breaks += e.getBreakDuration();
    }
    return duration - breaks;
  }

  public get distanceFromDeparture(): number | undefined {
    return this.point?.distanceFromStart(this.elements[0]!.track);
  }

}

export abstract class TrackWayPointElement {
  constructor(
    public readonly track: Track,
    public readonly nearestTrackPoint: TrackPointReference | undefined,
  ) {}

  public abstract getWayPoint(): WayPoint | undefined;

  public abstract getPoint(): Point | undefined;

  public abstract getPosition(): {lat: number, lng: number};

  public abstract getAltitude(): number | undefined;

  public abstract getBreakDuration(): number;

  public static compare(e1: TrackWayPointElement, e2: TrackWayPointElement): number {
    // first by position in the track
    if (e1.nearestTrackPoint !== undefined && e2.nearestTrackPoint !== undefined) {
      if (e1.nearestTrackPoint.segmentIndex < e2.nearestTrackPoint.segmentIndex) return -1;
      if (e1.nearestTrackPoint.segmentIndex > e2.nearestTrackPoint.segmentIndex) return 1;
      if (e1.nearestTrackPoint.pointIndex < e2.nearestTrackPoint.pointIndex) return -1;
      if (e1.nearestTrackPoint.pointIndex > e2.nearestTrackPoint.pointIndex) return 1;
    }
    // then by position in waypoints
    const wp1 = e1.getWayPoint();
    if (wp1) {
      const wp2 = e2.getWayPoint();
      if (wp2) {
        const index1 = e1.track.wayPoints.indexOf(wp1);
        const index2 = e1.track.wayPoints.indexOf(wp2);
        return index1 - index2;
      }
    }
    // then ?
    return 0;
  }
}
