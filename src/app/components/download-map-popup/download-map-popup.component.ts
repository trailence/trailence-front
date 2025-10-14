import { Component, Input, ViewChild } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonRange, IonFooter, IonButtons, IonButton, ModalController } from "@ionic/angular/standalone";
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

@Component({
    selector: 'app-download-map-popup',
    templateUrl: './download-map-popup.component.html',
    styleUrls: [],
    imports: [IonButton, IonButtons, IonFooter, IonRange, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, MapLayerSelectionComponent, AsyncPipe]
})
export class DownloadMapPopupComponent {

  @Input() tracks?: Track[];
  @Input() bounds?: L.LatLngBounds;

  @ViewChild('downloadMapMaxZoom') downloadMapMaxZoom?: IonRange;
  @ViewChild('downloadMapPadding') downloadMapPadding?: IonRange;

  percentageFormatter = (value: number) => '' + value + '%';

  constructor(
    public i18n: I18nService,
    public preferencesService: PreferencesService,
    private readonly modalController: ModalController,
    private readonly offlineMap: OfflineMapService,
    public readonly networkService: NetworkService,
  ) { }

  close(): Promise<boolean> {
    return this.modalController.dismiss(null, 'cancel');
  }

  launchDownloadMap(selection: {layer: MapLayer, tiles: L.TileLayer}[]): void {
    const maxZoom = this.downloadMapMaxZoom!.value as number;
    this.preferencesService.setOfflineMapMaxZoom(maxZoom);
    const padding = ((this.downloadMapPadding!.value as number) - 100) / 100;
    this.close()
    .then(() => {
      setTimeout(() => this.downloadMaps(maxZoom, padding, selection), 0);
    });
  }

  private downloadMaps(maxZoom: number, padding: number, selection: {layer: MapLayer, tiles: L.TileLayer}[]): void { // NOSONAR
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
    if (allBounds.length === 0) return;

    LeafletUtils.cleanBounds(allBounds);
    const pathAroundMeters = 100 + 1000 * padding;
    for (const layer of selection) {
      this.offlineMap.save(
        layer.layer, L.CRS.EPSG3857, layer.tiles,
        1, maxZoom,
        allBounds, paths, pathAroundMeters
      );
    }
  }

}
