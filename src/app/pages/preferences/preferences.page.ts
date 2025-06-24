import { Component, NgZone, OnDestroy } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonSegment, IonSegmentButton, IonLabel, IonRange, IonButton, IonInput, IonSpinner, IonRadio, IonRadioGroup } from "@ionic/angular/standalone";
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DateFormat, DistanceUnit, HourFormat, ThemeType } from 'src/app/services/preferences/preferences';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { OfflineMapService } from 'src/app/services/map/offline-map.service';
import { ExtensionsService } from 'src/app/services/database/extensions.service';
import { FilterNumeric, NumericFilterCustomConfig } from 'src/app/components/filters/filter';
import { CommonModule } from '@angular/common';
import { PhotoService } from 'src/app/services/database/photo.service';
import { FilterNumericCustomComponent } from 'src/app/components/filters/filter-numeric-custom/filter-numeric-custom.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { IdGenerator } from 'src/app/utils/component-utils';

@Component({
    selector: 'app-preferences',
    templateUrl: './preferences.page.html',
    styleUrls: ['./preferences.page.scss'],
    imports: [IonRadioGroup, IonRadio, IonSpinner,
      IonInput, IonButton, IonRange, IonLabel, IonSegmentButton, IonSegment, IonIcon,
      HeaderComponent, FormsModule, CommonModule,
      FilterNumericCustomComponent,
    ]
})
export class PreferencesPage implements OnDestroy {

  id = IdGenerator.generateId();
  timestamp = new Date(2001, 11, 27, 18, 36, 42).getTime();
  minutesFormatter = (value: number) => (value / 60000).toLocaleString(this.preferences.preferences.lang, {maximumFractionDigits:0}) + 'm';
  fileSizeFormatter = (value: number) => this.i18n.sizeToString(value * 1024, 0, 2);
  daysFormatter = (value: number) => value + ' ' + this.i18n.texts.duration.days;

  offlineMapCounters?: {items: number, size: number};
  tfoApiKey?: string;
  tfoAllowed = false;
  photoCacheSize?: {total: number, expired: number};
  aliasType: 'anonymous' | 'name' = 'anonymous';

  private readonly extensionsSubscription: Subscription;
  private readonly preferencesSubscription: Subscription;
  private readonly authSubscription: Subscription;

  constructor(
    public readonly i18n: I18nService,
    public readonly preferences: PreferencesService,
    auth: AuthService,
    private readonly offlineMaps: OfflineMapService,
    private readonly extensions: ExtensionsService,
    private readonly photoService: PhotoService,
    private readonly ngZone: NgZone,
  ) {
    this.updateOfflineMapCounters();
    this.updatePhotoCacheSize();
    this.extensionsSubscription = extensions.getExtensions$().subscribe(
      extensions => {
        const thunderforest = extensions.find(e => e.extension === 'thunderforest.com');
        if (thunderforest) this.tfoApiKey = thunderforest.data['apikey'] ?? undefined;
      }
    );
    this.preferencesSubscription = preferences.preferences$.subscribe(() => this.refresh());
    this.authSubscription = auth.auth$.subscribe(a => {
      this.tfoAllowed = !!a && a.allowedExtensions.indexOf('thunderforest.com') >= 0;
    });
  }

  ngOnDestroy(): void {
    this.extensionsSubscription.unsubscribe();
    this.preferencesSubscription.unsubscribe();
    this.authSubscription.unsubscribe();
  }

  traceMinMillisConfig: NumericFilterCustomConfig = {
    range: false,
    values: [0, 1000, 2000, 3000, 4000, 5000, 10000, 15000, 20000, 30000, 45000, 60000],
    formatter: (value: number) => Math.floor(value / 1000) + 's'
  };
  offlineMapMaxKeepDaysConfig: NumericFilterCustomConfig = {
    range: false,
    values: [5, 10, 15, 30, 60, 100, 200, 300, 500, 1000],
    formatter: (value: number) => '' + value,
  }
  photoCacheDaysConfig: NumericFilterCustomConfig = {
    range: false,
    values: [1, 5, 15, 30, 60, 100, 300, 500, 1000],
    formatter: (value: number) => '' + value,
  }

  private currentDistanceUnit?: DistanceUnit;
  traceMinMetersConfig!: NumericFilterCustomConfig;
  longBreakMaximumDistanceConfig!: NumericFilterCustomConfig;

