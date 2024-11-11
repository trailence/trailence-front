import { VersionedDto } from "./dto/versioned";

export const VERSION_DELETED_LOCALLY = -1;
export const VERSION_CREATED_LOCALLY = 0;

export class Versioned {

  private readonly _uuid: string;
  private _version: number;
  private readonly _createdAt: number;
  private _updatedAt: number;

  constructor(
    dto: Partial<VersionedDto>,
  ) {
    this._uuid = dto?.uuid ?? window.crypto.randomUUID();
    this._version = dto?.version ?? 0;
    this._createdAt = dto?.createdAt ?? Date.now();
    this._updatedAt = dto?.updatedAt ?? this._createdAt;
  }

  public get uuid() { return this._uuid; }
  public get version() { return this._version; }
  public get createdAt() { return this._createdAt; }
  public get updatedAt() { return this._updatedAt; }
  public set updatedAt(value: number) { this._updatedAt = value; }

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
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    }
  }

}
