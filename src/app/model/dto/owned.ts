import { VersionedDto } from "./versioned";

export interface OwnedDto extends VersionedDto {
    owner: string;
}