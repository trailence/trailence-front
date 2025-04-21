import { OwnedDto } from "./owned";

export enum TrailCollectionType {
  MY_TRAILS = 'MY_TRAILS',
  CUSTOM = 'CUSTOM',
}

export interface TrailCollectionDto extends OwnedDto {

    name?: string;
    type?: TrailCollectionType;

}
