import { Circle, CircleOptions } from '@trailence/components/map/primitives/circle';
import { MapLibrePrimitive } from './primitive';
import { GeoJSONSource } from 'maplibre-gl';
import { circle } from '@turf/turf';
import { MapLibreUtils } from '../maplibre-utils';
import { Subscription } from 'rxjs';
import { Color } from '@trailence/utils/color';
import { MapLibre } from '../maplibre';

export class MapLibreCircle extends Circle<MapLibre> implements MapLibrePrimitive {

  private subscription?: Subscription;

  protected override addPrimitiveToMap(renderer: MapLibre): void {
    renderer.getMaplibreMap()!.addSource(this.id, {
      type: 'geojson',
      data: this.getSourceData(renderer),
    });
    if (this.options.fillColor) this.addFillLayer();
    if (this.options.strokeColor) this.addStrokeLayer();
    if (this.options.radiusUnit === 'pixel') {
      this.subscription = renderer.mapState.zoomInt$.subscribe(() => {
        void (renderer.getMaplibreMap()!.getSource(this.id) as GeoJSONSource).setData(this.getSourceData(renderer));
      });
    }
  }

  private getSourceData(renderer: MapLibre) {
    return circle({
      type: 'Point',
      coordinates: [this.position.lng, this.position.lat],
    }, this.getRadiusInMeters(renderer), {
      units: 'meters',
    });
  }

  private getRadiusInMeters(renderer: MapLibre): number {
    if (this.options.radiusUnit === 'meter') return this.options.radius;
    return MapLibreUtils.pixelsToMeters(renderer.getMaplibreMap()!, this.options.radius);
  }

  private addFillLayer(): void {
    this.renderer!.getMaplibreMap()!.addLayer({
      id: this.id + '$fill',
      type: 'fill',
      source: this.id,
      paint: {
        'fill-color': this.options.fillColor!.toHexString(false),
        'fill-opacity': this.options.fillColor!.a,
      }
    });
  }

  private addStrokeLayer(): void {
    this.renderer!.getMaplibreMap()!.addLayer({
      id: this.id + '$stroke',
      type: 'line',
      source: this.id,
      paint: {
        'line-color': this.options.strokeColor!.toHexString(false),
        'line-opacity': this.options.strokeColor!.a,
        'line-width': this.options.strokeWidth ?? 1,
      }
    });
  }

  protected override applyNewPosition(renderer: MapLibre): void {
    void (renderer.getMaplibreMap()!.getSource(this.id) as GeoJSONSource).setData(this.getSourceData(renderer));
  }

  protected override applyNewOptions(renderer: MapLibre, previous: CircleOptions): void {
    if (!previous.fillColor && this.options.fillColor) {
      // fill added
      this.addFillLayer();
    } else if (previous.fillColor && !this.options.fillColor) {
      // fill removed
      renderer.getMaplibreMap()!.removeLayer(this.id + '$fill');
    } else if (previous.fillColor && this.options.fillColor && !Color.areSame(previous.fillColor, this.options.fillColor)) {
      // fill color changed
      const layer = renderer.getMaplibreMap()!.getLayer(this.id + '$fill');
      layer?.setPaintProperty('fill-color', this.options.fillColor.toHexString(false));
      layer?.setPaintProperty('fill-opacity', this.options.fillColor.a);
    }
    if (!previous.strokeColor && this.options.strokeColor) {
      // stroke added
      this.addStrokeLayer();
    } else if (previous.strokeColor && !this.options.strokeColor) {
      // stroke removed
      renderer.getMaplibreMap()!.removeLayer(this.id + '$stroke');
    } else if (previous.strokeColor && this.options.strokeColor && (!Color.areSame(previous.strokeColor, this.options.strokeColor) || (previous.strokeWidth ?? 1) !== (this.options.strokeWidth ?? 1))) {
      // stroke changed
      const layer = renderer.getMaplibreMap()!.getLayer(this.id + '$stroke');
      layer?.setPaintProperty('line-color', this.options.strokeColor.toHexString(false));
      layer?.setPaintProperty('line-opacity', this.options.strokeColor.a);
      layer?.setPaintProperty('line-width', this.options.strokeWidth ?? 1);
    }
  }

  protected override removePrimitiveFromMap(renderer: MapLibre): void {
    this.subscription?.unsubscribe();
    if (this.options.fillColor)
      renderer.getMaplibreMap()!.removeLayer(this.id + '$fill');
    if (this.options.strokeColor)
      renderer.getMaplibreMap()!.removeLayer(this.id + '$stroke');
    renderer.getMaplibreMap()!.removeSource(this.id);
  }

  getLayersIds(): string[] {
    const ids: string[] = [];
    if (this.options.fillColor) ids.push(this.id + '$fill');
    if (this.options.strokeColor) ids.push(this.id + '$stroke');
    return ids;
  }

}
