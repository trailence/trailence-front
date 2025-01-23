import { OwnedDto } from './owned';
import { SegmentDto } from './segment';
import { WayPointDto } from './way-point';

export interface TrackDto extends OwnedDto {

  s?: SegmentDto[];
  wp?: WayPointDto[];
  sizeUsed?: number;

}
