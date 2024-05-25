import { OwnedDto } from './owned';
import { SegmentDto } from './segment';

export interface TrackDto extends OwnedDto {

  s?: SegmentDto[];

}
