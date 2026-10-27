import { LayerSpecification, MapLibreMap, SourceSpecification } from 'maplibre-gl';

export interface MapElement {

  addTo(map: L.Map): void;
  remove(): void;

  bringToFront(): void;

  bounds: L.LatLngBounds | undefined;
  highlighted: boolean;

}

export type LeafletElement = L.Layer;
export type MapLibreElement = (Omit<LayerSpecification, "source"> & { source: SourceSpecification; });
export type MapStatus = ({ is3D: false; leaflet: L.Map; leafletElements: LeafletElement[]; }) |
                        ({ is3D: true;  leaflet: L.Map; leafletElements: LeafletElement[]; mapLibre: MapLibreMap; mapLibreElements: MapLibreElement[] });

export abstract class MapArtifact {

  protected map?: MapStatus;

  constructor(
    protected readonly id: string,
  ) {}

  protected abstract get2DElements(): LeafletElement[];
  protected abstract get3DElements(): {elements2D: LeafletElement[], elements3D: MapLibreElement[]};

  public addToMap2D(leaflet: L.Map): void {
    if (this.map?.is3D === false) return;
    const newElements = this.get2DElements();
    if (this.map) for (const element of this.map.leafletElements) if (!newElements.includes(element)) element.removeFrom(this.map.leaflet);
    for (const element of newElements) if (!this.map?.leafletElements.includes(element)) element.addTo(leaflet);
    this.map = { is3D: false, leaflet, leafletElements: newElements };
  }

  public addToMap3D(leaflet: L.Map, mapLibre: MapLibreMap): void {
    if (this.map?.is3D === true) return;
    const {elements2D, elements3D} = this.get3DElements();
    if (this.map) for (const element of this.map.leafletElements) if (!elements2D.includes(element)) element.removeFrom(this.map.leaflet);
    for (const element of elements2D) if (!this.map?.leafletElements.includes(element)) element.addTo(leaflet);
    for (const element of elements3D) mapLibre.addLayer(element);
    this.map = { is3D: true, leaflet, leafletElements: elements2D, mapLibre, mapLibreElements: elements3D };
  }

  public remove(): void {
    if (this.map === undefined) return;
    for (const element of this.map.leafletElements) element.removeFrom(this.map.leaflet);
    if (this.map.is3D) for (const element of this.map.mapLibreElements) this.map.mapLibre.removeLayer(element.id);
    if (this.map) for (const element of this.map.leafletElements) element.removeFrom(this.map.leaflet);
  }

}
