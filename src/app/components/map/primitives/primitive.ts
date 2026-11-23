import { EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { MapRenderer } from '../impl/map-renderer';
import { Arrays, NestedArray } from '@trailence/utils/arrays';
import { MapUtils } from '../map-utils';
import { combineLatest, Subscription } from 'rxjs';
import { MapPointerEvent } from '../map-events';
import { AppEvent, ReplayAppEvent } from '@trailence/utils/events';

export abstract class MapPrimitive<O, R extends MapRenderer, P extends MapPrimitive<O, R, P>> {

  constructor(
    public readonly id: string,
    options: O,
    public readonly events: MapPrimitiveEvents<O, R, P>,
  ) {
    this.options = {...options};
  }

  public data: any = undefined;

  // --- Options ---

  protected options: O;

  public getOptions(): O { return {...this.options}; }
  public setOptions(options: O): void {
    const previous = this.options;
    this.options = {...options};
    if (this.renderer) this.applyNewOptions(this.renderer, previous);
  }
  protected abstract applyNewOptions(renderer: R, previous: O): void;

  // --- Add and Remove ---

  public getRenderer(): R | undefined { return this.renderer; }

  protected renderer?: R;

  public addToMap(renderer: R): void {
    if (this.renderer !== undefined) throw new Error('Primitive already on map');
    this.renderer = renderer;
    this.addPrimitiveToMap(renderer);
    this.events.addedToMap.trigger(() => ({primitive: this as unknown as P, renderer}));
  }
  protected abstract addPrimitiveToMap(renderer: R): void;

  public removeFromMap(renderer: R): void {
    if (!this.renderer) return;
    if (renderer !== this.renderer) return;
    this.removePrimitiveFromMap(renderer);
    this.events.addedToMap.cancelLatest();
    this.events.removedFromMap.trigger(() => ({primitive: this as unknown as P, renderer}));
    this.renderer = undefined;
  }
  protected abstract removePrimitiveFromMap(renderer: R): void;

}

export class MapPrimitiveEvents<O, R extends MapRenderer, P extends MapPrimitive<O, R, P>> {
  public readonly addedToMap = new ReplayAppEvent<{primitive: P, renderer: R}>();
  public readonly removedFromMap = new AppEvent<{primitive: P, renderer: R}>();
  public readonly click = new AppEvent<{primitive: P, pointerEvent: MapPointerEvent}>();
  public readonly hover = new AppEvent<{primitive: P, pointerEvent: MapPointerEvent | undefined}>();
}

export abstract class MapPrimitiveSinglePosition<O, R extends MapRenderer, P extends MapPrimitiveSinglePosition<O,R,P>> extends MapPrimitive<O, R, P> {

  constructor(
    id: string,
    position: EarthPoint,
    options: O,
    events: MapPrimitiveEvents<O, R, P>,
  ) {
    super(id, options, events);
    this.position = {...position};
    this.events.addedToMap.addListener(event => this.addListenersForMapOffset(event.renderer));
    this.events.removedFromMap.addListener(() => this.removeListenersForMapOffset());
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

export abstract class MapPrimitiveMultiplePositions<O, R extends MapRenderer, P extends NestedArray<EarthPoint>[], PR extends MapPrimitiveMultiplePositions<O,R,P,PR>> extends MapPrimitive<O, R, PR> {

  constructor(
    id: string,
    positions: P,
    options: O,
    events: MapPrimitiveEvents<O, R, PR>,
  ) {
    super(id, options, events);
    this.positions = MapUtils.adjustPointsToAvoidGoingAroundEarth(positions);
    this.events.addedToMap.addListener(event => this.addListenersForMapOffset(event.renderer));
    this.events.removedFromMap.addListener(() => this.removeListenersForMapOffset());
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

export abstract class MapPrimitiveBounds<O, R extends MapRenderer, P extends MapPrimitiveBounds<O,R,P>> extends MapPrimitive<O, R, P> {
  constructor(
    id: string,
    bounds: EarthBBox,
    options: O,
    events: MapPrimitiveEvents<O, R, P>,
  ) {
    super(id, options, events);
    this.bounds = {...bounds};
    this.events.addedToMap.addListener(event => this.addListenersForMapOffset(event.renderer));
    this.events.removedFromMap.addListener(() => this.removeListenersForMapOffset());
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
