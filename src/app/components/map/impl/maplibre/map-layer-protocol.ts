import { Injector } from '@angular/core';
import { MapLayersService } from '@trailence/services/map/map-layers.service';
import { NetworkService } from '@trailence/services/network/network.service';
import { AddProtocolResponseData, GetResourceResponse, MapLibreMap, RequestParameters } from 'maplibre-gl';
import { filter, Observable, Subscription, switchMap } from 'rxjs';

export class MapLibreTrailenceProtocol {

  private readonly _maps = new Map<string, MapRegistration>();

  async handleRequest(params: RequestParameters, abortController: AbortController): Promise<GetResourceResponse<AddProtocolResponseData>> {
    const path = params.url.split('://')[1].split('/');
    const mapId = path[0];
    const map = this._maps.get(mapId);
    if (!map) throw new Error('Map not registered');
    const layer = map.injector.get(MapLayersService).getLayer(path[1]);
    if (!layer) throw new Error('Layer not found: ' + path[1]);
    const x = Number.parseInt(path[2]);
    const y = Number.parseInt(path[3]);
    const z = Number.parseInt(path[4]);
    const tile = await layer.getTileOrFallback(x, y, z);
    const data = await tile.toArrayBuffer();
    if (tile.type !== 'online' && tile.type !== 'not-found') {
      map.networkSubscription ??= map.injector.get(NetworkService).internet$.pipe(
        filter(available => available),
        switchMap(() => map.visible$),
        filter(visible => visible),
      ).subscribe(() => {
        map.networkSubscription?.unsubscribe();
        map.networkSubscription = undefined;
        map.maplibre.refreshTiles('baselayer');
        map.maplibre.refreshTiles('terrainSource');
        map.maplibre.refreshTiles('hillshadeSource');
      });
    }
    return {data};
  }

  public registerMap(id: string, injector: Injector, maplibre: MapLibreMap, visible$: Observable<boolean>): void {
    if (this._maps.has(id)) return;
    this._maps.set(id, {id, injector, maplibre, visible$});
  }

  public unregisterMap(id: string): void {
    const m = this._maps.get(id);
    if (m) {
      this._maps.delete(id);
      m.networkSubscription?.unsubscribe();
    }
  }
}

export const TRAILENCE_PROTOCOL = new MapLibreTrailenceProtocol();

interface MapRegistration {
  id: string;
  injector: Injector;
  maplibre: MapLibreMap;
  visible$: Observable<boolean>;
  networkSubscription?: Subscription;
}
