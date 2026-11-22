export class CachedValue<T> {

  constructor(
    private readonly provider: () => T,
  ) {}

  private _cached?: {value: T};

  public get(): T {
    this._cached ??= {value: this.provider()};
    return this._cached.value;
  }

  public invalidate(): void {
    this._cached = undefined;
  }

}
