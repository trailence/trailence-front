import { Component } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonSegment, IonSegmentButton, IonLabel, IonRange, IonButton } from "@ionic/angular/standalone";
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DateFormat, DistanceUnit, ElevationUnit, HourFormat, ThemeType } from 'src/app/services/preferences/preferences';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';

@Component({
  selector: 'app-preferences',
  templateUrl: './preferences.page.html',
  styleUrls: ['./preferences.page.scss'],
  standalone: true,
  imports: [IonButton, IonRange, IonLabel, IonSegmentButton, IonSegment, IonIcon, HeaderComponent, FormsModule]
})
export class PreferencesPage {

  timestamp = new Date(2001, 11, 27, 18, 36, 42).getTime();
  distanceFormatterMeters = (value: number) => value + this.i18n.shortDistanceUnit('METERS');
  millisecondsFormatter = (value: number) => (value / 1000).toLocaleString(this.preferences.preferences.lang, {maximumFractionDigits: 1}) + 's';

  offlineMapCounters?: {items: number, size: number};

  constructor(
    public i18n: I18nService,
    public preferences: PreferencesService,
    private offlineMaps: OfflineMapService,
  ) {
    offlineMaps.computeContent().subscribe(
      counters => this.offlineMapCounters = counters
    );
  }

  setTheme(s?: string): void {
    this.preferences.setTheme(s as ThemeType ?? 'SYSTEM');
  }

  setDistanceUnit(s?: string): void {
    this.preferences.setDistanceUnit(s as DistanceUnit);
  }

  setElevationUnit(s?: string): void {
    this.preferences.setElevationUnit(s as ElevationUnit);
  }

  setDateFormat(s?: string): void {
    this.preferences.setDateFormat(s as DateFormat);
  }

  setHourFormat(s?: string): void {
    this.preferences.setHourFormat(s as HourFormat);
  }

  setTraceMinimumDistance(meters: number): void {
    this.preferences.setTraceMinMeters(meters);
  }

  setTraceMinimumInterval(millis: number): void {
    this.preferences.setTraceMinMillis(millis);
  }

  cleanOfflineMaps(): void {
    this.offlineMaps.removeAll().subscribe(() => {
      this.offlineMaps.computeContent().subscribe(
        counters => this.offlineMapCounters = counters
      );
    });
  }

}
