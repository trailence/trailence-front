import { Track } from 'src/app/model/track';

export interface PathRange {
  track: Track;
  startSegmentIndex: number;
  startPointIndex: number;
  endSegmentIndex: number;
  endPointIndex: number;
}
