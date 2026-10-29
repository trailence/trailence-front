import { MapState } from '@trailence/components/map/map-state';
import { MapLibreMap } from 'maplibre-gl';

export interface MapLibrePrimitive {

  addToMapLibre(mapLibre: MapLibreMap, mapState: MapState): void;
  removeFromMapLibre(mapLibre: MapLibreMap, mapState: MapState): void;

  getLayersIds(): string[];

}
