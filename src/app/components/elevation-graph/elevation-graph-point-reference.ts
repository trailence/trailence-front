import { Track } from 'src/app/model/track';

export class ElevationGraphPointReference {

  constructor(
    public track: Track,
    public segmentIndex: number,
    public pointIndex: number,
    public pos: L.LatLngLiteral,
    public ele: number | undefined,
    public time: number | undefined,
    public dataIndex: number,
    public x: number,
    public y: number,
  ) {}

}
