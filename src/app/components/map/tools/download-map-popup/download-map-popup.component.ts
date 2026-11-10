import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonRange, IonFooter, IonButtons, IonButton, ModalController, IonSpinner, IonCheckbox } from "@ionic/angular";
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { MapLayerSelectionComponent } from '../../../map-layer-selection/map-layer-selection.component';
import { PreferencesService } from '@trailence/services/preferences/preferences.service';
import { OfflineMapService } from '@trailence/services/map/offline-map.service';
import { Track } from '@trailence/model/track';
import { NetworkService } from '@trailence/services/network/network.service';
import { AsyncPipe } from '@angular/common';
import { Arrays } from '@trailence/utils/arrays';
import { BehaviorSubject, debounceTime, switchMap, tap } from 'rxjs';
import { calculateTilesFromBounds, calculateTilesFromPaths } from '@trailence/services/map/calculate-tiles';
import { getLogger } from '@trailence/utils/console';
import { bboxPadRatio, cleanBbox, EarthBBox, EarthPoint } from '@trailence/utils/latlng';
import { MapLayer } from '@trailence/services/map/layers/map-layer';
import { Point2D } from '@trailence/utils/geometry-utils';
import { MapLayersService, WEBGL_SUPPORT } from '@trailence/services/map/map-layers.service';

const logger = getLogger('download-map-popup');

@Component({
    selector: 'app-download-map-popup',
    templateUrl: './download-map-popup.component.html',
    styleUrls: [],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
      IonButton, IonButtons, IonFooter, IonRange, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, IonSpinner, IonCheckbox,
      AsyncPipe,
      MapLayerSelectionComponent,
    ]
})
export class DownloadMapPopupComponent implements OnInit, OnChanges {

  @Input() tracks?: Track[];
  @Input() bounds?: EarthBBox;
  @Input() layer?: string;

  options: DownloadOptions = { zoom: 13, extendPercent: 100, layers: [], include3d: false };

  percentageFormatter = (value: number) => '' + value + '%';

  @ViewChild('layerSelection') layerSelection?: MapLayerSelectionComponent;

  private readonly optionsChanged = new BehaviorSubject<boolean>(true);
  computing = false;
  can3d = WEBGL_SUPPORT;

  constructor(
    public i18n: I18nService,
    public preferencesService: PreferencesService,
    private readonly modalController: ModalController,
    private readonly offlineMap: OfflineMapService,
    public readonly networkService: NetworkService,
    private readonly mapLayersService: MapLayersService,
  ) { }

  ngOnInit(): void {
    this.options.zoom = this.preferencesService.preferences.offlineMapMaxZoom;
    this.options.extendPercent = this.tracks && this.tracks.length > 0 ? 150 : 100;
    if (this.layer) this.options.layers = [this.layer];
    this.optionsChanged.pipe(
      tap(() => this.computing = true),
      debounceTime(1000),
      switchMap(() => this.computeDownload()),
      tap(() => this.computing = false)
    ).subscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tracks']) this.setExtendPercent(this.tracks && this.tracks.length > 0 ? 150 : 100);
    if (changes['layer']) this.setLayers(this.layer ? [this.layer] : []);
  }

  close(): Promise<boolean> {
    return this.modalController.dismiss(null, 'cancel');
  }

  setZoom(value: any): void {
    const zoom = value as number;
    if (zoom === this.options.zoom) return;
    this.options.zoom = zoom;
    this.optionsChanged.next(true);
  }

  setExtendPercent(value: any): void {
    const percent = value as number;
    if (percent === this.options.extendPercent) return;
    this.options.extendPercent = percent;
    this.optionsChanged.next(true);
  }

  setLayers(layers: string[]): void {
    if (Arrays.sameContent(this.options.layers, layers)) return;
    this.options.layers = [...layers];
    this.optionsChanged.next(true);
  }

  setInclude3d(include: boolean): void {
    if (this.options.include3d === include) return;
    this.options.include3d = include;
    this.optionsChanged.next(true);
  }

  private getSelection(): MapLayer[] {
    return [...this.layerSelection!.getSelectedLayers(), ...(this.options.include3d ? [this.mapLayersService.getDefaultLayer('raster-dem')] : [])];
  }

  percentDone = 0;
  nbDone = 0;
  nbDownload: number | undefined = undefined;
  cache = new Map<number, Map<string, Map<number, {points: Point2D[], toDownload: Point2D[]}>>>();

