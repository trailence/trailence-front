import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectionStrategy } from '@angular/core';
import { MapLayersService } from '@trailence/services/map/map-layers.service';
import { IonRadio, IonRadioGroup, IonCheckbox, IonHeader, IonToolbar, IonIcon, IonTitle, IonLabel, IonFooter, IonButtons, IonButton, ModalController } from "@ionic/angular";
import { environment } from '@env/environment';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { EarthBBox } from '@trailence/utils/latlng';
import { CountriesBordersService } from '@trailence/services/geolocation/countries-borders.service';
import { MapLayer } from '@trailence/services/map/layers/map-layer';

@Component({
    selector: 'app-map-layer-selection',
    templateUrl: './map-layer-selection.component.html',
    styleUrls: ['./map-layer-selection.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
      IonIcon, IonToolbar, IonHeader, IonCheckbox, IonRadioGroup, IonRadio, IonTitle, IonLabel, IonButton, IonButtons, IonFooter,
      NgClass, NgTemplateOutlet,
    ]
})
export class MapLayerSelectionComponent implements OnInit {

  @Input() multiple = false;
  @Input() buttons = false;
  @Input() popup = false;
  @Input() bbox?: EarthBBox;
  @Input() initialSelection: string[] = [];
  @Input() onSelectionChanged?: (selection: string[]) => void;

  @Output() selectionChange = new EventEmitter<string[]>();

  selection: string[] = [];

  globalLayers: MapLayer[] = [];
  regionalLayers = new Map<string, MapLayer[]>();
  sortedRegions: string[] = [];
  assertsUrl = environment.assetsUrl;

  constructor(
    public readonly i18n: I18nService,
    private readonly service: MapLayersService,
    private readonly modalController: ModalController,
    private readonly bordersService: CountriesBordersService,
  ) {}

  ngOnInit(): void {
    for (const layer of this.service.getAllLayers('raster')) {
      if (layer.regional) {
        const code = layer.regional.code;
        const name = this.i18n.texts.regions[code] ?? code;
        let region = this.regionalLayers.get(name);
        if (region) {
          region.push(layer);
        } else {
          region = [layer];
          this.regionalLayers.set(name, region);
        }
      } else {
        this.globalLayers.push(layer);
      }
    }
    this.sortedRegions = [...this.regionalLayers.keys()].sort((r1, r2) => r1.localeCompare(r2));

    if (this.initialSelection.length > 0) this.selection = [...this.initialSelection];
    if (this.onSelectionChanged) {
      this.selectionChange.subscribe(event => this.onSelectionChanged!(event));
    }
    if (this.bbox) {
      const regions = Array.from(this.regionalLayers.entries()).map(r => ({name: r[0], code: r[1][0].regional!.code}));
      void this.bordersService.getOverlappingCountriesSorted(this.bbox, regions.map(r => r.code))
      .then(overlapping => {
        const newRegions = [...overlapping.map(code => regions.find(r => r.code === code)!.name), ...this.sortedRegions.filter(sr => !overlapping.includes(regions.find(r => r.name === sr)!.code))];
        this.sortedRegions = newRegions;
      })
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

  getSelectedLayers(): MapLayer[] {
    const result: MapLayer[] = [];
    for (const layer of this.globalLayers) {
      if (this.selection.includes(layer.name)) {
        result.push(layer);
      }
    }
    for (const region of this.regionalLayers.entries()) {
      for (const layer of region[1]) {
        if (this.selection.includes(layer.name)) {
          result.push(layer);
        }
      }
    }
    return result;
  }

  close(): void {
    void this.modalController.dismiss();
  }

}
