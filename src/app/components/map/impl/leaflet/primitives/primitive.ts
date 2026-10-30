import * as L from 'leaflet';

export interface LeafletPrimitive {

  getLayer(): L.Layer | undefined;

}