  refresh(): void {
    this.aliasType = this.preferences.preferences.alias.length > 0 ? 'name' : 'anonymous';
    if (this.currentDistanceUnit !== this.preferences.preferences.distanceUnit) {
      this.currentDistanceUnit = this.preferences.preferences.distanceUnit
      switch (this.currentDistanceUnit) {
        case 'METERS':
          this.traceMinMetersConfig = {
            range: false,
            values: [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100],
            formatter: (value: number) => value + 'm',
          };
          this.longBreakMaximumDistanceConfig = {
            range: false,
            values: [15, 20, 25, 30, 40, 50, 75, 100, 150, 200],
            formatter: (value: number) => value + 'm',
          };
          break;
        case 'IMPERIAL':
          this.traceMinMetersConfig = {
            range: false,
            values: [3, 6, 10, 16, 33, 50, 65, 82, 98, 131, 164, 246, 328],
            realValues: [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100],
            formatter: (value: number) => value + 'ft',
          };
          this.longBreakMaximumDistanceConfig = {
            range: false,
            values: [50, 65, 82, 98, 131, 164, 246, 328, 492, 656],
            realValues: [15, 20, 25, 30, 40, 50, 75, 100, 150, 200],
            formatter: (value: number) => value + 'ft',
          };
          break;
      }
    }
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

  setAlias(s: string | null | undefined): void {
    let alias = s ?? '';
    alias = alias.trim();
    this.aliasType = alias.length > 0 ? 'name' : 'anonymous';
    this.preferences.setAlias(alias);
  }

  aliasTypeChanged(value: any): void {
    if (value === 'anonymous') this.setAlias('');
  }

  setTraceMinimumDistance(value: number | FilterNumeric): void {
    this.preferences.setTraceMinMeters(value as number);
  }

  setTraceMinimumInterval(millis: number | FilterNumeric): void {
    this.preferences.setTraceMinMillis(millis as number);
  }

  setEstimatedBaseSpeed(speed: string | null | undefined): void {
    if (!speed) return;
    const value = parseFloat(speed);
    if (isNaN(value) || value < 0.1 || value > 99.9) return;
    const meters = this.i18n.getSpeedInMetersFromUserUnit(value);
    this.preferences.setEstimatedBaseSpeed(meters);
  }

  setLongBreakMinimumDuration(value: number): void {
    this.preferences.setLongBreakMinimumDuration(value);
  }

  setLongBreakMaximumDistance(value: number | FilterNumeric): void {
    this.preferences.setLongBreakMaximumDistance(value as number);
  }

  setOfflineMapMaxKeepDays(value: number | FilterNumeric): void {
    this.preferences.setOfflineMapMaxKeepDays(value as number);
  }

  cleanOfflineMaps(): void {
    this.offlineMaps.removeAll().subscribe(() => {
      this.updateOfflineMapCounters();
    });
  }

  private updateOfflineMapCounters(): void {
    this.offlineMapCounters = undefined;
    this.compute('offline-map-counters', () => new Promise(resolve => {
      this.offlineMaps.computeContent().subscribe({
        next: counters => {
          this.offlineMapCounters = counters;
          resolve(true);
        },
        error: () => resolve(true)
      });
    }));
  }

  updateThunderforestApiKey(value?: string | null): void {
    if (!value || value.trim().length === 0) {
      this.extensions.removeExtension('thunderforest.com');
    } else {
      this.extensions.saveExtension('thunderforest.com', true, e => e.data['apikey'] = value.trim());
    }
  }

  setPhotoCacheDays(value: number | FilterNumeric): void {
    this.preferences.setPhotoCacheDays(value as number);
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
    this.photoCacheSize = undefined;
    this.compute('photo-cache-size', () => new Promise(resolve => {
      this.ngZone.runOutsideAngular(() => {
        this.photoService.getTotalCacheSize(Date.now() - this.preferences.preferences.photoCacheDays * 24 * 60 * 60 * 1000)
        .subscribe({
          next: ([total, expired]) => {
            this.ngZone.run(() => {
              this.photoCacheSize = {total, expired};
              resolve(true);
            });
          },
          error: () => resolve(true)
        });
      });
    }));
  }

  resetAll(): void {
    this.preferences.resetAll();
  }

  private compute$ = Promise.resolve(true);
  private computeCounter: {[key: string]: number} = {};
  private computeObservers: {[key: string]: IntersectionObserver} = {};

  private compute(type: string, operation: () => Promise<boolean>): void {
    const element = document.getElementById(this.id + '-' + type);
    if (!element) {
      setTimeout(() => this.compute(type, operation), 100);
      return;
    }
    let observer = this.computeObservers[type];
    if (observer) return;
    observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        setTimeout(() => this.doCompute(observer, type, operation), 0);
      }
    });
    this.computeObservers[type] = observer;
    observer.observe(element);
  }

  private doCompute(observer: IntersectionObserver, type: string, operation: () => Promise<boolean>): void {
    if (this.computeObservers[type] !== observer) return;
    delete this.computeObservers[type];
    const counter = (this.computeCounter[type] ?? 0) + 1;
    this.computeCounter[type] = counter;
    this.compute$ = this.compute$.then(() => {
      if (this.computeCounter[type] !== counter) return true;
      return operation();
    });
  }

}
