import { MapLibreMap } from 'maplibre-gl';
import { MapRenderer, MapRendererType } from '../map-renderer';
import { CircleOptions } from '../../primitives/circle';
import { MapLibreCircle } from './primitives/circle';
import { MapLibrePrimitive } from './primitives/primitive';
import { MapPrimitive } from '../../primitives/primitive';
import { EarthPoint } from '@trailence/utils/latlng';
import { PolylineOptions } from '../../primitives/polyline';
import { MapLibrePolyline } from './primitives/polyline';
import { Point2D } from '@trailence/utils/geometry-utils';

export class MapLibre extends MapRenderer {

  private map?: MapLibreMap;

  public override get type(): MapRendererType { return 'maplibre'; }

  public getMaplibreMap(): MapLibreMap | undefined { return this.map; }

  public override async init() {
    return new Promise(resolve => {
      this.map = new MapLibreMap({
        container: this.containerId,
        center: this.mapState.center,
        zoom: this.mapState.zoom,
        bearing: this.mapState.bearing,
      });
      this.map.on('style.load', () => resolve(true));
    });
  }

  protected override destroyMap(): void {
    this.map?.remove();
  }

  public override bringToFront(primitive: MapPrimitive<any, MapRenderer>): void {
    (primitive as unknown as MapLibrePrimitive).getLayersIds().forEach(id => this.map!.moveLayer(id));
  }

  public override createCircle(id: string, position: EarthPoint, options: CircleOptions) {
    return new MapLibreCircle(id, position, options);
  }

  public override createPolyline(id: string, positions: EarthPoint[][], options: PolylineOptions) {
    return new MapLibrePolyline(id, positions, options);
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

}
