import { Segment } from 'src/app/model/segment';
import { MapTrack } from './map-track';
import { Point } from 'src/app/model/point';
import { SimplifiedPoint } from 'src/app/services/database/track-database';

export class MapTrackPointReference {

  constructor(
    public track: MapTrack,
    public segmentIndex: number | undefined,
    public segment: Segment | undefined,
    public pointIndex: number,
    public point: Point | SimplifiedPoint,
    public distanceToEvent: number,
  ) {}

  public get position(): L.LatLngLiteral {
    return this.point instanceof Point ? this.point.pos : this.point;
  }

  public static closest(event: MapTrackPointReference[]): MapTrackPointReference | undefined {
    if (event.length === 0) return undefined;
    if (event.length === 1) return event[0];
    let closest = event[0];
    for (let i = 1; i < event.length; ++i)
      if (event[i].distanceToEvent < closest.distanceToEvent)
        closest = event[i];
    return closest;
  }

}
