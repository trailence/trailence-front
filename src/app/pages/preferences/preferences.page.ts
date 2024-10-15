import { Component, OnDestroy } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonSegment, IonSegmentButton, IonLabel, IonRange, IonButton, IonInput } from "@ionic/angular/standalone";
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DateFormat, DistanceUnit, HourFormat, ThemeType } from 'src/app/services/preferences/preferences';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { ExtensionsService } from 'src/app/services/database/extensions.service';
import { Extension } from 'src/app/model/extension';
import { NumericFilterConfig } from 'src/app/components/filters/filter';
import { CommonModule } from '@angular/common';
import { PhotoService } from 'src/app/services/database/photo.service';

@Component({
  selector: 'app-preferences',
  templateUrl: './preferences.page.html',
  styleUrls: ['./preferences.page.scss'],
  standalone: true,
  imports: [IonInput, IonButton, IonRange, IonLabel, IonSegmentButton, IonSegment, IonIcon, HeaderComponent, FormsModule, CommonModule]
})
export class PreferencesPage implements OnDestroy {

  timestamp = new Date(2001, 11, 27, 18, 36, 42).getTime();
  millisecondsFormatter = (value: number) => (value / 1000).toLocaleString(this.preferences.preferences.lang, {maximumFractionDigits: 1}) + 's';
  minutesFormatter = (value: number) => (value / 60000).toLocaleString(this.preferences.preferences.lang, {maximumFractionDigits:0}) + 'm';
  fileSizeFormatter = (value: number) => this.i18n.sizeToString(value * 1024, 0, 2);
  daysFormatter = (value: number) => value + ' ' + this.i18n.texts.duration.days;

  offlineMapCounters?: {items: number, size: number};
  tfoApiKey?: string;
  photoCacheSize?: {total: number, expired: number};

  private extensionsSubscription: Subscription;
  private currentExtensions: Extension[] = [];

  constructor(
    public i18n: I18nService,
    public preferences: PreferencesService,
    private offlineMaps: OfflineMapService,
    private extensions: ExtensionsService,
    private photoService: PhotoService,
  ) {
    this.updateOfflineMapCounters();
    this.updatePhotoCacheSize();
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

  setDateFormat(s?: string): void {
    this.preferences.setDateFormat(s as DateFormat);
  }

  setHourFormat(s?: string): void {
    this.preferences.setHourFormat(s as HourFormat);
  }

  getTraceMinimumDistanceConfig(): NumericFilterConfig {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': return {
        min: 1,
        max: 100,
        step: 1,
        formatter: (value: number) => value + 'm'
      }
      case 'IMPERIAL': return {
        min: 3,
        max: 300,
        step: 3,
        formatter: (value: number) => value + 'ft'
      }
    }
  }

  getTraceMinimumDistanceValue(): number {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': return this.preferences.preferences.traceMinMeters;
      case 'IMPERIAL': return Math.floor(Math.round(this.i18n.metersToFoot(this.preferences.preferences.traceMinMeters)) / 3) * 3
    }
  }

  setTraceMinimumDistance(value: number): void {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': this.preferences.setTraceMinMeters(value); break;
      case 'IMPERIAL': this.preferences.setTraceMinMeters(Math.round(this.i18n.footToMeters(value))); break;
    }
  }

  setTraceMinimumInterval(millis: number): void {
    this.preferences.setTraceMinMillis(millis);
  }

  getEstimatedBaseSpeedConfig(): NumericFilterConfig {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': return {
        min: 2000,
        max: 20000,
        step: 250,
        formatter: (value: number) => this.i18n.getSpeedString(value)
      }
      case 'IMPERIAL': return {
        min: 1,
        max: 125,
        step: 0.2,
        formatter: (value: number) => this.i18n.getSpeedString(this.i18n.milesToMeters(value))
      }
    }
  }

  getEstimatedBaseSpeedValue(): number {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': return this.preferences.preferences.estimatedBaseSpeed;
      case 'IMPERIAL':
        const miles = this.i18n.metersToMiles(this.preferences.preferences.estimatedBaseSpeed);
        if (miles < 1) return 1;
        if (miles > 125) return 125;
        return 1 + Math.round((miles - 1) / 0.2) * 0.2;
    }
  }

  setEstimatedBaseSpeed(speed: number): void {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': this.preferences.setEstimatedBaseSpeed(speed); break;
      case 'IMPERIAL': this.preferences.setEstimatedBaseSpeed(Math.round(this.i18n.milesToMeters(speed))); break;
    }
  }

  setLongBreakMinimumDuration(value: number): void {
    this.preferences.setLongBreakMinimumDuration(value);
  }

  getLongBreakMaximumDistanceConfig(): NumericFilterConfig {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': return {
        min: 15,
        max: 200,
        step: 5,
        formatter: (value: number) => value + 'm'
      };
      case 'IMPERIAL': return {
        min: 50,
        max: 650,
        step: 10,
        formatter: (value: number) => value + 'ft'
      }
    }
  }

  getLongBreakMaximumDistanceValue(): number {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': return this.preferences.preferences.longBreakMaximumDistance;
      case 'IMPERIAL':
        const foot = this.i18n.metersToFoot(this.preferences.preferences.longBreakMaximumDistance);
        if (foot < 50) return 50;
        if (foot > 650) return 650;
        return 50 + Math.round((foot - 50) / 10) * 10;
    }
  }

  setLongBreakMaximumDistance(value: number): void {
    switch (this.preferences.preferences.distanceUnit) {
      case 'METERS': this.preferences.setLongBreakMaximumDistance(value); break;
      case 'IMPERIAL': this.preferences.setLongBreakMaximumDistance(Math.round(this.i18n.footToMeters(value))); break;
    }
  }

  cleanOfflineMaps(): void {
    this.offlineMaps.removeAll().subscribe(() => {
      this.updateOfflineMapCounters();
    });
  }

  private updateOfflineMapCounters(): void {
    this.offlineMaps.computeContent().subscribe(
      counters => this.offlineMapCounters = counters
    );
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

  setPhotoCacheDays(days: number): void {
    this.preferences.setPhotoCacheDays(days);
    this.photoCacheSize = undefined;
    this.updatePhotoCacheSize();
  }

  removeAllCachedPhotos(): void {
    this.photoCacheSize = undefined;
    this.photoService.removeAllCached().subscribe(() => this.updatePhotoCacheSize());
  }

  removeExpiredPhotos(): void {
    this.photoCacheSize = undefined;
    this.photoService.removeExpired().subscribe(() => this.updatePhotoCacheSize());
  }

  private updatePhotoCacheSize(): void {
    this.photoService.getTotalCacheSize(Date.now() - this.preferences.preferences.photoCacheDays * 24 * 60 * 60 * 1000).subscribe(([total, expired]) => this.photoCacheSize = {total, expired})
  }

}
