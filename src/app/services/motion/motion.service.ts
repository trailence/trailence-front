import { Injectable } from '@angular/core';
import { first, Observable } from 'rxjs';

export type OptionalPoint3D = {x: number | undefined, y: number | undefined, z: number | undefined} | undefined;
export type MotionEvent = {acceleration: OptionalPoint3D, rotationRate: OptionalPoint3D};

@Injectable({providedIn: 'root'})
export class MotionService {

  constructor() {
    this._bearingAvailable = 'undefined' !== typeof globalThis.DeviceOrientationEvent;
    if (this._bearingAvailable && 'undefined' === typeof (DeviceMotionEvent as any).requestPermission) {
      this.bearing$.pipe(first()).subscribe();
    }
  }

  private readonly _bearingListener = (event: DeviceOrientationEvent) => {
    let angle = (event as any).webkitCompassHeading ?? event.alpha ?? undefined;
    if (angle !== undefined) {
      // Safari iOS
      if (!event.absolute && (event as any).webkitCompassHeading !== undefined) {
          angle = 360 - angle;
      }

      let deviceOrientation = 0;
      // Older browsers
      if (!event.absolute && 'undefined' !== typeof window.orientation) {
          deviceOrientation = window.orientation;
      } else if (globalThis.screen?.orientation) {
        deviceOrientation = globalThis.screen.orientation.angle ?? 0;
      }
      angle = angle - deviceOrientation;
    }

    const bearing = angle ?? null;
    this._latestBearing = bearing;
    if (bearing === null) this._bearingAvailable = false;
    const listeners = [...this._bearingListeners];
    for (const listener of listeners) listener(bearing);
  };
  private readonly _motionListener = (event: DeviceMotionEvent) => {
    const motion: MotionEvent = {
      acceleration: event.acceleration ? {
        x: event.acceleration.x ?? undefined,
        y: event.acceleration.y ?? undefined,
        z: event.acceleration.z ?? undefined,
      } : undefined,
      rotationRate: event.rotationRate ? {
        x: event.rotationRate.beta ?? undefined,
        y: event.rotationRate.gamma ?? undefined,
        z: event.rotationRate.alpha ?? undefined,
      } : undefined,
    };
    if (!motion.acceleration && !motion.rotationRate) return;
    this._latestMotion = motion;
    const listeners = [...this._motionListeners];
    for (const listener of listeners) listener(motion);
  };

  private _bearingAvailable: boolean;
  private _bearingStarted = false;
  private _motionStarted = false;

  private readonly _bearingListeners: ((bearing: number | null) => void)[] = [];
  private readonly _motionListeners: ((motion: MotionEvent) => void)[] = [];

  private _latestBearing: number | undefined | null;
  private _latestMotion: MotionEvent | undefined;

  public get bearingMayBeAvailable(): boolean {
    return this._bearingAvailable;
  }

  public get motionMayBeAvailable(): boolean {
    return 'undefined' !== typeof globalThis.DeviceMotionEvent;
  }

  public readonly bearing$ = new Observable<number | null>(subscriber => {
    return this.listenBearing(bearing => {
      subscriber.next(bearing);
    });
  });

  public readonly motion$ = new Observable<MotionEvent>(subscriber => {
    return this.listenMotion(motion => {
      subscriber.next(motion);
    });
  });

  public listenBearing(listener: (bearing: number | null) => void): () => void {
    if (this._latestBearing !== undefined)
      listener(this._latestBearing);
    this._bearingListeners.push(listener);
    this.startBearing();
    return () => {
      const index = this._bearingListeners.indexOf(listener);
      if (index < 0) return;
      this._bearingListeners.splice(index, 1);
      this.stopBearing();
    };
  }

  public listenMotion(listener: (motion: MotionEvent) => void): () => void {
    if (this._latestMotion !== undefined)
      listener(this._latestMotion);
    this._motionListeners.push(listener);
    this.startMotion();
    return () => {
      const index = this._motionListeners.indexOf(listener);
      if (index < 0) return;
      this._motionListeners.splice(index, 1);
      this.stopMotion();
    };
  }

  private startBearing(): void {
    if (this._bearingStarted || this._bearingListeners.length === 0) return;
    this._bearingStarted = true;
    const permission = DeviceOrientationEvent && (DeviceOrientationEvent as any).requestPermission ? (DeviceOrientationEvent as any).requestPermission() as Promise<string> : Promise.resolve('granted');
    permission.then(permissionResult => {
      if (permissionResult !== 'granted') {
        this._bearingStarted = false;
      }
      if (!this._bearingStarted) return;
      const eventName = 'ondeviceorientationabsolute' in globalThis ? 'deviceorientationabsolute' : 'deviceorientation';
      globalThis.addEventListener(eventName, this._bearingListener);
    });
  }

  private stopBearing(): void {
    if (!this._bearingStarted || this._bearingListeners.length > 0) return;
    const eventName = 'ondeviceorientationabsolute' in globalThis ? 'deviceorientationabsolute' : 'deviceorientation';
    globalThis.removeEventListener(eventName, this._bearingListener);
    this._bearingStarted = false;
    this._latestBearing = undefined;
  }

  private startMotion(): void {
    if (this._motionStarted || this._motionListeners.length === 0) return;
    this._motionStarted = true;
    const permission = DeviceMotionEvent && (DeviceMotionEvent as any).requestPermission ? (DeviceMotionEvent as any).requestPermission() as Promise<string> : Promise.resolve('granted');
    permission.then(permissionResult => {
      if (permissionResult !== 'granted') {
        this._motionStarted = false;
      }
      if (!this._motionStarted) return;
      globalThis.addEventListener('devicemotion', this._motionListener);
    });
  }

  private stopMotion(): void {
    if (!this._motionStarted || this._motionListeners.length > 0) return;
    globalThis.removeEventListener('devicemotion', this._motionListener);
    this._motionStarted = false;
    this._latestMotion = undefined;
  }

}
