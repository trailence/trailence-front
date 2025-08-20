import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MapLayer, MapLayersService } from 'src/app/services/map/map-layers.service';
import * as L from 'leaflet';
import { CommonModule } from '@angular/common';
import { IonRadio, IonRadioGroup, IonCheckbox, IonHeader, IonToolbar, IonIcon, IonTitle, IonLabel, IonFooter, IonButtons, IonButton, ModalController } from "@ionic/angular/standalone";
import { environment } from 'src/environments/environment';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
    selector: 'app-map-layer-selection',
    templateUrl: './map-layer-selection.component.html',
    styleUrls: ['./map-layer-selection.component.scss'],
    imports: [
      IonIcon, IonToolbar, IonHeader, IonCheckbox, IonRadioGroup, IonRadio, IonTitle, IonLabel, IonButton, IonButtons, IonFooter,
      CommonModule,
    ]
})
export class MapLayerSelectionComponent implements OnInit {

  @Input() multiple = false;
  @Input() buttons = false;
  @Input() popup = false;
  @Input() initialSelection: string[] = [];
  @Input() onSelectionChanged?: (selection: string[]) => void;
  @Input() enableOverlays = false;
  @Input() initialOverlaysSelection: string[] = [];
  @Input() onOverlaysSelectionChanged?: (selection: string[]) => void;

  @Output() selectionChange = new EventEmitter<string[]>();
  @Output() overlaysSelectionChange = new EventEmitter<string[]>();

  selection: string[] = [];
  overlaysSelection: string[] = [];

  layers: {layer: MapLayer, tiles: L.TileLayer}[] = [];
  assertsUrl = environment.assetsUrl;
  overlays: MapLayer[] = [];

  constructor(
    public readonly i18n: I18nService,
    service: MapLayersService,
    private readonly modalController: ModalController,
  ) {
    for (const l of service.layers) {
      this.layers.push({layer: l, tiles: l.create()});
    }
    this.overlays = service.overlays;
  }

  ngOnInit(): void {
    if (this.initialSelection.length > 0) this.selection = [...this.initialSelection];
    if (this.enableOverlays && this.initialOverlaysSelection.length > 0) this.overlaysSelection = [...this.initialOverlaysSelection];
    if (this.onSelectionChanged) {
      this.selectionChange.subscribe(event => this.onSelectionChanged!(event));
    }
    if (this.onOverlaysSelectionChanged) {
      this.overlaysSelectionChange.subscribe(event => this.onOverlaysSelectionChanged!(event));
    }
  }

  select(value: string, selected: boolean, unselectOthers: boolean): void {
    if (unselectOthers) {
      if (this.multiple) return;
      this.selection = [value];
    } else if (selected) {
      this.selection.push(value);
    } else {
      const index = this.selection.indexOf(value);
      if (index >= 0) this.selection.splice(index, 1);
    }
    this.selectionChange.emit(this.selection);
  }

  layerClick(layer: {layer: MapLayer, tiles: L.TileLayer}): void {
    if (this.multiple) {
      const index = this.selection.indexOf(layer.layer.name);
      if (index >= 0) {
        this.selection.splice(index, 1);
      } else {
        this.selection.push(layer.layer.name);
      }
    } else if (this.selection.length > 0 && this.selection[0] === layer.layer.name) {
      this.selection = [];
    } else {
      this.selection = [layer.layer.name];
    }
    this.selectionChange.emit(this.selection);
  }

  getSelectedLayers(): {layer: MapLayer, tiles: L.TileLayer}[] {
    const result: {layer: MapLayer, tiles: L.TileLayer}[] = [];
    for (const layer of this.layers) {
      if (this.selection.indexOf(layer.layer.name) >= 0) {
        result.push(layer);
      }
    }
    return result;
  }

  selectOverlay(value: string, selected: boolean): void {
    const index = this.overlaysSelection.indexOf(value);
    if (selected) {
      if (index < 0) this.overlaysSelection.push(value);
      else return;
    } else {
      if (index >= 0) this.overlaysSelection.splice(index, 1);
      else return;
    }
    this.overlaysSelectionChange.emit(this.overlaysSelection);
  }

  close(): void {
    this.modalController.dismiss();
  }

}
