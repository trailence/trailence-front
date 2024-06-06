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
  ) {}

}
