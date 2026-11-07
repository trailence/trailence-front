export class CachedValue<T> {

  constructor(
    private readonly provider: () => T,
  ) {}

  private _cached?: {value: T};

  public get(): T {
    if (!this._cached) this._cached = {value: this.provider()};
    return this._cached.value;
  }

}
