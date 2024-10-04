import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonInput, IonContent, IonFooter, IonButtons, IonButton, ModalController, IonSpinner } from "@ionic/angular/standalone";
import { filter, first, switchMap, timeout } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { TrackService } from 'src/app/services/database/track.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-location-popup',
  templateUrl: './location-popup.component.html',
  styleUrls: ['./location-popup.component.scss'],
  standalone: true,
  imports: [IonSpinner, IonButton, IonButtons, IonFooter, IonContent, IonInput, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, FormsModule, CommonModule ]
})
export class LocationPopupComponent implements OnInit {

  @Input() trail!: Trail;

  location!: string;
  searchingPlaces = false;
  proposedPlaces?: string[];

  constructor(
    public i18n: I18nService,
    private modalController: ModalController,
    private geo: GeoService,
    private trackService: TrackService,
    private trailService: TrailService,
    private changeDetector: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.location = this.trail.location;
  }

  searchPlaces(): void {
    this.searchingPlaces = true;
    this.trackService.getSimplifiedTrack$(this.trail.currentTrackUuid, this.trail.owner).pipe(
      filter(t => !!t),
      timeout(10000),
      first(),
      switchMap(t => this.geo.findNearestPlaces(t!.points[0].lat, t!.points[0].lng)),
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
    this.modalController.dismiss(null, 'ok');
  }

  cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
