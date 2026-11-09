import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { environment } from '@env/environment';
import { ApiError } from '@trailence/services/http/api-error';
import { HttpService } from '@trailence/services/http/http.service';
import { EarthBBox } from '@trailence/utils/latlng';
import { catchError, firstValueFrom, from, map, Observable, of, switchMap, throwError } from 'rxjs';
import { OfflineMapService } from '../offline-map.service';
import { BinaryContent, BinaryContentHolder } from '@trailence/utils/binary-content';
import { NetworkService } from '@trailence/services/network/network.service';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { IdGenerator } from '@trailence/utils/component-utils';

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
  demEncoding?: 'terrarium';
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
    this.demEncoding = config.demEncoding;
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
  public readonly demEncoding: 'terrarium' | undefined;

  public abstract getUrl(x: number, y: number, z: number): string;

  /** Download the tile (only online) and returns it as a blob, or the error. */
  public download(x: number, y: number, z: number): Observable<BinaryContent | DownloadError> {
    const url = this.getUrl(x, y, z);
    switch (this.downloadType) {
      case 'native':
        return this.injector.get(HttpService).getBlob(url).pipe(
          map(blob => new BinaryContent(blob)),
          catchError(e => {
            if (e instanceof ApiError) return of({httpStatus: e.httpCode, message: e.errorMessage});
            return of({httpStatus: undefined, message: '' + e});
          })
        );
      case 'angular':
        return this.injector.get(HttpClient).get(url, {responseType: 'blob', }).pipe(
          map(blob => new BinaryContent(blob)),
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
            if (r.ok) return new BinaryContent(new BinaryContentHolder(
              () => this.getContentType(r.headers),
              () => this.getContentLength(r.headers),
              () => r.blob(),
              () => r.arrayBuffer(),
              () => r.bytes(),
            ));
            return {httpStatus: r.status, message: r.statusText} as DownloadError;
          })
        );
    }
  }

  private getHeader(name: string, headers: Headers): string | undefined {
    let value = headers.get(name);
    if (!value) return undefined;
    const i = value.indexOf(';');
    if (i > 0) value = value.substring(0, i);
    return value;
  }

  private getContentType(headers: Headers): string | undefined { return this.getHeader('Content-Type', headers); }
  private getContentLength(headers: Headers): number | undefined {
    const s = this.getHeader('Content-Length', headers);
    if (!s) return undefined;
    const i = Number.parseInt(s);
    if (Number.isNaN(i)) return undefined;
    return i;
  }

  public async getTileOrFallback(x: number, y: number, z: number): Promise<TileResult> {
    const onlineOrOffline = await this.onlineOrOffline(x, y, z);
    if (onlineOrOffline) return onlineOrOffline;
    const network = this.injector.get(NetworkService);
    // first fallback is zoom + 1
    const hasInternet = network.internet;
    if (z < this.maxZoom) {
      const zoom = await Promise.all([
        this.getForNetwork(hasInternet, x * 2 + 0, y * 2 + 0, z + 1),
        this.getForNetwork(hasInternet, x * 2 + 1, y * 2 + 0, z + 1),
        this.getForNetwork(hasInternet, x * 2 + 0, y * 2 + 1, z + 1),
        this.getForNetwork(hasInternet, x * 2 + 1, y * 2 + 1, z + 1),
      ]);
      const results = zoom.map(tile => tile?.getSingleTile());
      if (results.every(tile => !!tile)) {
        return new TileResult(this, 'fallback', results, x, y, z, x, y, z);
      }
      if (network.internet && !hasInternet) {
        // internet is back while trying to get zoom + 1 => retry online
        const online = await this.online(x, y, z);
        if (online) return online;
      }
    }
    // fallback with less zoom
    return this.fallback(network, x, y, z, Math.floor(x / 2), Math.floor(y / 2), z - 1);
  }

  private async getForNetwork(network: boolean, x: number, y: number, z: number): Promise<TileResult | undefined> {
    if (network) return this.onlineOrOffline(x, y, z);
    return this.offline(x, y, z);
  }

  private async online(x: number, y: number, z: number): Promise<TileResult | undefined> {
    const online = await firstValueFrom(this.download(x, y, z));
    if (online instanceof BinaryContent) return new TileResult(this, 'online', [online], x, y, z, x, y, z);
    if (online.httpStatus === 404) {
      // tile does not exist
      if (this.type === 'raster') {
        // TODO generate a not found image
      }
      return new TileResult(this, 'not-found', online.message, x, y, z, x, y, z);
    }
    return undefined;
  }

  private async onlineOrOffline(x: number, y: number, z: number): Promise<TileResult | undefined> {
    const online = await this.online(x, y, z);
    if (online) return online;
    return await this.offline(x, y, z);
  }

  private async offline(x: number, y: number, z: number): Promise<TileResult | undefined> {
    const offline = await firstValueFrom(this.injector.get(OfflineMapService).getTile(this.name, x, y, z));
    if (offline instanceof BinaryContent) return new TileResult(this, 'offline', [offline], x, y, z, x, y, z);
    return undefined;
  }

  private async fallback(network: NetworkService, originalX: number, originalY: number, originalZ: number, newX: number, newY: number, newZ: number): Promise<TileResult> {
    if (newZ < this.minZoom) return new TileResult(this, 'error', '', originalX, originalY, originalZ, originalX, originalY, originalZ);
    const previousZoom = await this.getForNetwork(network.internet, newX, newY, newZ);
    const previousTile = previousZoom?.getSingleTile();
    if (!previousTile) return this.fallback(network, originalX, originalY, originalZ, Math.floor(newX / 2), Math.floor(newY / 2), newZ - 1);
    return new TileResult(this, 'fallback', [previousTile], originalX, originalY, originalZ, newX, newY, newZ);
  }

}

