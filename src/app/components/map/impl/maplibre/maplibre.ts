import { addProtocol, MapLibreMap, MapMouseEvent, RasterDEMSourceSpecification, RasterSourceSpecification, setWorkerUrl, SourceSpecification } from 'maplibre-gl';
import { MapRenderer, MapRendererType } from '../map-renderer';
import { CircleOptions } from '../../primitives/circle';
import { MapLibreCircle } from './primitives/circle';
import { MapLibrePrimitive } from './primitives/primitive';
import { MapPrimitive } from '../../primitives/primitive';
import { EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { PolylineOptions } from '../../primitives/polyline';
import { MapLibrePolyline } from './primitives/polyline';
import { Point2D } from '@trailence/utils/geometry-utils';
import { SvgBoundsOptions } from '../../primitives/svg';
import { MapLibreSvgBounds } from './primitives/svg';
import { MapLibreUtils } from './maplibre-utils';
import { IconOptions, IconPrimitive } from '../../primitives/icon';
import { MapLibreIcon } from './primitives/icon';
import { environment } from '@env/environment';
import { assetsDependencies } from '@trailence/assets-dependencies';
import { MapPointerEvent } from '../../map-events';
import { AssetsService } from '@trailence/services/assets/assets.service';
import { RotateMode } from '../../map-state';
import { TRAILENCE_PROTOCOL } from './map-layer-protocol';
import { MapLayersService } from '@trailence/services/map/map-layers.service';
import { MapLayer } from '@trailence/services/map/layers/map-layer';
import { AbstractComponent, IdGenerator } from '@trailence/utils/component-utils';
import { Subscriptions } from '@trailence/utils/rxjs/subscription-utils';

setWorkerUrl(environment.assetsUrl + '/' + assetsDependencies['maplibre-gl-worker']);
addProtocol('trailence', (params, abortController) => TRAILENCE_PROTOCOL.handleRequest(params, abortController));

export const RASTER_SOURCE = 'rasterSource';
export const RASTER_LAYER = 'rasterLayer';
export const HILLS_SOURCE = 'hillsSource';
export const HILLS_LAYER = 'hillsLayer';
export const TERRAIN_SOURCE = 'terrainSource';

export class MapLibre extends MapRenderer {

  private map?: MapLibreMap;
  private readonly _id = IdGenerator.generateId();
  private readonly subscriptions = new Subscriptions();

  public override get type(): MapRendererType { return 'maplibre'; }

  public getMaplibreMap(): MapLibreMap | undefined { return this.map; }

  public override async init(mapComponent: AbstractComponent) {
    this.injector.get(AssetsService).loadCss(assetsDependencies['maplibre-gl-css']);
    const layersService = this.injector.get(MapLayersService);
    return new Promise(resolve => {
      let layer = layersService.getLayerOrDefault('raster', this.mapState.tilesName);
      const dem = layersService.getDefaultLayer('raster-dem');
      const sources: {[_: string]: SourceSpecification} = {};
      sources[RASTER_SOURCE] = this.getRasterSource(layer);
      sources[HILLS_SOURCE] = this.getRasterDemSource(dem);
      sources[TERRAIN_SOURCE] = this.getRasterDemSource(dem);
      this.map = new MapLibreMap({
        container: this.containerId,
        center: this.mapState.center,
        zoom: this.mapState.zoom,
        bearing: this.mapState.bearing,
        pitch: 60,
        style: {
          version: 8,
          sources,
          layers: [
              {
                  id: RASTER_LAYER,
                  type: 'raster',
                  source: RASTER_SOURCE,
              },
              {
                  id: HILLS_LAYER,
                  type: 'hillshade',
                  source: HILLS_SOURCE,
                  layout: {visibility: 'visible'},
                  paint: {'hillshade-shadow-color': '#473B24'}
              }
          ],
          terrain: {
              source: TERRAIN_SOURCE,
              exaggeration: 1
          },
          sky: {},
        },
      });
      const map = this.map;
      TRAILENCE_PROTOCOL.registerMap(this._id, this.injector, map, mapComponent.visible$);
      map.on('move', () => this.mapState.center = map.getCenter());
      map.on('zoom', () => this.mapState.zoom = map.getZoom());
      map.on('rotate', e => {
        if (e.originalEvent) {
          // done by user
          this.mapState.rotateMode = RotateMode.CUSTOM;
        }
        this.mapState.bearing = map.getBearing();
      });
      map.on('click', e => this.events.click.trigger(() => this.toMapPointerEvent(e)));
      map.on('style.load', () => {
        resolve(true);
        this.subscriptions.add(this.mapState.tilesName$.subscribe(name => {
          const newLayer = layersService.getLayerOrDefault('raster', name);
          if (newLayer === layer) return;
          layer = newLayer;
          map.removeLayer(RASTER_LAYER);
          map.removeSource(RASTER_SOURCE);
          map.addSource(RASTER_SOURCE, this.getRasterSource(layer));
          map.addLayer({
            id: RASTER_LAYER,
            type: 'raster',
            source: RASTER_SOURCE,
          });
        }));
      });
    });
  }

  private getRasterSource(layer: MapLayer): RasterSourceSpecification {
    return {
      type: 'raster',
      tiles: ['trailence://' + this._id + '/' + layer.name + '/{x}/{y}/{z}'],
      tileSize: layer.tileSize * layer.tileResolution,
      attribution: layer.attribution,
      minzoom: Math.max(1, layer.minZoom),
      maxzoom: layer.maxZoom,
    }
  }

  private getRasterDemSource(layer: MapLayer): RasterDEMSourceSpecification {
    return {
      type: 'raster-dem',
      tiles: ['trailence://' + this._id + '/' + layer.name + '/{x}/{y}/{z}'],
      tileSize: layer.tileSize * layer.tileResolution,
      attribution: layer.attribution,
      minzoom: Math.max(1, layer.minZoom),
      maxzoom: layer.maxZoom,
      encoding: layer.demEncoding,
    }
  }

  protected override destroyMap(): void {
    this.subscriptions.unsubscribe();
    TRAILENCE_PROTOCOL.unregisterMap(this._id);
    this.map?.remove();
  }

  public override bringToFront(primitive: MapPrimitive<any, MapRenderer>): void {
    (primitive as unknown as MapLibrePrimitive).getLayersIds().forEach(id => this.map!.moveLayer(id));
  }

  public override getBounds(): EarthBBox | undefined {
    return this.map ? MapLibreUtils.fromMapLibreBounds(this.map.getBounds()) : undefined;
  }
  public override fitBounds(bounds: EarthBBox, flying: boolean): this {
    this.map?.fitBounds(MapLibreUtils.toMapLibreBounds(bounds), {animate: flying});
    return this;
  }

  public override goTo(center: EarthPoint, zoom: number | undefined, flying: boolean): void {
    if (flying) this.map?.flyTo({center, zoom});
    else this.map?.jumpTo({center, zoom});
  }

  public override getMinZoom(): number {
    return this.map?.getMinZoom() ?? 1;
  }
  public override getMaxZoom(): number {
    return this.map?.getMaxZoom() ?? 1;
  }
  public override zoomIn(): void {
    this.map?.zoomIn();
  }
  public override zoomOut(): void {
    this.map?.zoomOut();
  }

  public override setBearing(bearing: number, animate: boolean): void {
    this.map?.setBearing(bearing); // TODO animate ??
  }

  public override createCircle(id: string, position: EarthPoint, options: CircleOptions) {
    return new MapLibreCircle(id, position, options);
  }

  public override createPolyline(id: string, positions: EarthPoint[][], options: PolylineOptions) {
    return new MapLibrePolyline(id, positions, options);
  }

  public override createSvgBounds(id: string, bounds: EarthBBox, svg: string | SVGSVGElement, options: SvgBoundsOptions) {
    return new MapLibreSvgBounds(id, bounds, svg, options);
  }

  public override createIcon(id: string, position: EarthPoint, options: IconOptions): IconPrimitive<any> {
    return new MapLibreIcon(id, position, options);
  }

  public override getViewportSize(): Point2D | undefined {
    const container = this.map?.getContainer();
    if (!container) return undefined;
    return {x: container.clientWidth, y: container.clientHeight};
  }

  public override projectToViewport(point: EarthPoint): Point2D {
    return this.map!.project(point);
  }

  public override unprojectFromViewport(point: Point2D): EarthPoint {
    return this.map!.unproject([point.x, point.y]);
  }

  public override getPointWithOffset(point: EarthPoint): EarthPoint {
    // TODO
    return point;
  }

  private toMapPointerEvent(e: MapMouseEvent): MapPointerEvent {
    return {
      renderer: this,
      geographicPoint: e.lngLat,
      viewportPoint: e.point,
    };
  }

}
