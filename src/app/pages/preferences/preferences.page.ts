import { Component, OnDestroy } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonSegment, IonSegmentButton, IonLabel, IonRange, IonButton, IonInput } from "@ionic/angular/standalone";
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DateFormat, DistanceUnit, ElevationUnit, HourFormat, ThemeType } from 'src/app/services/preferences/preferences';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { ExtensionsService } from 'src/app/services/database/extensions.service';
import { Extension } from 'src/app/model/extension';

@Component({
  selector: 'app-preferences',
  templateUrl: './preferences.page.html',
  styleUrls: ['./preferences.page.scss'],
  standalone: true,
  imports: [IonInput, IonButton, IonRange, IonLabel, IonSegmentButton, IonSegment, IonIcon, HeaderComponent, FormsModule]
})
export class PreferencesPage implements OnDestroy {

  timestamp = new Date(2001, 11, 27, 18, 36, 42).getTime();
  distanceFormatterMeters = (value: number) => value + this.i18n.shortDistanceUnit('METERS');
  millisecondsFormatter = (value: number) => (value / 1000).toLocaleString(this.preferences.preferences.lang, {maximumFractionDigits: 1}) + 's';
  minutesFormatter = (value: number) => (value / 60000).toLocaleString(this.preferences.preferences.lang, {maximumFractionDigits:0}) + 'm';
  speedFormatter = (value: number) => this.i18n.getSpeedString(value);

  offlineMapCounters?: {items: number, size: number};
  tfoApiKey?: string;

  private extensionsSubscription: Subscription;
  private currentExtensions: Extension[] = [];

  constructor(
    public i18n: I18nService,
    public preferences: PreferencesService,
    private offlineMaps: OfflineMapService,
    private extensions: ExtensionsService,
  ) {
    offlineMaps.computeContent().subscribe(
      counters => this.offlineMapCounters = counters
    );
    this.extensionsSubscription = extensions.getExtensions$().subscribe(
      extensions => {
        const thunderforest = extensions.find(e => e.extension === 'thunderforest.com');
        if (thunderforest) this.tfoApiKey = thunderforest.data['apikey'] || undefined;
        this.currentExtensions = extensions;
      }
    );
  }

  ngOnDestroy(): void {
    this.extensionsSubscription.unsubscribe();
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

  setEstimatedBaseSpeed(speed: number): void {
    this.preferences.setEstimatedBaseSpeed(speed);
  }

  setLongBreakMinimumDuration(value: number): void {
    this.preferences.setLongBreakMinimumDuration(value);
  }

  setLongBreakMaximumDistance(value: number): void {
    this.preferences.setLongBreakMaximumDistance(value);
  }

  cleanOfflineMaps(): void {
    this.offlineMaps.removeAll().subscribe(() => {
      this.offlineMaps.computeContent().subscribe(
        counters => this.offlineMapCounters = counters
      );
    });
  }

  updateThunderforestApiKey(value?: string | null): void {
    if (!value || value.trim().length === 0) {
      const thunderforest = this.currentExtensions.find(e => e.extension === 'thunderforest.com');
      if (thunderforest) {
        this.extensions.removeExtension(thunderforest);
      }
    } else {
      const thunderforest = this.currentExtensions.find(e => e.extension === 'thunderforest.com');
      if (thunderforest) {
        thunderforest.data['apikey'] = value!.trim();
        this.extensions.saveExtension(thunderforest);
      } else {
        this.extensions.saveExtension(new Extension(0, 'thunderforest.com', {apikey: value!}));
      }
    }
  }

}