  private async computeDownload() {
    this.percentDone = 0;
    this.nbDone = 0;
    if (this.options.layers.length === 0) {
      this.nbDownload = undefined;
      return;
    }
    this.nbDownload = 0;
    const maxZoom = this.options.zoom;
    const padding = (this.options.extendPercent - 100) / 100;
    const params = this.getBoundsAndPaths(maxZoom, padding);
    const result = new Map<string, Map<number, Point2D[]>>();
    let cachePadding = this.cache.get(this.options.extendPercent);
    if (!cachePadding) {
      cachePadding = new Map<string, Map<number, {points: Point2D[], toDownload: Point2D[]}>>();
      this.cache.set(this.options.extendPercent, cachePadding);
    }
    const layersCounts: Promise<number>[] = [];
    for (const layer of this.getSelection()) {
      let layerCache = cachePadding.get(layer.name);
      if (!layerCache) {
        layerCache = new Map<number, {points: Point2D[], toDownload: Point2D[]}>();
        cachePadding.set(layer.name, layerCache);
      }
      layersCounts.push(this.computeLayerDownload(layer, maxZoom, params, layerCache, result));
    }
    const counts = await Promise.all(layersCounts);
    const total = counts.reduce((p,n) => p + n, 0);
    this.nbDownload = total - this.nbDone;
    this.percentDone = Math.floor(this.nbDone * 100 / total);
    return {toDownload: result, params};
  }

  private async computeLayerDownload(layer: MapLayer, maxZoom: number, params: {allBounds: EarthBBox[], paths: EarthPoint[], pathAroundMeters: number}, layerCache: Map<number, {points: Point2D[], toDownload: Point2D[]}>, result: Map<string, Map<number, Point2D[]>>): Promise<number> {
    const layerResult = new Map<number, Point2D[]>();
    let layerTotal = 0;
    const zoomsPromises: Promise<{points: Point2D[], toDownload: Point2D[]}>[] = [];
    for (let zoom = Math.max(layer.minZoom, 1); zoom <= Math.min(maxZoom, layer.maxZoom); ++zoom) {
      let zoomCache = layerCache.get(zoom);
      let zoomCalculation$: Promise<{points: Point2D[], toDownload: Point2D[]}>;
      if (zoomCache) {
        layerTotal += zoomCache.points.length;
        this.nbDone += zoomCache.points.length - zoomCache.toDownload.length;
        zoomCalculation$ = Promise.resolve(zoomCache);
      } else {
        const calculation$ = zoom <= 17 || params.paths.length === 0 ?
          calculateTilesFromBounds(zoom, params.allBounds, layer.tileSize) :
          calculateTilesFromPaths(zoom, params.paths, params.pathAroundMeters, layer.tileSize);
        const points$ = calculation$.catch(e => {logger.error(e); return [];});
        zoomCalculation$ = points$.then(async points => {
          try {
            return {points, toDownload: await this.offlineMap.getTilesToDownload(points, zoom, layer.name)};
          } catch (e) {
            logger.error(e);
            return {points, toDownload: []};
          }
        }).then(result => {
          layerTotal += result.points.length;
          this.nbDone += result.points.length - result.toDownload.length;
          zoomCache = result;
          layerCache.set(zoom, zoomCache);
          return zoomCache;
        });
      }
      zoomCalculation$ = zoomCalculation$.then(cache => {
        if (cache.toDownload.length > 0)
          layerResult.set(zoom, cache.toDownload);
        return cache;
      });
      zoomsPromises.push(zoomCalculation$);
    }
    await Promise.all(zoomsPromises);
    if (layerResult.size > 0)
      result.set(layer.name, layerResult);
    return layerTotal;
  }

  private getBoundsAndPaths(maxZoom: number, padding: number): {allBounds: EarthBBox[], paths: EarthPoint[], pathAroundMeters: number} {
    const allBounds: EarthBBox[] = [];
    const paths: EarthPoint[] = [];
    if (this.bounds) {
      allBounds.push(this.bounds);
    }
    if (this.tracks) {
      for (const track of this.tracks) {
        let bounds = track.metadata.bounds;
        if (bounds) {
          if (padding > 0) bounds = bboxPadRatio(bounds, padding);
          allBounds.push(bounds);
        }
        if (maxZoom > 17) {
          paths.push(...track.getAllPositions());
        }
      }
    }
    cleanBbox(allBounds);
    const pathAroundMeters = 100 + 1000 * padding;
    return {allBounds, paths, pathAroundMeters};
  }

  launchDownloadMap(): void {
    this.preferencesService.setOfflineMapMaxZoom(this.options.zoom);
    const selection = this.getSelection();
    Promise.all([
      this.computeDownload(),
      this.close()
    ]).then(([computed, _]) => {
      if (computed) this.downloadMaps(computed.toDownload, selection, computed.params.allBounds);
    }).catch(e => logger.error(e));
  }

  private downloadMaps(computed: Map<string, Map<number, Point2D[]>>, selection: MapLayer[], allBounds: EarthBBox[]): void {
    for (const layer of selection) {
      const toDownload = computed.get(layer.name);
      if (toDownload) {
        logger.info('Launch download of offline map layer', layer.name, 'zooms', Array.from(toDownload.entries()).map(e => 'zoom ' + e[0] + '=' + e[1].length));
        this.offlineMap.save(layer, toDownload);
      }
    }
    this.offlineMap.saveOsm(allBounds);
  }

}

interface DownloadOptions {
  zoom: number;
  extendPercent: number;
  layers: string[];
  include3d: boolean;
}
