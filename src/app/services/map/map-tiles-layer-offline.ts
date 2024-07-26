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
      img._loaded = false;
      offlineMap.getTile(name, coords).subscribe({
        next: binary => {
          if (!binary) {
            network.internet$.pipe(
              filter(c => !!c),
              first()
            ).subscribe(() => {
              img._loaded = true;
              img.onerror = undefined;
              img.onload = undefined;
              img.src = '';
              cancelFallback(img);
              setTimeout(() => {
                img.onerror = function() {
                  loadOffline(img);
                };
                img.onload = function() {
                  done(undefined, img);
                };
                img.src = originalSrc;
              }, 0);
            });
            fallbackTile(img, coords, name, tiles, network, offlineMap, done);
          } else {
            binary.toBase64().then(url => {
              img.src = url;
              img._loaded = true;
              done(undefined, img);
            });
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
      if (!img._offlineLoaded) {
        loadOffline(img || tile);
      }
    });
    img.crossOrigin = 'anonymous';
    return img;
  }
  return tiles;
}

function fallbackTile(img: any, coords: L.Coords, name: string, tiles: L.TileLayer, network: NetworkService, offlineMap: OfflineMapService, done: L.DoneCallback) {
  if (coords.z === 0) {
    done(new Error(), img);
    return;
  }
  const newCoords = new L.Point(Math.floor(coords.x / 2), Math.floor(coords.y / 2)) as L.Coords;
  newCoords.z = coords.z - 1;
  (tiles as any)['createTile'](newCoords, function(error: Error | undefined, tile: HTMLElement | undefined) {
    if (error) {
      done(error, tile);
      return;
    }
    if (img._loaded || !tile) return;
    const size = tiles.getTileSize();

    let tileCoords, scale;
    if ((tile as any).fallback) {
      tileCoords = (tile as any)._tileCoords;
      scale = (tile as any)._scale * 2;
    } else {
      tileCoords = newCoords;
      scale = 2;
    }

    img.style.width = (size.x * scale) + 'px';
    img.style.height = (size.y * scale) + 'px';
    const top = (coords.y - tileCoords.y * scale) * size.y;
    const left = (coords.x - tileCoords.x * scale) * size.x;
		img.style.marginTop = (-top) + 'px';
		img.style.marginLeft = (-left) + 'px';
		img.style.clip = 'rect(' + top + 'px ' + (left + size.x) + 'px ' + (top + size.y) + 'px ' + left + 'px)';
    img.src = (tile as any).src;
    img.fallback = true;
    img._tileCoords = tileCoords;
    img._scale = scale;
    done(undefined, img);
  });
}

function cancelFallback(img: any) {
  if (img.fallback) {
    img.style.width = '';
    img.style.height = '';
    img.style.marginTop = '';
    img.style.marginLeft = '';
    img.style.clip = '';
    img.fallback = false;
  }
}
