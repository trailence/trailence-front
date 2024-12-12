import { Component, Input } from "@angular/core";
import { IonHeader, IonToolbar, IonTitle, IonRange, IonLabel, IonContent, IonFooter, IonButtons, IonButton, ModalController } from '@ionic/angular/standalone'
import { I18nService } from "src/app/services/i18n/i18n.service";
import { PreferencesService } from "src/app/services/preferences/preferences.service";
import { EditToolsComponent } from "../edit-tools.component";
import { applyElevationThresholdToTrack } from "src/app/services/track-edition/elevation/elevation-threshold";
import { of } from "rxjs";

@Component({
    selector: 'app-edit-tool-elevation-threshold-modal',
    templateUrl: './elevation-threshold-modal.html',
    styleUrls: [],
    imports: [IonHeader, IonToolbar, IonTitle, IonRange, IonLabel, IonContent, IonFooter, IonButtons, IonButton]
})
export class ElevationThresholdModal {

  @Input() editTools!: EditToolsComponent

  elevationThresholdFormatter = (value: number) => this.i18n.elevationInUserUnitToString(value)
  smallDistanceFormatter = (value: number) => {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return value + 'm';
      case 'IMPERIAL': return value + 'ft';
    }
  }

  constructor(
    public readonly i18n: I18nService,
    private readonly prefs: PreferencesService,
    private readonly modalController: ModalController,
  ) {}

  getMinElevationThreshold(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 1;
      case 'IMPERIAL': return 5;
    }
  }

  getMaxElevationThreshold(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 25;
      case 'IMPERIAL': return 80;
    }
  }

  getElevationThresholdStep(): number { // NOSONAR
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 1;
      case 'IMPERIAL': return 5;
    }
  }

  getInitialElevationThreshold(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 10;
      case 'IMPERIAL': return 30;
    }
  }

  getMinElevationThresholdDistance(): number { // NOSONAR
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 25;
      case 'IMPERIAL': return 80;
    }
  }

  getMaxElevationThresholdDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 1000;
      case 'IMPERIAL': return 3280;
    }
  }

  getElevationThresholdDistanceStep(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 25;
      case 'IMPERIAL': return 100;
    }
  }

  getInitialElevationThresholdDistance(): number {
    switch (this.prefs.preferences.distanceUnit) {
      case 'METERS': return 250;
      case 'IMPERIAL': return 780;
    }
  }

  applyElevationThreshold(elevation: any, distance: any): void {
    const threshold = this.i18n.elevationInMetersFromUserUnit(elevation);
    const maxDistance = this.i18n.distanceInMetersFromUserUnit(distance);
    this.editTools.mayModify(track => {
      applyElevationThresholdToTrack(track, threshold, maxDistance);
      return of(true);
    })
  }

  close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}