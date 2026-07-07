export interface MapElement {

  addTo(map: L.Map): void;
  remove(): void;

  bringToFront(): void;

  bounds: L.LatLngBounds | undefined;
  highlighted: boolean;

}
