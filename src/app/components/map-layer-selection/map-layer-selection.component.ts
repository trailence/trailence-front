import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MapLayer, MapLayersService } from 'src/app/services/map/map-layers.service';
import * as L from 'leaflet';
import { CommonModule } from '@angular/common';
import { IonRadio, IonRadioGroup, IonCheckbox } from "@ionic/angular/standalone";
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-map-layer-selection',
  templateUrl: './map-layer-selection.component.html',
  styleUrls: ['./map-layer-selection.component.scss'],
  standalone: true,
  imports: [IonCheckbox, IonRadioGroup, IonRadio, CommonModule, ]
})
export class MapLayerSelectionComponent {

  @Input() multiple = false;

  @Output() selectionChange = new EventEmitter<string[]>();

  selection: string[] = [];

  layers: {layer: MapLayer, tiles: L.TileLayer}[] = [];
  assertsUrl = environment.assetsUrl;

  constructor(
    private service: MapLayersService,
  ) {
    for (const l of service.layers) {
      this.layers.push({layer: l, tiles: l.create()});
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

  getSelectedLayers(): {layer: MapLayer, tiles: L.TileLayer}[] {
    const result: {layer: MapLayer, tiles: L.TileLayer}[] = [];
    for (const layer of this.layers) {
      if (this.selection.indexOf(layer.layer.name) >= 0) {
        result.push(layer);
      }
    }
    return result;
  }

}
