import { OwnedDto } from './owned';

export interface TrailDto extends OwnedDto {

  name?: string;
  description?: string;

  originalTrackUuid?: string;
  currentTrackUuid?: string;
  collectionUuid?: string;

}
