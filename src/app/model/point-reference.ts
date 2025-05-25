import { Track } from './track';

export class PointReference {
  constructor(
    public readonly track: Track,
    public readonly segmentIndex: number,
    public readonly pointIndex: number,
  ) {}

  public get point() {
    return this.track.segments[this.segmentIndex].points[this.pointIndex];
  }
}

export class RangeReference {
  constructor(
    public readonly start: PointReference,
    public readonly end: PointReference,
  ) {}

  public get track(): Track { return this.start.track; }

  public createSubTrack(): Track {
    return this.track.subTrack(this.start.segmentIndex, this.start.pointIndex, this.end.segmentIndex, this.end.pointIndex);
  }
}
