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
import { HtmlMarkerOptions, HtmlMarkerPrimitive } from '../../primitives/html-marker';
import { LeafletHtmlMarker } from './primitives/html-marker';

export class Leaflet extends MapRenderer {

  private map?: L.Map;
  private readonly subscriptions = new Subscriptions();

  public override get type(): MapRendererType { return 'leaflet'; }

  public async init(): Promise<any> {
    globalThis.L = L; // needed for leaflet rotate
    await this.injector.get(AssetsService).loadJs('leaflet-rotate.1.js');

    const mapLayersService = this.injector.get(MapLayersService);
    const layer = mapLayersService.getLayerOrDefault('raster', this.mapState.tilesName);
    const overlays = this.mapState.overlays.map(name => mapLayersService.getLayer(name, 'raster-overlay')).filter(o => !!o);

    this.map = L.map(this.containerId, {
      center: this.mapState.center,
      zoom: Math.floor(this.mapState.zoom),
      layers: [createLeafletLayer(layer), ...overlays.map(o => createLeafletLayer(o))],
      zoomControl: false,
      worldCopyJump: true,
      zoomSnap: 0.1,
      zoomDelta: 0.2,
      wheelPxPerZoomLevel: 100,
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
    map.on('click', e => {
      this.events.click.trigger(() => LeafletUtils.toMapPointerEvent(this, e));
    });
    map.on('touchrotate', e => {
      this.mapState.rotateMode = RotateMode.CUSTOM;
      this.mapState.bearing = (e as any).touchRotateBearing;
    });
    map.on('rotate', e => this.mapState.bearing = (e as any).theta);
    // leaflet does not trigger mouseout correctly to the layers => handle it manually
    let currentLayersHover: L.Layer[] = [];
    map.on('mousemove', e => {
      const layers: L.Layer[] = (e.originalEvent as any)['_layerCatch'] ?? [];
      for (const previousLayer of currentLayersHover) {
        if (!layers.includes(previousLayer)) {
          previousLayer.fireEvent('mouseout');
        }
      }
      currentLayersHover = layers;
    });

    let currentLayer = layer.name;
    this.subscriptions.add(this.mapState.tilesName$.subscribe(layerName => {
      if (layerName === currentLayer) return;
      const newLayer = mapLayersService.getLayerOrDefault('raster', layerName);
      if (newLayer.name === currentLayer) return;
      let found: L.Layer | undefined = undefined;
      map.eachLayer(l => {
        const id = (l as any)['_trailenceMapLayerId'];
        if (id) {
          if (id === newLayer.name) found = l;
          else if (mapLayersService.getLayer(id) !== undefined) map.removeLayer(l);
        }
      });
      if (found) {
        if (!map.hasLayer(found)) map.addLayer(found);
      } else {
        map.addLayer(createLeafletLayer(newLayer));
      }
    }));

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

  public override invalidateSize(): void {
    this.map?.invalidateSize();
  }

  public getLeafletMap(): L.Map | undefined {
    return this.map;
  }

  public override bringToFront(primitive: MapPrimitive<any, MapRenderer, any>, index: number): void {
    const layer = (primitive as unknown as LeafletPrimitive<any, any>).getLayer();
    if (!layer) return;
    let fct = (layer as any)['bringToFront'];
    if (typeof fct === 'function') {
      try { (layer as any)['bringToFront'](); } catch (e) {}
    }
    fct = (layer as any)['setZIndexOffset']
    if (typeof fct === 'function') {
      try { (layer as any)['setZIndexOffset'](index); } catch (e) {}
    }
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

  public override ensurePointVisible(point: EarthPoint, flying: boolean): void {
    this.map?.panInside(point, {
      padding: [75, 75],
      animate: flying,
    });
  }

  public override getMinZoom(): number {
    return this.map?.getMinZoom() ?? 1;
  }
  public override getMaxZoom(): number {
    return this.map?.getMaxZoom() ?? 1;
  }
  public override setZoom(zoom: number, animate: boolean): void {
    this.map?.setZoom(zoom, {animate});
  }

  public override setBearing(bearing: number, animate: boolean): void {
    (this.map as any)?.setBearing(bearing, {animate});
  }
  public override setPitch(pitch: number, animate: number | undefined): void {
    // not supported
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

  public override createIcon(id: string, position: EarthPoint, options: IconOptions): IconPrimitive<any, any> {
    return new LeafletIcon(id, position, options);
  }

  public override createHtmlMarker(id: string, position: EarthPoint, options: HtmlMarkerOptions): HtmlMarkerPrimitive<any, any> {
    return new LeafletHtmlMarker(id, position, options);
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

}
