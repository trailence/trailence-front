import * as L from 'leaflet';
import { filter, first } from 'rxjs';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { NetworkService } from 'src/app/services/network/network.service';

export function handleMapOffline(name: string, tiles: L.TileLayer, network: NetworkService, offlineMap: OfflineMapService): L.TileLayer {
  const originalCreateTile = (tiles as any)['createTile'];
  (tiles as any)['createTile'] = function(coords: L.Coords, done: L.DoneCallback) {
    const loadOffline = (img: any) => {
      const originalSrc = img.src;
      img.src = '';
      img._offlineLoaded = true;
      offlineMap.getTile(name, coords).subscribe({
        next: binary => {
          if (!binary) {
            network.connected$.pipe(
              filter(c => !!c),
              first()
            ).subscribe(() => img.src = originalSrc);
          } else {
            binary.toBase64().then(url => img.src = url);
          }
        },
        error: e => {
          done(e, img);
        },
      });
    };
    const img = originalCreateTile.call(tiles, coords, function(error: Error | undefined, tile: HTMLElement | undefined) {
      if (!error) {
        done(undefined, tile);
        return;
      }
      if (img._offlineLoaded) {
        done(error, tile);
        return;
      }
      loadOffline(img);
    });
    img.crossOrigin = 'anonymous';
    if (!network.connected) {
      loadOffline(img);
    }
    return img;
  }
  return tiles;
}
