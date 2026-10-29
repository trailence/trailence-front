import * as L from 'leaflet';

export interface LeafletPrimitive {

  addToLeaflet(leafet: L.Map): void;
  removeFromLeaflet(leafet: L.Map): void;

  getLayer(): L.Layer | undefined;

}
