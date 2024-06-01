import { Segment } from 'src/app/model/segment';
import { MapTrack } from './map-track';
import { Point } from 'src/app/model/point';

export class MapTrackPointReference {

  constructor(
    public track: MapTrack,
    public segmentIndex: number,
    public segment: Segment,
    public pointIndex: number,
    public point: Point,
  ) {}

}
