import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { AuthService } from '../auth/auth.service';
import Dexie from 'dexie';
import { MapLayer, MapLayersService } from './map-layers.service';
import { ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';
import { Observable, combineLatest, from, map, of, zip } from 'rxjs';
import { RequestLimiter } from 'src/app/utils/request-limiter';
import { HttpService } from '../http/http.service';
import { BinaryContent } from 'src/app/utils/binary-content';
import { PreferencesService } from '../preferences/preferences.service';

interface TileMetadata {
  key: string;
  size: number;
  date: number;
}

interface TileBlob {
  key: string;
  blob: Blob;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineMapService {

  private _db?: Dexie;
  private _openEmail?: string;

  constructor(
    auth: AuthService,
    private layers: MapLayersService,
    private progressService: ProgressService,
    private i18n: I18nService,
    private http: HttpService,
    private preferencesService: PreferencesService,
  ) {
    auth.auth$.subscribe(
      auth => {
        if (!auth) this.close();
        else this.open(auth.email);
      }
    );
  }

  private close() {
    if (this._db) {
      this._db.close();
      this._openEmail = undefined;
      this._db = undefined;
    }
  }

  private open(email: string): void {
    if (this._openEmail === email) return;
    this.close();
    this._openEmail = email;
    const db = new Dexie('trailence_offline_map_' + email);
    const storesV1: any = {};
    for (const layer of this.layers.layers) {
      storesV1[layer.name + '_meta'] = 'key, date';
      storesV1[layer.name + '_tiles'] = 'key';
    }
    db.version(1).stores(storesV1);
    this._db = db;
  }

  public save(bounds: L.LatLngBounds[], tiles: L.TileLayer, crs: L.CRS, layer: MapLayer): void {
    const coords: L.Coords[] = [];
    for (const b of bounds) {
      const c = this.computeTilesCoords(b, tiles, crs);
      for (const coord of c) {
        const exists = coords.find(e => e.x === coord.x && e.y === coord.y && e.z === coord.z);
        if (!exists) coords.push(coord);
      }
    }
    if (coords.length === 0) return;
    const progress = this.progressService.create(this.i18n.texts.downloading_map, coords.length);
    const db = this._db!;
    const metaTable = db.table<TileMetadata>(layer.name + '_meta');
    const tilesTables = db.table<TileBlob>(layer.name + '_tiles');
    const existing$: Observable<TileMetadata | undefined>[] = [];
    for (const c of coords) {
      const key = '' + c.z + '_' + c.y + '_' + c.x;
      existing$.push(from(metaTable.get(key)));
    }
    const maxTime = Date.now() - this.preferencesService.preferences.offlineMapMaxKeepDays * 24 * 60 * 60 * 1000;
    combineLatest(existing$).subscribe(
      result => {
        const coordsToDl = [];
        for (let i = 0; i < coords.length; ++i) {
          const known = result[i];
          if (known && known.date > maxTime) continue;
          coordsToDl.push(coords[i]);
        }
        if (coordsToDl.length === 0) {
          progress.done();
          return;
        }
        progress.subTitle = layer.displayName + ' 0/' + coordsToDl.length;
        progress.workAmount = coordsToDl.length;
        const limiter = new RequestLimiter(layer.maxConcurrentRequests);
        let done = 0;
        for (const c of coordsToDl) {
          const request$ = limiter.add(() => this.http.getBlob(layer.getTileUrl(tiles, c, crs)));
          request$.subscribe({
            next: blob => {
              zip([
                from(metaTable.put({
                  key: '' + c.z + '_' + c.y + '_' + c.x,
                  size: blob.size,
                  date: Date.now()
                })),
                from(tilesTables.put({
                  key: '' + c.z + '_' + c.y + '_' + c.x,
                  blob: blob
                }))
              ]).subscribe(() => {
                progress.workDone = ++done;
                progress.subTitle = layer.displayName + ' ' + done + '/' + coordsToDl.length;
                if (done === coordsToDl.length) progress.done();
              });
            },
            error: e => {
              progress.workDone = ++done;
              progress.subTitle = layer.displayName + ' ' + done + '/' + coordsToDl.length;
              if (done === coordsToDl.length) progress.done();
            }
          });
        }
      }
    );
  }

  public computeTilesCoords(bounds: L.LatLngBounds, layer: L.TileLayer, crs: L.CRS): L.Coords[] {
    const coords: L.Coords[] = [];
    const maxZoom = this.preferencesService.preferences.offlineMapMaxZoom;
    for (let zoom = 1; zoom <= Math.min(layer.options.maxZoom!, maxZoom); zoom++) {
      const area = L.bounds(
        crs.latLngToPoint(bounds.getNorthWest(), zoom),
        crs.latLngToPoint(bounds.getSouthEast(), zoom)
      );
      const points = this.getTilesPoints(area, layer.getTileSize());
      for (const point of points) {
        (point as any)['z'] = zoom;
        coords.push(point as L.Coords);
      }
    }
    return coords;
  }

  public getTilesPoints(area: L.Bounds, tileSize: L.Point): L.Point[] {
    const points: L.Point[] = [];
    if (!area.min || !area.max) {
      return points;
    }
    const topLeftTile = area.min.divideBy(tileSize.x).floor();
    const bottomRightTile = area.max.divideBy(tileSize.x).floor();

    for (let j = topLeftTile.y; j <= bottomRightTile.y; j += 1) {
      for (let i = topLeftTile.x; i <= bottomRightTile.x; i += 1) {
        points.push(new L.Point(i, j));
      }
    }
    return points;
  }

  public getTile(layerName: string, coords: L.Coords): Observable<BinaryContent | undefined> {
    if (!this._db) return of(undefined);
    return from(this._db.table<TileBlob>(layerName + '_tiles').get('' + coords.z + '_' + coords.y + '_' + coords.x)).pipe(
      map(result => {
        const blob = result?.blob;
        if (!blob) return undefined;
        return new BinaryContent(blob);
      })
    );
  }

}