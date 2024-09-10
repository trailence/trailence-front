import { OwnedDto } from './owned';

export interface PhotoDto extends OwnedDto {

  trailUuid: string;
  description: string;
  dateTaken?: number;
  latitude?: number;
  longitude?: number;
  isCover: boolean;
  index: number;

}
