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

  readonly containerId = IdGenerator.generateId('map-');
  private state?: MapState;
  private mapInit?: MapRendererInitializer;
  private readonly map$ = new BehaviorSubject<MapRenderer | undefined>(undefined);
  private readonly elementsRenderer = new MapElementsRenderer(this.injector, this.map$);

  protected override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['elements$']) {
      if (this.elements$) this.elementsRenderer.setSource({id: 'input', elements$: this.elements$});
      else this.elementsRenderer.removeSource('input');
    }
  }

  protected override initComponent(): void {
    const basicElements: MapElement[] = [];
    if (this.geolocationCursorEnabled) basicElements.push(new GeoLocationCursor(this.injector));
    this.elementsRenderer.setSource({id: 'map-basics', elements$: of(basicElements)});
    if (this.elements$) this.elementsRenderer.setSource({id: 'input', elements$: this.elements$});
    this.state = new MapState(this.mapId);
    this.mapInit = new MapRendererInitializer(this.injector, this.containerId, this.state, this, this.map$);
  }

  protected override destroyComponent(): void {
    this.state?.destroy();
    this.mapInit?.destroy();
    this.elementsRenderer.destroy();
  }

}
