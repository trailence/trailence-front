export class Extension {

  private _version: number;
  private readonly _extension: string;
  private _data: {[key: string]: string};

  constructor(
    version: number,
    extension: string,
    data: {[key: string]: string},
  ) {
    this._extension = extension;
    this._version = version;
    this._data = data;
  }

  public get extension() { return this._extension; }
  public get version() { return this._version; }
  public get data() { return this._data; }
  public set data(value: {[key: string]: string}) { this._data = value; }

  public markAsDeleted(): void {
    this._version = -1;
  }

}
