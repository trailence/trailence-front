import { Polyline, PolylineOptions } from '@trailence/components/map/primitives/polyline';
import { MapLibrePrimitive } from './primitive';
import { GeoJSONSource, SourceSpecification } from 'maplibre-gl';
import { EarthPoint } from '@trailence/utils/latlng';
import { MapLibre } from '../maplibre';

export class MapLibrePolyline extends Polyline<MapLibre> implements MapLibrePrimitive {

  protected override addPrimitiveToMap(renderer: MapLibre): void {
    renderer.getMaplibreMap()!.addLayer({
      id: this.id,
      type: 'line',
      source: this.buildSource(),
      paint: {
        'line-color': this.options.color.toHexString(false),
        'line-opacity': this.options.color.a,
        'line-width': this.options.width,
      },
    });
  }

  private buildSource(): SourceSpecification {
    return {
      type: 'geojson',
      data: this.buildSourceData()
    };
  }

  private buildSourceData(): GeoJSON.GeoJSON {
    return {
      type: 'Feature',
      geometry: this.buildGeoJSONFeatureGeometry(),
      properties: {},
    }
  }

  private buildGeoJSONFeatureGeometry(): GeoJSON.LineString | GeoJSON.MultiLineString {
    if (this.positions.length === 0) return { type: 'LineString', coordinates: [] };
    if (this.positions.length === 1) return { type: 'LineString', coordinates: this.getCoordinates(this.positions[0]) };
    return { type: 'MultiLineString', coordinates: this.positions.map(segment => this.getCoordinates(segment)) };
  }

  private getCoordinates(segment: EarthPoint[]): GeoJSON.Position[] {
    return segment.map(point => [point.lng, point.lat]);
  }

  protected override applyNewPositions(renderer: MapLibre): void {
    void (renderer.getMaplibreMap()!.getSource(this.id) as GeoJSONSource)?.setData(this.buildSourceData());
  }

  protected override applyNewOptions(renderer: MapLibre, previous: PolylineOptions): void {
    // TODO
  }

  protected override removePrimitiveFromMap(renderer: MapLibre): void {
    renderer.getMaplibreMap()!.removeLayer(this.id);
    renderer.getMaplibreMap()!.removeSource(this.id);
  }

  getLayersIds(): string[] {
    return [this.id];
  }

}