export interface DownloadError {
  httpStatus: number | undefined;
  message: string;
}

export class TileResult {
  constructor(
    public readonly layer: MapLayer,
    public readonly type: 'online' | 'offline' | 'fallback' | 'not-found' | 'error',
    private readonly result: BinaryContent[] | string,
    private readonly originalX: number,
    private readonly originalY: number,
    private readonly originalZ: number,
    private readonly fallbackX: number,
    private readonly fallbackY: number,
    private readonly fallbackZ: number,
  ) {}

  public hasTile(): boolean {
    return typeof this.result !== 'string';
  }

  public getSingleTile(): BinaryContent | undefined {
    return typeof this.result === 'string' ? undefined : this.result[0];
  }

  public toImageElement(img: HTMLImageElement, ondone: () => void, onerror: (e: Error) => void): void {
    if (this.type === 'not-found') {
      if (this.layer.type !== 'raster') {
        onerror(new Error('Tile not found'));
        return;
      }
      const svg = this.getNotFoundSvgString();
      img.src = 'data:image/svg+xml;base64,' + btoa(svg);
      img.classList.remove('map-tile-error', 'map-tile-loading');
      img.classList.add('map-tile-not-available');
      ondone();
      return;
    }
    if (this.type === 'error') {
      if (this.layer.type !== 'raster') {
        onerror(new Error('Tile cannot be loaded'));
        return;
      }
      const svg = this.getErrorSvgString();
      img.src = 'data:image/svg+xml;base64,' + btoa(svg);
      img.classList.remove('map-tile-loading');
      img.classList.add('map-tile-error');
      ondone();
      return;
    }
    const content = this.result as BinaryContent[];
    if (this.originalZ === this.fallbackZ && content.length === 1) {
      // no scale
      void content[0].toBlob()
      .then(blob => URL.createObjectURL(blob))
      .then(url => {
        img.onload = () => {
          if (this.type === 'offline')
            img.classList.add('map-tile-offline');
          img.classList.remove('map-tile-error', 'map-tile-loading');
          URL.revokeObjectURL(url);
          ondone();
        };
        img.onerror = e => {
          URL.revokeObjectURL(url);
          img.classList.add('map-tile-error');
          img.classList.remove('map-tile-loading');
          onerror(new Error('' + e));
        };
        img.src = url;
      });
      return;
    }
    if (this.fallbackZ < this.originalZ) {
      // fallback with a less zoom
      void content[0].toBlob()
      .then(blob => URL.createObjectURL(blob))
      .then(url => {
        const tileSize = this.layer.tileSize;
        const scale = Math.pow(2, this.originalZ - this.fallbackZ);
        img.style.width = (tileSize * scale) + 'px';
        img.style.height = (tileSize * scale) + 'px';

        const relativeX = this.originalX - this.fallbackX * scale;
        const relativeY = this.originalY - this.fallbackY * scale;
        const left = relativeX * tileSize;
        const top = relativeY * tileSize;
        img.style.marginTop = (-top) + 'px';
        img.style.marginLeft = (-left) + 'px';
        img.style.clip = 'rect(' + top + 'px ' + (left + tileSize) + 'px ' + (top + tileSize) + 'px ' + left + 'px)';
        img.style.clipPath = 'inset(' + top + 'px ' + 'calc(100% - ' + (left + tileSize) + 'px) calc(100% - ' + (top + tileSize) + 'px) ' + left + 'px)';

        img.onload = () => {
          img.classList.add('map-tile-fallback', 'map-tile-fallback-' + scale);
          img.classList.remove('map-tile-error', 'map-tile-loading');
          URL.revokeObjectURL(url);
          ondone();
        };
        img.onerror = e => {
          URL.revokeObjectURL(url);
          img.classList.add('map-tile-error');
          img.classList.remove('map-tile-loading');
          onerror(new Error('' + e));
        };
        img.src = url;
      });
      return;
    }
    // scale with zoom + 1
    void this.mergeTilesToCanvas(content)
    .then(canvas => new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png')))
    .then(blob => {
      if (!blob) {
        img.classList.add('map-tile-error');
        img.classList.remove('map-tile-loading');
        onerror(new Error('Cannot generate tile'));
        return;
      }
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        img.classList.add('map-tile-fallback', 'map-tile-fallback-0.5');
        img.classList.remove('map-tile-error', 'map-tile-loading');
        URL.revokeObjectURL(url);
        ondone();
      };
      img.onerror = e => {
        URL.revokeObjectURL(url);
        img.classList.add('map-tile-error');
        img.classList.remove('map-tile-loading');
        onerror(new Error('' + e));
      };
      img.src = url;
    });
  }

