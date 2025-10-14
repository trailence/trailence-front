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
    imports: [IonSpinner, IonButton, IonButtons, IonFooter, IonContent, IonInput, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, FormsModule]
})
export class LocationPopupComponent implements OnInit, OnDestroy {

  @Input() trail!: Trail;

  location!: string;
  searchingPlaces = false;
  proposedPlaces?: string[];

  online = true;
  networkSubscription?: Subscription;

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly geo: GeoService,
    private readonly trackService: TrackService,
    private readonly trailService: TrailService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly networkService: NetworkService,
  ) {
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

  searchPlaces(): void {
    this.searchingPlaces = true;
    this.trackService.getSimplifiedTrack$(this.trail.currentTrackUuid, this.trail.owner).pipe(
      firstTimeout(t => !!t, 10000, () => null as SimplifiedTrackSnapshot | null),
      switchMap(t => t ? this.geo.findNearestPlaces(t.points[0].lat, t.points[0].lng) : throwError(() => new Error('track not found'))),
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
