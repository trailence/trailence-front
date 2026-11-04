import { Component, Input, SimpleChanges } from '@angular/core';
import { AbstractComponent, IdGenerator } from '@trailence/utils/component-utils';
import { MapState } from './map-state';
import { MapRendererInitializer } from './impl/map-renderer-initializer';
import { BehaviorSubject, combineLatest, Observable, of, switchMap, tap } from 'rxjs';
import { MapRenderer } from './impl/map-renderer';
import { MapElement } from './map-element';
import { MapElementsRenderer } from './map-elements-renderer';
import { GeoLocationCursor } from './elements/geo-location-cursor';
import { MapTool } from './map-tool';
import { MenuItem } from '../menus/menu-item';
import { ZoomInTool, ZoomLevelLabel, ZoomOutTool } from './tools/zoom-tools';
import { combineLatestSafe } from '@trailence/utils/rxjs/combineLatestSafe';

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
  @Input() tools$?: Observable<MapTool[]>;

  readonly _containerId = IdGenerator.generateId('map-');
  private _state?: MapState;
  private _mapInit?: MapRendererInitializer;
  private readonly _map$ = new BehaviorSubject<MapRenderer | undefined>(undefined);
  private readonly _elementsRenderer = new MapElementsRenderer(this.injector, this._map$);

  _leftTools: MenuItem[] = [];
  _rightTools: MenuItem[] = [];
  _topTools: MenuItem[] = [];

  public get renderer$(): Observable<MapRenderer | undefined> { return this._map$; }
  public get renderer(): MapRenderer | undefined { return this._map$.value; }

  public get state(): MapState | undefined { return this._state; }

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
    this.initTools();
  }

  protected override destroyComponent(): void {
    this._state?.destroy();
    this._mapInit?.destroy();
    this._elementsRenderer.destroy();
  }

  private initTools(): void {
    this.whenVisible.subscribe(
      (this.tools$ ?? of([])).pipe(
        switchMap(inputTools => {
          const leftTools: MapTool[] = [];
          const rightTools: MapTool[] = [];
          const topTools: MapTool[] = [];
          for (const tool of [...baseTools, ...inputTools]) {
            switch (tool.pane) {
              case 'left': leftTools.push(tool); break;
              case 'right': rightTools.push(tool); break;
              case 'top': topTools.push(tool); break;
            }
          }
          leftTools.sort(toolOrderComparator);
          rightTools.sort(toolOrderComparator);
          topTools.sort(toolOrderComparator);
          return combineLatest([
            combineLatestSafe(leftTools.map(t => t.createMenuItem$(this.injector, this))).pipe(tap(tools => this._leftTools = tools)),
            combineLatestSafe(rightTools.map(t => t.createMenuItem$(this.injector, this))).pipe(tap(tools => this._rightTools = tools)),
            combineLatestSafe(topTools.map(t => t.createMenuItem$(this.injector, this))).pipe(tap(tools => this._topTools = tools)),
          ]);
        }),
      ),
      () => {
        this.changesDetection.detectChanges();
      }
    );
  }

}

const baseTools: MapTool[] = [
  new ZoomInTool(),
  new ZoomLevelLabel(),
  new ZoomOutTool(),
];

function toolOrderComparator(t1: MapTool, t2: MapTool): number {
  return t1.order - t2.order;
}
