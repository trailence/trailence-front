import { ChangeDetectorRef, Component, Injector, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonInput, IonContent, IonFooter, IonButtons, IonButton, ModalController, IonSpinner } from "@ionic/angular/standalone";
import { Subscription, switchMap, throwError } from 'rxjs';
import { SimplifiedTrackSnapshot } from 'src/app/model/snapshots';
import { Trail } from 'src/app/model/trail';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { BoxTitleComponent } from '../box-title/box-title.component';
import { InputNumberComponent } from '../input-number/input-number.component';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { DistanceUnit } from 'src/app/services/preferences/preferences';

export async function openLocationDialog(injector: Injector, trail: Trail) {
  const modal = await injector.get(ModalController).create({
    component: LocationPopupComponent,
    backdropDismiss: true,
    componentProps: {
      trail,
    }
  });
  await modal.present();
  return await modal.onDidDismiss();
}

@Component({
    selector: 'app-location-popup',
    templateUrl: './location-popup.component.html',
    styleUrls: ['./location-popup.component.scss'],
    imports: [IonSpinner, IonButton, IonButtons, IonFooter, IonContent, IonInput, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, FormsModule, BoxTitleComponent, InputNumberComponent]
})
export class LocationPopupComponent implements OnInit, OnDestroy {

  @Input() trail!: Trail;

  location!: string;
  searchingPlaces = false;
  proposedPlaces?: string[];

  online = true;
  networkSubscription?: Subscription;

  radiusMin = 0;
  radiusMax = 0;
  radiusStep = 1;
  radiusUnit = '';
  currentUnit?: DistanceUnit;
  radiusValue = 0;

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly geo: GeoService,
    private readonly trackService: TrackService,
    private readonly trailService: TrailService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly networkService: NetworkService,
    private readonly preferencesService: PreferencesService,
  ) {
    preferencesService.preferences$.subscribe(p => {
      switch (p.distanceUnit) {
        case 'METERS':
          this.radiusMin = 1;
          this.radiusMax = 50;
          this.radiusStep = 1;
          if (this.currentUnit === undefined) {
            this.radiusValue = 5;
          } else if (this.currentUnit === 'IMPERIAL') {
            this.radiusValue = Math.round(this.i18n.milesToMeters(this.radiusValue) / 1000);
          }
          break;
        case 'IMPERIAL':
          this.radiusMin = 1;
          this.radiusMax = 30;
          this.radiusStep = 1;
          if (this.currentUnit === undefined) {
            this.radiusValue = 3;
          } else if (this.currentUnit === 'METERS') {
            this.radiusValue = Math.round(this.i18n.metersToMiles(this.radiusValue * 1000));
          }
      }
      this.currentUnit = p.distanceUnit;
      this.radiusUnit = this.i18n.longDistanceUnit(p.distanceUnit);
      if (this.networkSubscription)
        this.changeDetector.detectChanges();
    });
  }

  ngOnInit(): void {
    this.location = this.trail.location;
    this.networkSubscription = this.networkService.server$.subscribe(online => {
      if (online !== this.online) {
        this.online = online;
        this.changeDetector.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.networkSubscription?.unsubscribe();
  }

  setRadius(value: number | undefined): void {
    if (value) this.radiusValue = value;
  }

  searchPlaces(): void {
    this.searchingPlaces = true;
    const radiusValue = this.preferencesService.preferences.distanceUnit === 'METERS' ? this.radiusValue * 1000 : Math.round(this.i18n.milesToMeters(this.radiusValue));
    this.trackService.getSimplifiedTrack$(this.trail.currentTrackUuid, this.trail.owner).pipe(
      firstTimeout(t => !!t, 10000, () => null as SimplifiedTrackSnapshot | null),
      switchMap(t => t ? this.geo.findNearestPlaces(t.points[0].lat, t.points[0].lng, radiusValue) : throwError(() => new Error('track not found'))),
    ).subscribe({
      next: places => {
        this.proposedPlaces = [];
        for (const place of places) {
          let s = place[0];
          if (!this.proposedPlaces.includes(s))
            this.proposedPlaces.push(s);
          for (let i = 1; i < place.length; ++i) {
            s = s + ', ' + place[i];
            if (!this.proposedPlaces.includes(s))
              this.proposedPlaces.push(s);
          }
        }
        this.searchingPlaces = false;
        this.changeDetector.markForCheck();
      },
      error: e => {
        this.searchingPlaces = false;
        this.changeDetector.markForCheck();
      }
    });
  }

  save(): void {
    const value = this.location.trim();
    if (value !== this.trail.location) {
      this.trailService.doUpdate(this.trail, t => t.location = value);
    }
    this.close('ok');
  }

  close(role: string): void {
    this.modalController.dismiss(null, role);
  }

}
