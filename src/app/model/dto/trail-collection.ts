import { TrailCollectionType } from "../trail-collection";
import { OwnedDto } from "./owned";

export interface TrailCollectionDto extends OwnedDto {

    name?: string;
    type?: TrailCollectionType;

}