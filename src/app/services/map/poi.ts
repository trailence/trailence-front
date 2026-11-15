import { EarthPoint } from '@trailence/utils/latlng';

export type POIType = 'guidepost' | 'water' | 'toilets';

export const POI_TYPES: POIType[] = ['guidepost', 'water', 'toilets'];

export interface POI {
  type: POIType;
  pos: EarthPoint;
  text?: string;
};
