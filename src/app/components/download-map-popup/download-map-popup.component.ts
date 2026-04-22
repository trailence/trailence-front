import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonRange, IonFooter, IonButtons, IonButton, ModalController, IonSpinner } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapLayerSelectionComponent } from '../map-layer-selection/map-layer-selection.component';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { MapLayer } from 'src/app/services/map/map-layers.service';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import * as L from 'leaflet';
import { Track } from 'src/app/model/track';
import { NetworkService } from 'src/app/services/network/network.service';
import { LeafletUtils } from 'src/app/utils/leaflet-utils';
import { AsyncPipe } from '@angular/common';
import { Arrays } from 'src/app/utils/arrays';
import { BehaviorSubject, debounceTime, switchMap, tap } from 'rxjs';
import { calculateTilesFromBounds, calculateTilesFromPaths } from 'src/app/services/map/calculate-tiles';

@Component({
    selector: 'app-download-map-popup',
    templateUrl: './download-map-popup.component.html',
    styleUrls: [],
    imports: [IonButton, IonButtons, IonFooter, IonRange, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, IonSpinner, MapLayerSelectionComponent, AsyncPipe]
})
export class DownloadMapPopupComponent implements OnInit, OnChanges {

  @Input() tracks?: Track[];
  @Input() bounds?: L.LatLngBounds;
  @Input() layer?: string;

  options: DownloadOptions = { zoom: 13, extendPercent: 100, layers: [] };

  percentageFormatter = (value: number) => '' + value + '%';

  @ViewChild('layerSelection') layerSelection?: MapLayerSelectionComponent;

  private readonly optionsChanged = new BehaviorSubject<boolean>(true);
  computing = false;

  constructor(
    public i18n: I18nService,
    public preferencesService: PreferencesService,
    private readonly modalController: ModalController,
    private readonly offlineMap: OfflineMapService,
    public readonly networkService: NetworkService,
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

  private getSelection(): {layer: MapLayer, tiles: L.TileLayer}[] {
    return this.layerSelection!.getSelectedLayers();
  }

  percentDone = 0;
  nbDone = 0;
  nbDownload: number | undefined = undefined;
  cache = new Map<number, Map<string, Map<number, {points: L.Point[], toDownload: L.Point[]}>>>();

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
    const crs = L.CRS.EPSG3857;
    const result = new Map<string, Map<number, L.Point[]>>();
    let cachePadding = this.cache.get(this.options.extendPercent);
    if (!cachePadding) {
      cachePadding = new Map<string, Map<number, {points: L.Point[], toDownload: L.Point[]}>>();
      this.cache.set(this.options.extendPercent, cachePadding);
    }
    let total = 0;
    for (const layer of this.getSelection()) {
      let layerCache = cachePadding.get(layer.layer.name);
      if (!layerCache) {
        layerCache = new Map<number, {points: L.Point[], toDownload: L.Point[]}>();
        cachePadding.set(layer.layer.name, layerCache);
      }
      const layerResult = new Map<number, L.Point[]>();
      for (let zoom = 1; zoom <= maxZoom; ++zoom) {
        let zoomCache = layerCache.get(zoom);
        if (zoomCache) {
          total += zoomCache.points.length;
          this.nbDone += zoomCache.points.length - zoomCache.toDownload.length;
        } else {
          const calculation$ = zoom <= 17 || params.paths.length === 0 ?
            calculateTilesFromBounds(zoom, params.allBounds, crs, layer.layer.tileSize) :
            calculateTilesFromPaths(zoom, params.paths, params.pathAroundMeters, crs, layer.layer.tileSize);
          const points = await calculation$;
          const toDownload = await this.offlineMap.getTilesToDownload(points, zoom, layer.layer.name);
          total += points.length;
          this.nbDone += points.length - toDownload.length;
          zoomCache = {points, toDownload};
          layerCache.set(zoom, zoomCache);
        }
        if (zoomCache.toDownload.length > 0)
          layerResult.set(zoom, zoomCache.toDownload);
      }
      if (layerResult.size > 0)
        result.set(layer.layer.name, layerResult);
    }
    this.nbDownload = total - this.nbDone;
    this.percentDone = Math.floor(this.nbDone * 100 / total);
    return {toDownload: result, params};
  }

  private getBoundsAndPaths(maxZoom: number, padding: number): {allBounds: L.LatLngBounds[], paths: L.LatLngExpression[], pathAroundMeters: number} {
    const allBounds: L.LatLngBounds[] = [];
    const paths: L.LatLngExpression[] = [];
    if (this.bounds) {
      allBounds.push(this.bounds);
    }
    if (this.tracks) {
      for (const track of this.tracks) {
        let bounds = track.metadata.bounds;
        if (bounds) {
          if (padding > 0) bounds = bounds.pad(padding);
          allBounds.push(bounds);
        }
        if (maxZoom > 17) {
          paths.push(...track.getAllPositions());
        }
      }
    }
    LeafletUtils.cleanBounds(allBounds);
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
    });
  }

  private downloadMaps(computed: Map<string, Map<number, L.Point[]>>, selection: {layer: MapLayer, tiles: L.TileLayer}[], allBounds: L.LatLngBounds[]): void {
    for (const layer of selection) {
      const toDownload = computed.get(layer.layer.name);
      if (toDownload)
        this.offlineMap.save(layer.layer, L.CRS.EPSG3857, layer.tiles, toDownload);
    }
    this.offlineMap.saveOsm(allBounds);
  }

}

interface DownloadOptions {
  zoom: number;
  extendPercent: number;
  layers: string[];
}
