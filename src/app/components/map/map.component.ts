import { Component, Input, SimpleChanges } from '@angular/core';
import { AbstractComponent, IdGenerator } from '@trailence/utils/component-utils';
import { MapState, RotateMode } from './map-state';
import { MapRendererInitializer } from './impl/map-renderer-initializer';
import { BehaviorSubject, firstValueFrom, Observable, of } from 'rxjs';
import { MapRenderer } from './impl/map-renderer';
import { MapElement } from './map-element';
import { MapElementsRenderer } from './map-elements-renderer';
import { createMyGeoLocationCursor } from './elements/geo-location-cursor';
import { MapTool, MapToolGroup } from './map-tool';
import { MapTools } from './map-tools';
import { MapStateHistoryService } from '@trailence/services/map/map-state-history.service';
import { CenterMapOnMyPositionTool, GeolocationToolGroup, ShowMyGeolocationTool } from './tools/geolocation-tools';
import { TraceRecorderService } from '@trailence/services/trace-recorder/trace-recorder.service';
import { projectEarthBBoxForZoom, unprojectToEarthBBoxForZoom } from '@trailence/utils/latlng';
import { bbox2DContainsBBox2D, bbox2DPadding, extendBBox2D } from '@trailence/utils/geometry-utils';

export interface MapOptions {
  geoLocationDisabled?: boolean;
  autoFollowMyPosition?: boolean;
  disableToggleShowPosition?: boolean;
}

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  imports: [],
})
export class MapComponent extends AbstractComponent {

  @Input() mapId?: string;
  @Input() elements$?: Observable<MapElement[]>;
  @Input() options!: MapOptions;
  @Input() tools$?: Observable<{groups?: MapToolGroup[], tools?: MapTool[]}>;

  readonly _containerId = IdGenerator.generateId('map-');
  private _state?: MapState;
  private _mapInit?: MapRendererInitializer;
  private readonly _map$ = new BehaviorSubject<MapRenderer | undefined>(undefined);
  private readonly _elementsRenderer = new MapElementsRenderer(this.injector, this._map$);
  readonly _tools = new MapTools();

  public get renderer$(): Observable<MapRenderer | undefined> { return this._map$; }
  public get renderer(): MapRenderer | undefined { return this._map$.value; }

  public get state(): MapState | undefined { return this._state; }

  public get mapElements$(): Observable<MapElement[]> { return this._elementsRenderer.elements$; }

  protected override onChangesBeforeCheckComponentState(changes: SimpleChanges): void {
    if (changes['elements$']) {
      if (this.elements$) this._elementsRenderer.setSource({id: 'input', elements$: this.elements$});
      else this._elementsRenderer.removeSource('input');
    }
    if (changes['tools$']) {
      this._tools.reset(this.tools$);
    }
  }

  protected override initComponent(): void {
    const basicElements: MapElement[] = [];
    const toolsGroups: MapToolGroup[] = [];
    const tools: MapTool[] = [];
    if (this.options.geoLocationDisabled !== true) {
      basicElements.push(createMyGeoLocationCursor(this.injector));
      toolsGroups.push(GeolocationToolGroup);
      if (this.options.disableToggleShowPosition !== true)
        tools.push(new ShowMyGeolocationTool());
      tools.push(new CenterMapOnMyPositionTool());
    }
    this._elementsRenderer.setSource({id: 'map-basics', elements$: of(basicElements)});
    if (this.elements$) this._elementsRenderer.setSource({id: 'input', elements$: this.elements$});
    this._state = new MapState(this.mapId);
    this._mapInit = new MapRendererInitializer(this.injector, this._containerId, this._state, this, this._map$);
    this.injector.get(MapStateHistoryService).register(this._state, this.visible$);
    this._tools.init(this.whenVisible, this.tools$, this.injector, this, toolsGroups, tools);
  }

  protected override destroyComponent(): void {
    if (this._state)
      this.injector.get(MapStateHistoryService).unregister(this._state);
    this._tools.destroy();
    this._state?.destroy();
    this._mapInit?.destroy();
    this._elementsRenderer.destroy();
  }

  public setRotation(mode: RotateMode, bearing: number | undefined = undefined, animated = false): void {
    if (!this._state) return;
    this._state.rotateMode = mode;
    if (mode === RotateMode.NORTH) bearing = 0;
    else bearing ??= this._state.bearing;
    this._map$.value?.setBearing(bearing, animated);
    const traceRecorder = this.injector.get(TraceRecorderService);
    if (traceRecorder.recording) traceRecorder.setRotateMode(mode);
  }

  public async ensureVisible(element: MapElement, padPixels = 10, flying: boolean = true) {
    const elementBounds = await firstValueFrom(element.fitBounds$);
    if (!elementBounds) return;
    const renderer = this.renderer;
    if (!renderer) return;
    const viewport = renderer.getViewportSize();
    if (!viewport) return;
    const zoom = renderer.mapState.zoom;
    const visibleBox = {
      minX: MAP_INSETS.left,
      minY: MAP_INSETS.top,
      maxX: viewport.x - MAP_INSETS.right,
      maxY: viewport.y - MAP_INSETS.bottom,
    };
    const elementBox = bbox2DPadding(projectEarthBBoxForZoom(elementBounds, zoom), padPixels);
    if (bbox2DContainsBBox2D(visibleBox, elementBox)) return;
    const targetPixelsBox = extendBBox2D(visibleBox, elementBox);
    const targetBounds = unprojectToEarthBBoxForZoom(targetPixelsBox, zoom);
    renderer.fitBounds(targetBounds, flying);
  }

}

export const MAP_INSETS = {
  top: 57,
  bottom: 30,
  left: 47,
  right: 47
};
