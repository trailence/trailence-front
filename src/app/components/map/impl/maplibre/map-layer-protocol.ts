import { Injector } from '@angular/core';
import { MapLayersService } from '@trailence/services/map/map-layers.service';
import { AddProtocolResponseData, GetResourceResponse, RequestParameters } from 'maplibre-gl';
import { firstValueFrom } from 'rxjs';

export class MapLibreTrailenceProtocol {

  injector!: Injector;

  async handleRequest(params: RequestParameters, abortController: AbortController): Promise<GetResourceResponse<AddProtocolResponseData>> {
    const path = params.url.split('://')[1].split('/');
    const layer = this.injector.get(MapLayersService).getLayerOrDefault(path[0]);
    const x = Number.parseInt(path[1]);
    const y = Number.parseInt(path[2]);
    const z = Number.parseInt(path[3]);
    // TODO how could we update when going back online ?
    const tile = await firstValueFrom(layer.getTileOrFallback(x, y, z));
    return {data: await tile.img.toArrayBuffer()};
  }
}

export const TRAILENCE_PROTOCOL = new MapLibreTrailenceProtocol();
