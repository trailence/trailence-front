import { Injector } from '@angular/core';
import { MapLayersService } from '@trailence/services/map/map-layers.service';
import { NetworkService } from '@trailence/services/network/network.service';
import { AddProtocolResponseData, GetResourceResponse, MapLibreMap, RasterDEMSourceSpecification, RasterDEMTileSource, RequestParameters } from 'maplibre-gl';
import { filter, Observable, Subscription, switchMap } from 'rxjs';
import { HILLS_LAYER, HILLS_SOURCE, RASTER_SOURCE, TERRAIN_SOURCE } from './maplibre';

export class MapLibreTrailenceProtocol {

  private readonly _maps = new Map<string, MapRegistration>();

  async handleRequest(params: RequestParameters, abortController: AbortController): Promise<GetResourceResponse<AddProtocolResponseData>> {
    // TODO abortController
    const path = params.url.split('://')[1].split('/');
    if (path.length !== 5) throw new Error('Invalid trailence URL: ' + params.url);
    const mapId = path[0];
    const map = this._maps.get(mapId);
    if (!map) throw new Error('Map not registered');
    const layer = map.injector.get(MapLayersService).getLayer(path[1]);
    if (!layer) throw new Error('Layer not found: ' + path[1] + ' for url ' + params.url);
    const x = Number.parseInt(path[2]);
    const y = Number.parseInt(path[3]);
    const z = Number.parseInt(path[4]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) throw new Error('Invalid trailence URL: ' + params.url);
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
        map.maplibre.refreshTiles(RASTER_SOURCE);
        // https://github.com/maplibre/maplibre-gl-js/pull/8796
        // https://github.com/maplibre/maplibre-gl-js/pull/8872
        map.maplibre.refreshTiles(HILLS_SOURCE);
        map.maplibre.refreshTiles(TERRAIN_SOURCE);
        /*
        map.maplibre.removeLayer(HILLS_LAYER);
        map.maplibre.setTerrain(null);
        map.maplibre.removeSource(HILLS_SOURCE);
        map.maplibre.removeSource(TERRAIN_SOURCE);
        setTimeout(() => {
          const layer = map.injector.get(MapLayersService).getDefaultLayer('raster-dem');
          map.maplibre.addSource(HILLS_SOURCE, {
            type: 'raster-dem',
            tiles: ['trailence://' + mapId + '/' + layer.name + '/{x}/{y}/{z}'],
            tileSize: layer.tileSize * layer.tileResolution,
            attribution: layer.attribution,
            minzoom: Math.max(1, layer.minZoom),
            maxzoom: layer.maxZoom,
            encoding: layer.demEncoding,
          });
          map.maplibre.addSource(TERRAIN_SOURCE, {
            type: 'raster-dem',
            tiles: ['trailence://' + mapId + '/' + layer.name + '/{x}/{y}/{z}'],
            tileSize: layer.tileSize * layer.tileResolution,
            attribution: layer.attribution,
            minzoom: Math.max(1, layer.minZoom),
            maxzoom: layer.maxZoom,
            encoding: layer.demEncoding,
          });
          map.maplibre.addLayer({
                  id: HILLS_LAYER,
                  type: 'hillshade',
                  source: HILLS_SOURCE,
                  layout: {visibility: 'visible'},
                  paint: {'hillshade-shadow-color': '#473B24'}
              });
              map.maplibre.setTerrain({
              source: TERRAIN_SOURCE,
              exaggeration: 1
          })
        }, 1000);
        */
        /*
        requestAnimationFrame(() => {
          map.maplibre.refreshTiles(RASTER_SOURCE);
          map.maplibre.refreshTiles(HILLS_SOURCE);
          map.maplibre.refreshTiles(TERRAIN_SOURCE);
          const container = map.maplibre.getContainer();
          const previous = container.style.width;
          container.style.width = (container.clientWidth + 10) + 'px';
          map.maplibre.resize();
          requestAnimationFrame(() => {
            container.style.width = previous;
            map.maplibre.resize();
          });
        });*/
        /*
        requestAnimationFrame(() => {
          map.maplibre.resize();
          map.maplibre.redraw();
        });*/

        /*
        map.maplibre.setTerrain(null);
        map.maplibre.setTerrain({source: TERRAIN_SOURCE, exaggeration: 1});
        */

        /*
        let s = map.maplibre.getSource(HILLS_SOURCE) as RasterDEMTileSource;
        s.setTiles(['trailence://' + mapId + '/mapterhorn/{x}/{y}/{z}']);
        //s.load(true);
        s = map.maplibre.getSource(TERRAIN_SOURCE) as RasterDEMTileSource
        s.setTiles(['trailence://' + mapId + '/mapterhorn/{x}/{y}/{z}']);
        //s.load(true);
        */

        //map.maplibre.triggerRepaint();
        //map.maplibre.getLayer(HILLS_LAYER)?.recalculate()
      });
    }
    if (tile.type !== 'online' && layer.type !== 'raster') throw new Error();
    if (abortController.signal.aborted) throw new Error('Request aborted');
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
