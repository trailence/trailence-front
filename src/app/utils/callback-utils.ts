export class CompositeOnDone {

  constructor(
    private finalOnDone?: () => void
  ) {}

  private _nb = 0;
  private _done = 0;
  private _started = false;

  public add(): () => void {
    this._nb++;
    return () => this.stepDone();
  }

  private stepDone(): void {
    if (++this._done >= this._nb && this._started) {
      if (this.finalOnDone) this.finalOnDone();
      this.finalOnDone = undefined;
    }
  }

  public start(): void {
    this._started = true;
    if (this._done >= this._nb) {
      if (this.finalOnDone) this.finalOnDone();
      this.finalOnDone = undefined;
    }
  }

}
