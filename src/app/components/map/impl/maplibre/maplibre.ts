import { MapLibreMap, MapMouseEvent, setWorkerUrl } from 'maplibre-gl';
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

setWorkerUrl(environment.assetsUrl + '/' + assetsDependencies['maplibre-gl-worker']);

export class MapLibre extends MapRenderer {

  private map?: MapLibreMap;

  public override get type(): MapRendererType { return 'maplibre'; }

  public getMaplibreMap(): MapLibreMap | undefined { return this.map; }

  public override async init() {
    this.injector.get(AssetsService).loadCss(assetsDependencies['maplibre-gl-css']);
    return new Promise(resolve => {
      this.map = new MapLibreMap({
        container: this.containerId,
        center: this.mapState.center,
        zoom: this.mapState.zoom,
        bearing: this.mapState.bearing,
        pitch: 60,
        style: {
          version: 8,
          sources: {
              osm: {
                  type: 'raster',
                  tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
                  tileSize: 256,
                  attribution: '&copy; OpenStreetMap Contributors',
                  maxzoom: 19
              },
              // Use a different source for terrain and hillshade layers, to improve render quality
              terrainSource: {
                  type: 'raster-dem',
                  url: 'https://tiles.mapterhorn.com/tilejson.json',
                  maxzoom: 17,
              },
              hillshadeSource: {
                  type: 'raster-dem',
                  url: 'https://tiles.mapterhorn.com/tilejson.json',
                  maxzoom: 17,
              }
          },
          layers: [
              {
                  id: 'osm',
                  type: 'raster',
                  source: 'osm'
              },
              {
                  id: 'hills',
                  type: 'hillshade',
                  source: 'hillshadeSource',
                  layout: {visibility: 'visible'},
                  paint: {'hillshade-shadow-color': '#473B24'}
              }
          ],
          terrain: {
              source: 'terrainSource',
              exaggeration: 1
          },
          sky: {}
        },
      });
      const map = this.map;
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
      map.on('style.load', () => resolve(true));
    });
  }

  protected override destroyMap(): void {
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
