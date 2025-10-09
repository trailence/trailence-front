import { ChangeDetectorRef, NgZone } from '@angular/core';

export class ChangesDetection {

  constructor(
    private readonly ngZone: NgZone,
    private readonly angularDetector: ChangeDetectorRef
  ) {}

  private paused = false;
  private detectionRequested = false;
  private detectionTimeout: any;
  private destroyed = false;
  private listeners: (() => void)[] = [];

  public pause(): void {
    if (this.paused || this.destroyed) return;
    this.paused = true;
    if (this.detectionTimeout) {
      this.ngZone.runOutsideAngular(() => clearTimeout(this.detectionTimeout));
      this.detectionTimeout = undefined;
      this.detectionRequested = true;
    }
  }

  public resume(): void {
    if (!this.paused || this.destroyed) return;
    this.paused = false;
    if (this.detectionRequested) {
      this.detectionRequested = false;
      this.detectChanges();
    }
  }

  public detectChanges(listener?: () => void): void {
    if (this.destroyed) return;
    if (listener) this.listeners.push(listener);
    if (this.paused) {
      this.detectionRequested = true;
      return;
    }
    if (this.detectionTimeout) return;
    this.detectionTimeout = this.ngZone.runOutsideAngular(() => setTimeout(() => {
      this.detectionTimeout = undefined;
      if (this.destroyed) return;
      const listeners = this.listeners;
      this.listeners = [];
      this.ngZone.run(() => this.angularDetector.detectChanges());
      for (const listener of listeners) listener();
    }, 0));
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.detectionTimeout) this.ngZone.runOutsideAngular(() => clearTimeout(this.detectionTimeout));
  }

}
