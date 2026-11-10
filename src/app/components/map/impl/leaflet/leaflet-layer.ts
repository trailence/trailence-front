import { MapLayer, TileResult } from '@trailence/services/map/layers/map-layer';
import { NetworkService } from '@trailence/services/network/network.service';
import { BinaryContent } from '@trailence/utils/binary-content';
import * as L from 'leaflet';
import { EMPTY, filter, Subscription, switchMap } from 'rxjs';

export function createLeafletLayer(layer: MapLayer): L.TileLayer {
  const optional: Partial<L.TileLayerOptions> = {};
  if (layer.bounds) optional.bounds = [[layer.bounds.minlat, layer.bounds.minlng], [layer.bounds.maxlat, layer.bounds.maxlng]];
  if (layer.type === 'raster-overlay') optional.zIndex = 2;
  const options = {
    id: layer.name,
    attribution: layer.attribution,
    minZoom: layer.minZoom,
    maxZoom: layer.maxZoom,
    ...optional,
  };
  const tileLayer = new L.TileLayer('', options);
  (tileLayer as any)._trailenceMapLayerId = layer.name;
  (tileLayer as any)['createTile'] = function(coords: L.Coords, done: L.DoneCallback) {
    const img = TileResult.createImageElement();
    void layer.getTileOrFallback(coords.x, coords.y, coords.z)
    .then(result => {
      result.toImageElement(img, () => done(undefined, img), e => done(e, img));
      if (result.type !== 'online' && result.type !== 'not-found')
        retry(img, layer, coords, done);
    });
    return img;
  };
  return tileLayer;
}

function retry(img: HTMLImageElement, layer: MapLayer, coords: L.Coords, done: L.DoneCallback): void {
  let subscription: Subscription | undefined;
  let retrying = false;
  subscription = layer.injector.get(NetworkService).internet$.subscribe(available => {
    if (!img.parentElement) {
        subscription?.unsubscribe();
        return;
    }
    if (!available ||retrying) return;
    retrying = true;
    layer.download(coords.x, coords.y, coords.z).subscribe(newResult => {
      retrying = false;
      if (newResult instanceof BinaryContent) {
        subscription?.unsubscribe();
        img.src = '';
        const tile = new TileResult(layer, 'online', [newResult], coords.x, coords.y, coords.z, coords.x, coords.y, coords.z);
        tile.toImageElement(img, () => done(undefined, img), e => done(e, img));
      }
    });
  });
}
