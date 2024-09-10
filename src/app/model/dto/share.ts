export interface ShareDto {

  id: string;
  name: string;
  from: string;
  to: string;
  type: ShareElementType;
  createdAt: number;
  elements: string[] | null | undefined;
  trails: string[] | null | undefined;
  toLanguage: string | null | undefined;
  includePhotos: boolean | null | undefined;
}

export enum ShareElementType {
  COLLECTION = 'COLLECTION',
  TAG = 'TAG',
  TRAIL = 'TRAIL',
}
