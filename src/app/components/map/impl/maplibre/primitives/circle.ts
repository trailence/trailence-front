import { Circle, CircleOptions } from '@trailence/components/map/primitives/circle';
import { MapLibrePrimitive } from './primitive';
import { MapState } from '@trailence/components/map/map-state';
import { GeoJSONSource, MapLibreMap } from 'maplibre-gl';
import { circle } from '@turf/turf';
import { MapLibreUtils } from '../maplibre-utils';
import { Subscription } from 'rxjs';
import { Color } from '@trailence/utils/color';

export class MapLibreCircle extends Circle implements MapLibrePrimitive {

  private mapLibre?: MapLibreMap;
  private subscription?: Subscription;

  addToMapLibre(mapLibre: MapLibreMap, mapState: MapState): void {
    this.mapLibre = mapLibre;
    mapLibre.addSource(this.id, {
      type: 'geojson',
      data: this.getSourceData(mapLibre),
    });
    if (this.options.fillColor) this.addFillLayer();
    if (this.options.strokeColor) this.addStrokeLayer();
    if (this.options.radiusUnit === 'pixel') {
      this.subscription = mapState.zoomInt$.subscribe(() => {
        void (mapLibre.getSource(this.id) as GeoJSONSource).setData(this.getSourceData(mapLibre));
      });
    }
  }

  private getSourceData(mapLibre: MapLibreMap) {
    return circle({
      type: 'Point',
      coordinates: [this.options.position.lng, this.options.position.lat],
    }, this.getRadiusInMeters(mapLibre), {
      units: 'meters',
    });
  }

  private getRadiusInMeters(mapLibre: MapLibreMap): number {
    if (this.options.radiusUnit === 'meter') return this.options.radius;
    return MapLibreUtils.pixelsToMeters(mapLibre, this.options.radius);
  }

  private addFillLayer(): void {
    this.mapLibre!.addLayer({
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
    this.mapLibre!.addLayer({
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

  public override setOptions(options: CircleOptions): void {
    if (!this.mapLibre) {
      this.options = {...options};
      return;
    }
    const previous = this.options;
    this.options = {...options};
    if (options.position.lat !== previous.position.lat || options.position.lng !== previous.position.lng || options.radius !== previous.radius || options.radiusUnit !== previous.radiusUnit) {
      // source change
      void (this.mapLibre.getSource(this.id) as GeoJSONSource).setData(this.getSourceData(this.mapLibre));
    }
    if (!previous.fillColor && options.fillColor) {
      // fill added
      this.addFillLayer();
    } else if (previous.fillColor && !options.fillColor) {
      // fill removed
      this.mapLibre.removeLayer(this.id + '$fill');
    } else if (previous.fillColor && options.fillColor && !Color.areSame(previous.fillColor, options.fillColor)) {
      // fill color changed
      const layer = this.mapLibre.getLayer(this.id + '$fill');
      layer?.setPaintProperty('fill-color', options.fillColor.toHexString(false));
      layer?.setPaintProperty('fill-opacity', options.fillColor.a);
    }
    if (!previous.strokeColor && options.strokeColor) {
      // stroke added
      this.addStrokeLayer();
    } else if (previous.strokeColor && !options.strokeColor) {
      // stroke removed
      this.mapLibre.removeLayer(this.id + '$stroke');
    } else if (previous.strokeColor && options.strokeColor && (!Color.areSame(previous.strokeColor, options.strokeColor) || (previous.strokeWidth ?? 1) !== (options.strokeWidth ?? 1))) {
      // stroke changed
      const layer = this.mapLibre.getLayer(this.id + '$stroke');
      layer?.setPaintProperty('line-color', options.strokeColor.toHexString(false));
      layer?.setPaintProperty('line-opacity', options.strokeColor.a);
      layer?.setPaintProperty('line-width', options.strokeWidth ?? 1);
    }
  }

  removeFromMapLibre(mapLibre: MapLibreMap, mapState: MapState): void {
    this.subscription?.unsubscribe();
    if (this.options.fillColor)
      mapLibre.removeLayer(this.id + '$fill');
    if (this.options.strokeColor)
      mapLibre.removeLayer(this.id + '$stroke');
    mapLibre.removeSource(this.id);
    this.mapLibre = undefined;
  }

  getLayersIds(): string[] {
    const ids: string[] = [];
    if (this.options.fillColor) ids.push(this.id + '$fill');
    if (this.options.strokeColor) ids.push(this.id + '$stroke');
    return ids;
  }

}