  private async mergeTilesToCanvas(subTiles: BinaryContent[]) {
    const canvas = document.createElement('canvas');
    canvas.width = this.layer.tileSize;
    canvas.height = this.layer.tileSize;

    const ctx = canvas.getContext('2d')!;
    const half = this.layer.tileSize / 2;

    const bitmaps = await Promise.all(subTiles.map(t => t.toBlob().then(blob => createImageBitmap(blob))));

    bitmaps.forEach((img, i) => {
        const x = (i % 2) * half;
        const y = Math.floor(i / 2) * half;
        ctx.drawImage(img, x, y, half, half);
        img.close();
    });

    return canvas;
  }

  private async svgToCanvas(svg: string) {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = this.layer.tileSize;
      canvas.height = this.layer.tileSize;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, this.layer.tileSize, this.layer.tileSize);

      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  public async toArrayBuffer(): Promise<ArrayBuffer> {
    if (this.type === 'not-found') {
      if (this.layer.type !== 'raster') throw new Error('Tile not found');
      const canvas = await this.svgToCanvas(this.getNotFoundSvgString());
      return await this.canvasToArrayBuffer(canvas);
    }
    if (this.type === 'error') {
      if (this.layer.type !== 'raster') throw new Error('Tile cannot be loaded');
      const canvas = await this.svgToCanvas(this.getErrorSvgString());
      return await this.canvasToArrayBuffer(canvas);
    }
    const content = this.result as BinaryContent[];
    if (this.originalZ === this.fallbackZ && content.length === 1) {
      return await content[0].toArrayBuffer();
    }
    if (this.fallbackZ < this.originalZ) {
      // fallback with a less zoom
      const tileSize = this.layer.tileSize;
      const scale = Math.pow(2, this.originalZ - this.fallbackZ);
      const relativeX = this.originalX - this.fallbackX * scale;
      const relativeY = this.originalY - this.fallbackY * scale;
      const fallbackBlob = await content[0].toBlob();
      const fallbackBitmap = await createImageBitmap(fallbackBlob);

      const canvas = document.createElement('canvas');
      canvas.width = tileSize;
      canvas.height = tileSize;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(
        fallbackBitmap,
        relativeX * fallbackBitmap.width / scale,
        relativeY * fallbackBitmap.height / scale,
        fallbackBitmap.width / scale,
        fallbackBitmap.height / scale,
        0, 0,
        tileSize, tileSize
      );
      fallbackBitmap.close();
      return await this.canvasToArrayBuffer(canvas);
    }
    // scale with zoom + 1
    const canvas = await this.mergeTilesToCanvas(content);
    return await this.canvasToArrayBuffer(canvas);
  }

  private async canvasToArrayBuffer(canvas: HTMLCanvasElement) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Cannot generate tile');
    return await blob.arrayBuffer();
  }

  private getNotFoundSvgString(): string {
    const id = IdGenerator.generateId();
    return '<svg width="800px" height="800px" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg">'
      + '<defs>'
      + '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="80" height="80" patternTransform="rotate(-45)">'
      + '<rect width="80" height="80" fill="rgba(128,128,128,0.2)" />'
      + '<rect width="40" height="80" fill="rgba(128,128,128,0.3)" />'
      + '</pattern>'
      + '</defs>'
      + '<rect width="1920" height="1920" fill="url(#' + id + ')" />'
      + '<text x="960" y="650" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="100px">'
      + this.layer.injector.get(I18nService).texts.mapNotAvailable
      + '</text>'
      + '<text x="960" y="800" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="100px">'
      + this.layer.displayName
      + '</text>'
      + '</svg>';
  }

  private getErrorSvgString(): string {
    const id = IdGenerator.generateId();
    return '<svg width="800px" height="800px" viewBox="0 0 1920 1920" xmlns="http://www.w3.org/2000/svg">'
      + '<defs>'
      + '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="80" height="80" patternTransform="rotate(-45)">'
      + '<rect width="80" height="80" fill="rgba(255,128,0,0.2)" />'
      + '<rect width="40" height="80" fill="rgba(255,128,0,0.3)" />'
      + '</pattern>'
      + '</defs>'
      + '<rect width="1920" height="1920" fill="url(#' + id + ')" />'
      + '</svg>';
  }
}
