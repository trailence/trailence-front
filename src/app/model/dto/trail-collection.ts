import { OwnedDto } from "./owned";

export enum TrailCollectionType {
  MY_TRAILS = 'MY_TRAILS',
  CUSTOM = 'CUSTOM',
  PUB_DRAFT = 'PUB_DRAFT',
  PUB_SUBMIT = 'PUB_SUBMIT',
  PUB_REJECT = 'PUB_REJECT',
}

export function isPublicationCollection(type?: TrailCollectionType) {
  return type === TrailCollectionType.PUB_DRAFT || type === TrailCollectionType.PUB_SUBMIT || type === TrailCollectionType.PUB_REJECT;
}

export function isPublicationLockedCollection(type?: TrailCollectionType) {
  return type === TrailCollectionType.PUB_SUBMIT || type === TrailCollectionType.PUB_REJECT;
}

export interface TrailCollectionDto extends OwnedDto {

    name?: string;
    type?: TrailCollectionType;

}
