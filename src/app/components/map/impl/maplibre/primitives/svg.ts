import { SvgBoundsOptions, SvgBoundsPrimitive } from '@trailence/components/map/primitives/svg';
import { MapLibre } from '../maplibre';
import { MapLibrePrimitive } from './primitive';
import { ImageSource, SourceSpecification } from 'maplibre-gl';
import { EarthBBox } from '@trailence/utils/latlng';

export class MapLibreSvgBounds extends SvgBoundsPrimitive<MapLibre> implements MapLibrePrimitive {

  constructor(
    id: string,
    bounds: EarthBBox,
    svg: string | SVGSVGElement,
    options: SvgBoundsOptions,
  ) {
    super(id, bounds, options);
    this.url = 'data:image/svg+xml;utf8,' + encodeURIComponent(typeof svg === 'string' ? svg : svg.outerHTML);
  }

  private url: string;

  protected override addPrimitiveToMap(renderer: MapLibre): void {
    renderer.getMaplibreMap()!.addLayer({
      id: this.id,
      type: 'raster',
      source: this.buildSource(),
      paint: {
      },
    });
  }

  private buildSource(): SourceSpecification {
    return {
      type: 'image',
      url: this.url,
      coordinates: this.buildBoundsCoordinates(),
    };
  }

  private buildBoundsCoordinates(): [[number,number],[number,number],[number,number],[number,number]] {
    return [
      [this.bounds.minlng, this.bounds.minlat],
      [this.bounds.maxlng, this.bounds.minlat],
      [this.bounds.maxlng, this.bounds.maxlat],
      [this.bounds.maxlng, this.bounds.maxlat],
    ];
  }

  protected override applyNewBounds(renderer: MapLibre): void {
    (renderer.getMaplibreMap()!.getSource(this.id) as ImageSource)?.setCoordinates(this.buildBoundsCoordinates());
  }

  protected override applyNewOptions(renderer: MapLibre, previous: SvgBoundsOptions): void {
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
