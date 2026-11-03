import { Component, Input, SimpleChanges } from '@angular/core';
import { AbstractComponent, IdGenerator } from '@trailence/utils/component-utils';
import { MapState } from './map-state';
import { MapRendererInitializer } from './impl/map-renderer-initializer';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { MapRenderer } from './impl/map-renderer';
import { MapElement } from './map-element';
import { MapElementsRenderer } from './map-elements-renderer';
import { GeoLocationCursor } from './elements/geo-location-cursor';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  imports: [],
})
export class MapComponent extends AbstractComponent {

  @Input() mapId?: string;
  @Input() elements$?: Observable<MapElement[]>;
  @Input() geolocationCursorEnabled = true;

  readonly _containerId = IdGenerator.generateId('map-');
  private _state?: MapState;
  private _mapInit?: MapRendererInitializer;
  private readonly _map$ = new BehaviorSubject<MapRenderer | undefined>(undefined);
  private readonly _elementsRenderer = new MapElementsRenderer(this.injector, this._map$);

  public get renderer$(): Observable<MapRenderer | undefined> { return this._map$; }

  protected override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['elements$']) {
      if (this.elements$) this._elementsRenderer.setSource({id: 'input', elements$: this.elements$});
      else this._elementsRenderer.removeSource('input');
    }
  }

  protected override initComponent(): void {
    const basicElements: MapElement[] = [];
    if (this.geolocationCursorEnabled) basicElements.push(new GeoLocationCursor(this.injector));
    this._elementsRenderer.setSource({id: 'map-basics', elements$: of(basicElements)});
    if (this.elements$) this._elementsRenderer.setSource({id: 'input', elements$: this.elements$});
    this._state = new MapState(this.mapId);
    this._mapInit = new MapRendererInitializer(this.injector, this._containerId, this._state, this, this._map$);
  }

  protected override destroyComponent(): void {
    this._state?.destroy();
    this._mapInit?.destroy();
    this._elementsRenderer.destroy();
  }

}
