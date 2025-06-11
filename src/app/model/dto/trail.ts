import { OwnedDto } from './owned';

export interface TrailDto extends OwnedDto {

  name?: string;
  description?: string;
  location?: string;
  loopType?: string;
  activity?: string;
  sourceType?: string;
  source?: string;
  sourceDate?: number;

  originalTrackUuid?: string;
  currentTrackUuid?: string;
  collectionUuid?: string;

}

export enum TrailSourceType {
  TRAILENCE_RECORDER = 'trailence_recorder',
  TRAILENCE_PLANNER = 'trailence_planner',
  FILE_IMPORT = 'file',
  EXTERNAL = 'external',
}
