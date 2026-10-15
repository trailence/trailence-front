import { OwnedDto } from './owned';

export interface PhotoDto extends OwnedDto {

  trailUuid: string;
  description: string;
  dateTaken?: number;
  dateTakenTzOffset?: number;
  latitude?: number;
  longitude?: number;
  cover: boolean;
  index: number;

}
