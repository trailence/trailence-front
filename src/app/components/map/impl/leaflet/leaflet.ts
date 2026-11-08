import { AssetsService } from '@trailence/services/assets/assets.service';
import { MapRenderer, MapRendererType } from '../map-renderer';
import * as L from 'leaflet';
import { MapLayersService } from '@trailence/services/map/map-layers.service';
import { CircleOptions } from '../../primitives/circle';
import { LeafletCircle } from './primitives/circle';
import { LeafletPrimitive } from './primitives/primitive';
import { EarthBBox, EarthPoint, normalizeLatitude, normalizeLongitude } from '@trailence/utils/latlng';
import { MapPrimitive } from '../../primitives/primitive';
import { PolylineOptions } from '../../primitives/polyline';
import { LeafletPolyline } from './primitives/polyline';
import { Point2D } from '@trailence/utils/geometry-utils';
import { SvgBoundsOptions } from '../../primitives/svg';
import { LeafletSvgBounds } from './primitives/svg';
import { LeafletUtils } from './leaflet-utils';
import { IconOptions, IconPrimitive } from '../../primitives/icon';
import { LeafletIcon } from './primitives/icon';
import { MapPointerEvent } from '../../map-events';
import { RotateMode } from '../../map-state';
import { Subscriptions } from '@trailence/utils/rxjs/subscription-utils';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { DistanceUnit } from '@trailence/services/preferences/preferences';
import { createLeafletLayer } from './leaflet-layer';

export class Leaflet extends MapRenderer {

  private map?: L.Map;
  private subscriptions = new Subscriptions();

  public override get type(): MapRendererType { return 'leaflet'; }

  public override async init(): Promise<any> {
    globalThis.L = L; // needed for leaflet rotate
    await this.injector.get(AssetsService).loadJs('leaflet-rotate.1.js');

    const mapLayersService = this.injector.get(MapLayersService);
    const layer = mapLayersService.getLayerOrDefault(this.mapState.tilesName);
    const overlays = this.mapState.overlays.map(name => mapLayersService.getLayer(name)).filter(o => !!o);

    this.map = L.map(this.containerId, {
      center: this.mapState.center,
      zoom: Math.floor(this.mapState.zoom),
      layers: [createLeafletLayer(layer), ...overlays.map(o => createLeafletLayer(o))],
      zoomControl: false,
      worldCopyJump: true,
      //zoomSnap: 0.5,
      //zoomDelta: 0.5,
      rotate: true,
      bearing: this.mapState.bearing,
      touchGestures: true,
      touchRotate: true,
      touchRotateInertia: 15,
      rotateControl: false,
    } as any);

    const map = this.map;
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank">Leaflet</a>');
    map.on('resize', () => this.mapState.center = map.getCenter());
    map.on('move', () => this.mapState.center = map.getCenter());
    map.on('zoom', () => this.mapState.zoom = map.getZoom());
    map.on('zoomanim', e => this.mapState.zoom = e.zoom);
    map.on('click', e => this.events.click.trigger(() => this.toMapPointerEvent(e)));
    map.on('touchrotate', e => {
      this.mapState.rotateMode = RotateMode.CUSTOM;
      this.mapState.bearing = (e as any).touchRotateBearing;
    });
    map.on('rotate', e => this.mapState.bearing = (e as any).theta);

    let distanceUnit: DistanceUnit | undefined = undefined;
    let scale: L.Control.Scale | undefined = undefined;
    this.subscriptions.add(this.injector.get(PreferencesService).preferences$.subscribe(prefs => {
      if (distanceUnit !== prefs.distanceUnit) {
        if (scale) scale.remove();
        scale = L.control.scale({
          metric: prefs.distanceUnit === 'METERS',
          imperial: prefs.distanceUnit === 'IMPERIAL',
        });
        distanceUnit = prefs.distanceUnit;
        scale.addTo(map);
      }
    }));
  }

