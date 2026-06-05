export type POIType = 'guidepost' | 'water' | 'toilets';

export const POI_TYPES: POIType[] = ['guidepost', 'water', 'toilets'];

export interface POI {
  type: POIType;
  pos: L.LatLngLiteral;
  text?: string;
};
