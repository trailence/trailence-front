import * as L from 'leaflet';
import { first } from 'rxjs';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { I18nService } from '../i18n/i18n.service';
import { Console } from 'src/app/utils/console';

export function handleMapOffline(name: string, displayName: string, tiles: L.TileLayer, getTileUrl: (layer: L.TileLayer, coords: L.Coords, crs?: L.CRS) => string, network: NetworkService, offlineMap: OfflineMapService, i18n: I18nService): L.TileLayer {
  (tiles as any)['createTile'] = function(coords: L.Coords, done: L.DoneCallback) {
    const loadOffline = (img: any, trial: number, originalSrc: string) => {
      if (img.src) img.src = '';
      img._offlineLoaded = true;
      img._loaded = false;
      offlineMap.getTile(name, coords).subscribe({
        next: binary => {
          if (binary) {
            binary.toBase64().then(base64 => {
              img.src = 'data:' + binary.getContentType() + ';base64,' + base64;
              img._loaded = true;
              img.classList.add('map-tile-offline');
              img.classList.remove('map-tile-loading');
              done(undefined, img);
            });
          } else {
            network.internet$.pipe(
              filterDefined(),
              first()
            ).subscribe(() => {
              if (!img.parentElement) return;
              img._loaded = true;
              img.onerror = undefined;
              img.onload = undefined;
              img.src = '';
              cancelFallback(img);
              img.classList.add('map-tile-loading');
              img.classList.remove('map-tile-error');
              setTimeout(() => {
                img.onerror = function() {
                  if (!network.internet)
                    loadOffline(img, 1, originalSrc);
                  else if (trial < 3)
                    loadOffline(img, trial + 1, originalSrc);
                  else {
                    img.classList.add('map-tile-error');
                    img.classList.remove('map-tile-loading');
                    done(new Error('Cannot load tile'), img);
                  }
                };
                img.onload = function() {
                  img.classList.remove('map-tile-loading');
                  done(undefined, img);
                };
                img.src = originalSrc;
              }, 0);
            });
            if (!img._loaded)
              fallbackTile(img, coords, tiles, done);
          }
        },
        error: e => {
          img.classList.add('map-tile-error');
          img.classList.remove('map-tile-loading');
          done(e, img);
        },
      });
    };
    const img = document.createElement('IMG') as HTMLImageElement;
    img.classList.add('map-tile-loading');
    const url = getTileUrl(tiles, coords, this._map ? this._map.options.crs : undefined);
    fetch(url)
    .then(r => {
      if (r.ok) {
        return r.blob()
        .then(blob => new BinaryContent(blob).toBase64().then(b64 => 'data:' + blob.type + ';base64,' + b64))
        .then(u => {
          img.src = u;
          img.classList.remove('map-tile-loading');
          done(undefined, img);
        });
      }
      if (r.status === 404) {
        Console.warn('Tile not found', url);
        const svg = '<svg width="800px" height="800px" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg">'
          + '<text x="960" y="650" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="100px">'
          + i18n.texts.mapNotAvailable
          + '</text>'
          + '<text x="960" y="800" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="100px">'
          + displayName
          + '</text>'
          + '</svg>';
        img.src = 'data:image/svg+xml;base64,' + btoa(svg);
        img.classList.remove('map-tile-loading');
        done(undefined, img);
        return;
      }
      if (!(img as any)._offlineLoaded) {
        loadOffline(img, 1, url);
      }
      return undefined;
    })
    .catch(_ => {
      Console.error('Cannot fetch tile', url);
      img.onload = () => {
        img.classList.remove('map-tile-loading');
        done(undefined, img);
      };
      img.onerror = e => {
        if (!(img as any)._offlineLoaded) {
          loadOffline(img, 1, url);
        }
      };
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
    return img;
  };
  (tiles as any)['getTileUrl'] = function(coords: L.Coords) { return getTileUrl(this, coords, this._map ? this._map.options.crs : undefined); }
  return tiles;
}

function fallbackTile(img: any, coords: L.Coords, tiles: L.TileLayer, done: L.DoneCallback) {
  if (coords.z === 0) {
    img.classList.remove('map-tile-loading');
    img.classList.add('map-tile-error');
    done(new Error('Cannot load tile'), img);
    return;
  }
  const newCoords = new L.Point(Math.floor(coords.x / 2), Math.floor(coords.y / 2)) as L.Coords;
  newCoords.z = coords.z - 1;
  (tiles as any)['createTile'](newCoords, function(error: Error | undefined, tile: HTMLElement | undefined) {
    if (error) {
      img.classList.remove('map-tile-loading');
      img.classList.add('map-tile-error');
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
    img.classList.remove('map-tile-loading');
    img.classList.add('map-tile-fallback', 'map-tile-fallback-' + scale);
    done(undefined, img);
  });
}

function cancelFallback(img: any) {
  if (img.fallback) {
    img.classList.remove('map-tile-fallback', 'map-tile-fallback-' + img._scale);
    img.style.width = '';
    img.style.height = '';
    img.style.marginTop = '';
    img.style.marginLeft = '';
    img.style.clip = '';
    img.fallback = false;
    img.classList.remove('map-tile-fallback');
  }
}
