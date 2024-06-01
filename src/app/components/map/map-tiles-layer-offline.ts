import * as L from 'leaflet';
import { MapState } from './map-state';

export class MapTilesLayerOffline extends L.TileLayer {

  constructor(
    name: string,
    public displayName: string,
    urlTemplate: string,
    options: L.TileLayerOptions,
    mapState: MapState,
  ) {
    super(urlTemplate, options);
    this.on('add', () => mapState.tilesName = name);
  }

}
