import { OwnedDto } from './owned';

export interface TrailDto extends OwnedDto {

  name?: string;
  description?: string;
  location?: string;
  date?: number;
  loopType?: string;
  activity?: string;
  sourceType?: string;
  source?: string;
  sourceDate?: number;
  followedUuid?: string;
  followedOwner?: string;
  followedUrl?: string;

  originalTrackUuid?: string;
  currentTrackUuid?: string;
  collectionUuid?: string;

  publishedFromUuid?: string;
  publicationMessageFromAuthor?: string;
  publicationMessageFromModerator?: string;

}

export enum TrailSourceType {
  TRAILENCE_RECORDER = 'trailence_recorder',
  TRAILENCE_PLANNER = 'trailence_planner',
  FILE_IMPORT = 'file',
  EXTERNAL = 'external',
}