  protected override destroyMap(): void {
    this.subscriptions.unsubscribe();
    this.map?.remove();
  }

  public getLeafletMap(): L.Map | undefined {
    return this.map;
  }

  public override bringToFront(primitive: MapPrimitive<any, MapRenderer>): void {
    const layer = (primitive as unknown as LeafletPrimitive).getLayer();
    if (!layer) return;
    const fct = (layer as any)['bringToFront'];
    if (typeof fct === 'function') (layer as any)['bringToFront']();
  }

  public override getBounds(): EarthBBox | undefined {
    return this.map ? LeafletUtils.fromLeafletBounds(this.map.getBounds()) : undefined;
  }
  public override fitBounds(bounds: EarthBBox, flying: boolean): this {
    const target = LeafletUtils.toLeafletBounds(bounds);
    if (flying) this.map?.flyToBounds(target);
    else this.map?.fitBounds(target);
    return this;
  }

  public override goTo(center: EarthPoint, zoom: number | undefined, flying: boolean): void {
    if (flying) this.map?.flyTo(center, zoom);
    else this.map?.setView(center, zoom);
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
    (this.map as any)?.setBearing(bearing, {animate});
  }

  public override createCircle(id: string, position: EarthPoint, options: CircleOptions) {
    return new LeafletCircle(id, position, options);
  }

  public override createPolyline(id: string, positions: EarthPoint[][], options: PolylineOptions) {
    return new LeafletPolyline(id, positions, options);
  }

  public override createSvgBounds(id: string, bounds: EarthBBox, svg: string | SVGSVGElement, options: SvgBoundsOptions) {
    return new LeafletSvgBounds(id, bounds, svg, options);
  }

  public override createIcon(id: string, position: EarthPoint, options: IconOptions): IconPrimitive<any> {
    return new LeafletIcon(id, position, options);
  }

  public override getViewportSize(): Point2D | undefined {
    return this.map?.getSize();
  }

  public override projectToViewport(point: EarthPoint): Point2D {
    //return this.map!.project(point).subtract(this.map!.getPixelOrigin());
    return this.map!.latLngToContainerPoint(point);
  }

  public override unprojectFromViewport(point: Point2D): EarthPoint {
    //return this.map!.layerPointToLatLng([point.x, point.y]);
    return this.map!.containerPointToLatLng([point.x, point.y]);
  }

  public override getPointWithOffset(point: EarthPoint): EarthPoint {
    if (!this.map) return point;
    const bounds = this.map.getBounds();
    const lat = this.toMapLatitude(point.lat, bounds);
    const lng = this.toMapLongitude(point.lng, bounds);
    if (lat !== point.lat || lng !== point.lng) return {lat, lng};
    return point;
  }

  private toMapLongitude(longitude: number, mapBounds: L.LatLngBounds): number {
    let val = normalizeLongitude(longitude);
    let min = Math.min(mapBounds.getWest(), mapBounds.getEast());
    let max = Math.max(mapBounds.getWest(), mapBounds.getEast());
    if (val >= min && val <= max) return val;
    while (val > max) {
      val -= 360;
    }
    while (val < min) {
      val += 360;
    }
    if (val >= min && val <= max) return val;
    return longitude;
  }

  private toMapLatitude(latitude: number, mapBounds: L.LatLngBounds): number {
    let val = normalizeLatitude(latitude);
    let min = Math.min(mapBounds.getSouth(), mapBounds.getNorth());
    let max = Math.max(mapBounds.getSouth(), mapBounds.getNorth());
    if (val >= min && val <= max) return val;
    while (val > max) {
      val -= 360;
    }
    while (val < min) {
      val += 360;
    }
    if (val >= min && val <= max) return val;
    return latitude;
  }

  private toMapPointerEvent(e: L.LeafletMouseEvent): MapPointerEvent {
    return {
      renderer: this,
      geographicPoint: e.latlng,
      viewportPoint: e.containerPoint,
    };
  }

}
