import { VersionedDto } from "./dto/versioned";

export const VERSION_DELETED_LOCALLY = -1;
export const VERSION_CREATED_LOCALLY = 0;

export class Versioned {

  private _uuid: string;
  private _version: number;

  constructor(
    dto: Partial<VersionedDto>,
  ) {
    this._uuid = dto?.uuid ?? window.crypto.randomUUID();
    this._version = dto?.version ?? 0;
  }

  public get uuid() { return this._uuid; }
  public get version() { return this._version; }

  public isDeletedLocally(): boolean { return this._version === VERSION_DELETED_LOCALLY; }
  public isCreatedLocally(): boolean { return this._version === VERSION_CREATED_LOCALLY; }
  public isSavedOnServerAndNotDeletedLocally(): boolean { return this._version > 0; }

  public markAsDeletedLocally(): void {
    this._version = VERSION_DELETED_LOCALLY;
  }

  public toDto(): VersionedDto {
    return {
      uuid: this._uuid,
      version: this._version,
    }
  }

}
