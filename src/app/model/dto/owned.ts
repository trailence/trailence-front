import { VersionedDto } from "./versioned";

export interface OwnedDto extends VersionedDto {
    owner: string;
}

export interface VersionDto {
  uuid: string;
  owner: string;
  version: number;
}
