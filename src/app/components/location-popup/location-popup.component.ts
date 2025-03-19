import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Injector, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonInput, IonContent, IonFooter, IonButtons, IonButton, ModalController, IonSpinner } from "@ionic/angular/standalone";
import { switchMap, throwError } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { SimplifiedTrackSnapshot } from 'src/app/services/database/track-database';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';

export async function openLocationDialog(injector: Injector, trail: Trail) {
  const modal = await injector.get(ModalController).create({
    component: LocationPopupComponent,
    backdropDismiss: true,
    componentProps: {
      trail,
    }
  });
  modal.present();
}

@Component({
    selector: 'app-location-popup',
    templateUrl: './location-popup.component.html',
    styleUrls: ['./location-popup.component.scss'],
    imports: [IonSpinner, IonButton, IonButtons, IonFooter, IonContent, IonInput, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, FormsModule, CommonModule]
})
export class LocationPopupComponent implements OnInit {

  @Input() trail!: Trail;

  location!: string;
  searchingPlaces = false;
  proposedPlaces?: string[];

  constructor(
    public i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly geo: GeoService,
    private readonly trackService: TrackService,
    private readonly trailService: TrailService,
    private readonly changeDetector: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.location = this.trail.location;
  }

  searchPlaces(): void {
    this.searchingPlaces = true;
    this.trackService.getSimplifiedTrack$(this.trail.currentTrackUuid, this.trail.owner).pipe(
      firstTimeout(t => !!t, 10000, () => null as SimplifiedTrackSnapshot | null),
      switchMap(t => t ? this.geo.findNearestPlaces(t.points[0].lat, t.points[0].lng) : throwError(() => new Error())),
    ).subscribe({
      next: places => {
        this.proposedPlaces = [];
        for (const place of places) {
          let s = place[0];
          if (this.proposedPlaces.indexOf(s) < 0)
            this.proposedPlaces.push(s);
          for (let i = 1; i < place.length; ++i) {
            s = s + ', ' + place[i];
            if (this.proposedPlaces.indexOf(s) < 0)
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
