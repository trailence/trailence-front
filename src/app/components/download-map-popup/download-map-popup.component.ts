import { Component, Input, ViewChild } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonContent, IonRange, IonFooter, IonButtons, IonButton, ModalController } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MapLayerSelectionComponent } from '../map-layer-selection/map-layer-selection.component';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { MapLayer } from 'src/app/services/map/map-layers.service';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import * as L from 'leaflet';
import { Track } from 'src/app/model/track';

@Component({
  selector: 'app-download-map-popup',
  templateUrl: './download-map-popup.component.html',
  styleUrls: ['./download-map-popup.component.scss'],
  standalone: true,
  imports: [IonButton, IonButtons, IonFooter, IonRange, IonContent, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, MapLayerSelectionComponent ]
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
    private modalController: ModalController,
    private offlineMap: OfflineMapService,
  ) { }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  launchDownloadMap(selection: {layer: MapLayer, tiles: L.TileLayer}[]): void {
    this.preferencesService.setOfflineMapMaxZoom(this.downloadMapMaxZoom!.value as number)
    const padding = ((this.downloadMapPadding!.value as number) - 100) / 100;
    this.modalController.dismiss(null, 'cancel');
    const allBounds: L.LatLngBounds[] = [];
    if (this.bounds) {
      allBounds.push(this.bounds);
    }
    if (this.tracks) {
      for (const track of this.tracks) {
        let bounds = track.getBounds();
        if (!bounds) continue;
        if (padding > 0) bounds = bounds.pad(padding);
        allBounds.push(bounds);
      }
    }
    if (allBounds.length === 0) return;
    for (const layer of selection) {
      this.offlineMap.save(allBounds, layer.tiles, L.CRS.EPSG3857, layer.layer);
    }
  }

}
