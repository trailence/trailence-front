import { EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { MapRenderer } from '../impl/map-renderer';
import { Arrays, NestedArray } from '@trailence/utils/arrays';
import { MapUtils } from '../map-utils';
import { combineLatest, Subscription } from 'rxjs';

export abstract class MapPrimitive<O, R extends MapRenderer> {

  constructor(
    public readonly id: string,
    options: O,
  ) {
    this.options = {...options};
  }

  protected options: O;

  public getOptions(): O { return {...this.options}; }
  public setOptions(options: O): void {
    const previous = this.options;
    this.options = {...options};
    if (this.renderer) this.applyNewOptions(this.renderer, previous);
  }
  protected abstract applyNewOptions(renderer: R, previous: O): void;

  protected renderer?: R;
  protected onAddListeners: ((renderer: R) => void)[] = [];
  protected onRemoveListeners: ((renderer: R) => void)[] = [];

  public addToMap(renderer: R): void {
    if (this.renderer !== undefined) throw new Error('Primitive already on map');
    this.renderer = renderer;
    this.addPrimitiveToMap(renderer);
    for (const listener of this.onAddListeners) listener(renderer);
  }
  protected abstract addPrimitiveToMap(renderer: R): void;

  public removeFromMap(renderer: R): void {
    if (!this.renderer) return;
    if (renderer !== this.renderer) return;
    this.removePrimitiveFromMap(renderer);
    for (const listener of this.onRemoveListeners) listener(renderer);
    this.renderer = undefined;
  }
  protected abstract removePrimitiveFromMap(renderer: R): void;

  public addListenerOnAdded(listener: (renderer: R) => void): void {
    if (this.renderer) listener(this.renderer);
    else this.onAddListeners.push(listener);
  }

  public removeListenerOnAdded(listener: (renderer: R) => void): void {
    const index = this.onAddListeners.indexOf(listener);
    if (index >= 0) this.onAddListeners.splice(index, 1);
  }

  public addListenerOnRemoved(listener: (renderer: R) => void): void {
    this.onRemoveListeners.push(listener);
  }

  public removeListenerOnRemoved(listener: (renderer: R) => void): void {
    const index = this.onRemoveListeners.indexOf(listener);
    if (index >= 0) this.onRemoveListeners.splice(index, 1);
  }
}

export abstract class MapPrimitiveSinglePosition<O, R extends MapRenderer> extends MapPrimitive<O, R> {

  constructor(
    id: string,
    position: EarthPoint,
    options: O,
  ) {
    super(id, options);
    this.position = {...position};
    this.addListenerOnAdded(renderer => this.addListenersForMapOffset(renderer));
    this.addListenerOnRemoved(() => this.removeListenersForMapOffset());
  }

  protected position: EarthPoint;

  public setPosition(position: EarthPoint): void {
    this.position = {...position};
    if (this.renderer) {
      this.position = this.renderer.getPointWithOffset(this.position);
      this.applyNewPosition(this.renderer);
    }
  }
  protected abstract applyNewPosition(renderer: R): void;

  private mapOffsetSubscription?: Subscription;
  private addListenersForMapOffset(renderer: R): void {
    this.mapOffsetSubscription = combineLatest([renderer.mapState.zoom$, renderer.mapState.center$])
    .subscribe(() => {
      const p = renderer.getPointWithOffset(this.position);
      if (p.lat !== this.position.lat || p.lng !== this.position.lng) {
        this.position = p;
        this.applyNewPosition(renderer);
      }
    });
  }
  private removeListenersForMapOffset(): void {
    this.mapOffsetSubscription?.unsubscribe();
    this.mapOffsetSubscription = undefined;
  }

}

export abstract class MapPrimitiveMultiplePositions<O, R extends MapRenderer, P extends NestedArray<EarthPoint>[]> extends MapPrimitive<O, R> {

  constructor(
    id: string,
    positions: P,
    options: O,
  ) {
    super(id, options);
    this.positions = MapUtils.adjustPointsToAvoidGoingAroundEarth(positions);
    this.addListenerOnAdded(renderer => this.addListenersForMapOffset(renderer));
    this.addListenerOnRemoved(() => this.removeListenersForMapOffset());
  }

  protected positions: P;

  public setPositions(positions: P): void {
    this.positions = MapUtils.adjustPointsToAvoidGoingAroundEarth(positions);
    if (this.renderer) this.applyNewPositions(this.renderer);
  }
  protected abstract applyNewPositions(renderer: R): void;

  private mapOffsetSubscription?: Subscription;
  private addListenersForMapOffset(renderer: R): void {
    this.mapOffsetSubscription = combineLatest([renderer.mapState.zoom$, renderer.mapState.center$])
    .subscribe(() => {
      const firstPoint = Arrays.firstElement(this.positions) as (EarthPoint | undefined);
      if (!firstPoint) return;
      const p = renderer.getPointWithOffset(firstPoint);
      if (p.lat !== firstPoint.lat || p.lng !== firstPoint.lng) {
        const offset = {lat: firstPoint.lat - p.lat, lng: firstPoint.lng - p.lng};
        Arrays.forEach(this.positions, (point: EarthPoint) => {
          return {replace: {lat: point.lat + offset.lat, lng: point.lng + offset.lng, ele: point.ele} as EarthPoint};
        });
        this.applyNewPositions(renderer);
      }
    });
  }
  private removeListenersForMapOffset(): void {
    this.mapOffsetSubscription?.unsubscribe();
    this.mapOffsetSubscription = undefined;
  }

}

export abstract class MapPrimitiveBounds<O, R extends MapRenderer> extends MapPrimitive<O, R> {
  constructor(
    id: string,
    bounds: EarthBBox,
    options: O,
  ) {
    super(id, options);
    this.bounds = {...bounds};
    this.addListenerOnAdded(renderer => this.addListenersForMapOffset(renderer));
    this.addListenerOnRemoved(() => this.removeListenersForMapOffset());
  }

  protected bounds: EarthBBox;

  public setBounds(bounds: EarthBBox): void {
    this.bounds = {...bounds};
    if (this.renderer) {
      this.applyMapOffset(this.renderer);
      this.applyNewBounds(this.renderer);
    }
  }
  private applyMapOffset(renderer: R): boolean {
    const topLeft = renderer.getPointWithOffset({lat: this.bounds.minlat, lng: this.bounds.minlng});
    if (topLeft.lat !== this.bounds.minlat || topLeft.lng !== this.bounds.minlng) {
      this.bounds = {
        minlat: topLeft.lat,
        minlng: topLeft.lng,
        maxlat: topLeft.lat + (this.bounds.maxlat - this.bounds.minlat),
        maxlng: topLeft.lng + (this.bounds.maxlng - this.bounds.minlng),
      }
      return true;
    }
    return false;
  }
  protected abstract applyNewBounds(renderer: R): void;

  private mapOffsetSubscription?: Subscription;
  private addListenersForMapOffset(renderer: R): void {
    this.mapOffsetSubscription = combineLatest([renderer.mapState.zoom$, renderer.mapState.center$])
    .subscribe(() => {
      if (this.applyMapOffset(renderer))
        this.applyNewBounds(renderer);
    });
  }
  private removeListenersForMapOffset(): void {
    this.mapOffsetSubscription?.unsubscribe();
    this.mapOffsetSubscription = undefined;
  }

}
