import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { environment } from '@env/environment';
import { ApiError } from '@trailence/services/http/api-error';
import { HttpService } from '@trailence/services/http/http.service';
import { EarthBBox } from '@trailence/utils/latlng';
import { catchError, from, map, Observable, of, switchMap, throwError } from 'rxjs';
import { OfflineMapService } from '../offline-map.service';
import { BinaryContent } from '@trailence/utils/binary-content';

// `true` for browsers on a high-resolution "retina" screen
export const RETINA = window.devicePixelRatio > 1;

export type MapDownloadType = 'native' | 'angular' | 'fetch';
export type MapLayerType = 'raster' | 'raster-dem' | 'raster-overlay';

export interface RegionalSettings {
  code: string;
}

export interface BaseLayerConfig {
  name: string;
  displayName: string;
  type: MapLayerType;
  example: string;
  regional?: RegionalSettings;
  minZoom?: number;
  maxZoom: number;
  zoomReverse?: boolean;
  zoomOffset?: number;
  attribution: string;
  maxConcurrentRequests: number;
  downloadType?: MapDownloadType;
  mimeFormat: string;
  tileSize?: number;
  bounds?: EarthBBox;
}

export abstract class MapLayer {
  constructor(public readonly injector: Injector, config: BaseLayerConfig) {
    this.name = config.name;
    this.displayName = config.displayName;
    this.type = config.type;
    this.exampleUrl = environment.assetsUrl + '/map-layers/' + config.example;
    this.regional = config.regional;
    this.minZoom = config.minZoom ?? 0;
    this.maxZoom = config.maxZoom;
    this.zoomReverse = config.zoomReverse ?? false;
    this.zoomOffset = config.zoomOffset ?? 0;
    this.attribution = config.attribution;
    this.maxConcurrentRequests = config.maxConcurrentRequests;
    this.downloadType = config.downloadType ?? 'native';
    this.mimeFormat = config.mimeFormat;
    this.tileSize = config.tileSize ?? 256;
    this.bounds = config.bounds;
  }

  public readonly name: string;
  public readonly displayName: string;
  public readonly type: MapLayerType;
  public readonly exampleUrl: string;
  public readonly regional: RegionalSettings | undefined;
  public readonly minZoom: number;
  public readonly maxZoom: number;
  public readonly zoomReverse: boolean;
  public readonly zoomOffset: number;
  public readonly attribution: string;
  public readonly maxConcurrentRequests: number;
  public readonly downloadType: MapDownloadType;
  public readonly mimeFormat: string;
  public readonly tileSize: number;
  public readonly bounds: EarthBBox | undefined;

  public abstract getUrl(x: number, y: number, z: number): string;

  /** Download the tile (only online) and returns it as a blob, or the error. */
  public download(x: number, y: number, z: number): Observable<Blob | DownloadError> {
    const url = this.getUrl(x, y, z);
    switch (this.downloadType) {
      case 'native':
        return this.injector.get(HttpService).getBlob(url).pipe(
          catchError(e => {
            if (e instanceof ApiError) return of({httpStatus: e.httpCode, message: e.errorMessage});
            return of({httpStatus: undefined, message: '' + e});
          })
        );
      case 'angular':
        return this.injector.get(HttpClient).get(url, {responseType: 'blob', }).pipe(
          catchError(e => {
            if (e instanceof HttpErrorResponse) return of({httpStatus: e.status, message: e.message});
            const s = e['status'];
            const m = e['message'];
            return of({httpStatus: typeof s === 'number' ? s : undefined, message: typeof m === 'string' ? m : '' + e});
          })
        );
      case 'fetch':
        return from(
          fetch(url)
          .then(r => {
            if (r.ok) return r.blob() as Promise<Blob | DownloadError>;
            return Promise.resolve({httpStatus: r.status, message: r.statusText}) as Promise<Blob | DownloadError>;
          })
        );
    }
  }

  public getTileOrFallback(x: number, y: number, z: number): Observable<TileResult> {
    return this.download(x, y, z).pipe(
      switchMap(result => {
        if (result instanceof Blob) return of({type: 'online', img: new BinaryContent(result)} as TileResult);
        if (result.httpStatus === 404) {
          // tile does not exist
          if (this.type === 'raster') {
            // TODO generate a not found image
          }
          return throwError(() => new Error('Tile not found'));
        }
        // try to get offline
        return this.injector.get(OfflineMapService).getTile(this.name, x, y, z).pipe(
          switchMap(result => {
            if (result) return of({type: 'offline', img: result} as TileResult);
            // TODO fallback, then when network comes back, retry
            return throwError(() => new Error('TODO'));
          })
        );
      })
    );
  }

}

export interface DownloadError {
  httpStatus: number | undefined;
  message: string;
}
export interface TileResult {
  type: 'online' | 'offline' | 'fallback' | 'not-found';
  img: BinaryContent;
}
