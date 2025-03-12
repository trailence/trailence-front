export interface ShareDto {

  uuid: string;
  owner: string;
  version: number;
  createdAt: number;
  updatedAt: number;

  recipients: string[];
  type: ShareElementType;
  name: string;
  includePhotos: boolean | null | undefined;

  elements: string[] | null | undefined;
  trails: string[] | null | undefined;
  mailLanguage: string | null | undefined;
}

export enum ShareElementType {
  COLLECTION = 'COLLECTION',
  TAG = 'TAG',
  TRAIL = 'TRAIL',
}
