import { OwnedDto } from './owned';

export interface TagDto extends OwnedDto {

    name?: string;
    collectionUuid?: string;
    parentUuid?: string;

}