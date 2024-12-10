import { Segment } from 'src/app/model/segment';
import { MapTrack } from './map-track';
import { Point } from 'src/app/model/point';
import { SimplifiedPoint } from 'src/app/services/database/track-database';

export class MapTrackPointReference {

  constructor(
    public track: MapTrack,
    public segmentIndex: number | undefined,
    public segment: Segment | undefined,
    public pointIndex: number | undefined,
    public point: Point | SimplifiedPoint | undefined,
    public distanceToEvent: number | undefined,
  ) {}

  public get position(): L.LatLngLiteral | undefined {
    if (this.point === undefined) return undefined;
    if ((this.point as any)['pos']) return (this.point as Point).pos;
    return this.point as SimplifiedPoint;
  }

  public static closest(event: MapTrackPointReference[]): MapTrackPointReference | undefined {
    if (event.length === 0) return undefined;
    if (event.length === 1) return event[0];
    let closest = event[0];
    for (let i = 1; i < event.length; ++i)
      if (event[i].distanceToEvent && (closest.distanceToEvent === undefined || event[i].distanceToEvent! < closest.distanceToEvent))
        closest = event[i];
    return closest;
  }

  public static distanceComparator(r1: MapTrackPointReference, r2: MapTrackPointReference): number {
    if (r1.distanceToEvent === undefined) {
      if (r2.distanceToEvent === undefined) return 0;
      return 1;
    }
    if (r2.distanceToEvent === undefined) return -1;
    return r1.distanceToEvent - r2.distanceToEvent;
  }

}
