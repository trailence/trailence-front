import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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
export class MapLayerSelectionComponent implements OnInit {

  @Input() multiple = false;
  @Input() buttons = false;
  @Input() popup = false;
  @Input() initialSelection: string[] = [];
  @Input() onSelectionChanged?: (selection: string[]) => void;

  @Output() selectionChange = new EventEmitter<string[]>();

  selection: string[] = [];

  layers: {layer: MapLayer, tiles: L.TileLayer}[] = [];
  assertsUrl = environment.assetsUrl;

  constructor(
    service: MapLayersService,
  ) {
    for (const l of service.layers) {
      this.layers.push({layer: l, tiles: l.create()});
    }
  }

  ngOnInit(): void {
    if (this.initialSelection.length > 0) this.selection = [...this.initialSelection];
    if (this.onSelectionChanged) {
      this.selectionChange.subscribe(event => this.onSelectionChanged!(event));
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

}
