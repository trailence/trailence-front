import { Component, Input, OnInit } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonHeader, IonToolbar, IonContent, IonTitle, IonLabel, IonIcon, ModalController, IonFooter, IonButtons, IonButton } from '@ionic/angular/standalone'
import { TrailService } from 'src/app/services/database/trail.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { ProgressService } from 'src/app/services/progress/progress.service';
import { CommonModule } from '@angular/common';
import { NetworkService } from 'src/app/services/network/network.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { TrackService } from 'src/app/services/database/track.service';
import { combineLatest, firstValueFrom } from 'rxjs';
import { PhotoService } from 'src/app/services/database/photo.service';
import { populateWayPointInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';

@Component({
  selector: 'app-fetch-source-popup',
  templateUrl: './fetch-source-popup.component.html',
  styleUrls: [],
  imports: [IonHeader, IonToolbar, IonContent, IonTitle, IonLabel, IonIcon, IonFooter, IonButtons, IonButton, CommonModule]
})
export class FetchSourcePopupComponent implements OnInit {

  @Input() trails!: {trailUuid: string, source: string}[];

  trailsSources: {name: string, source: string}[] = [];

  constructor(
    public readonly i18n: I18nService,
    public readonly network: NetworkService,
    private readonly trailService: TrailService,
    private readonly fetchSourceService: FetchSourceService,
    private readonly progressService: ProgressService,
    private readonly modalController: ModalController,
    private readonly authService: AuthService,
    private readonly trackService: TrackService,
    private readonly photoService: PhotoService,
    private readonly preferences: PreferencesService,
  ) { }

  ngOnInit(): void {
    this.trailService.getAll$().pipe(collection$items()).subscribe(
      trails => {
        this.trailsSources = [];
        for (const t of this.trails) {
          const trail = trails.find(tr => tr.uuid === t.trailUuid);
          if (trail) this.trailsSources.push({name: trail.name, source: this.fetchSourceService.getSourceName(t.source)! });
        }
      }
    );
  }

  doImport(): void {
    const progress = this.progressService.create(this.i18n.texts.pages.import_from_sources.title, this.trails.length);
    const email = this.authService.email;
    if (!email) return;
    for (const t of this.trails) {
      const trail = this.trailService.getTrail(t.trailUuid, email);
      if (!trail) {
        progress.addWorkDone(1);
        continue;
      }
      this.fetchSourceService.fetchTrailInfo(t.source).then(info => {
        if (!info) return true;
        let r$: Promise<any> = Promise.resolve(true);
        const updateDescription = info.description && info.description.trim().length > 0 && trail.description.trim().length === 0;
        const updateLocation = info.location && info.location.trim().length > 0 && trail.location.trim().length === 0;
        if (updateDescription || updateLocation) {
          r$ = r$.then(() => new Promise(resolve => this.trailService.doUpdate(trail, t => { // NOSONAR
            if (updateDescription)
              t.description = info.description!.trim();
            if (updateLocation)
              t.location = info.location!.trim();
          }, () => resolve(true)))); // NOSONAR
        }
        if (info.wayPoints && info.wayPoints.length > 0) {
          r$ = r$
          .then(() => firstValueFrom(combineLatest([this.trackService.getFullTrackReady$(trail.originalTrackUuid, email), this.trackService.getFullTrackReady$(trail.currentTrackUuid, email)])))
          .then(([track1, track2]) => {
            let track1Updated = populateWayPointInfo(track1, info.wayPoints!, this.preferences.preferences);
            let track2Updated = track2.uuid !== track1.uuid ? populateWayPointInfo(track2, info.wayPoints!, this.preferences.preferences) : false;
            if (track1Updated) this.trackService.update(track1);
            if (track2Updated) this.trackService.update(track2);
            return true;
          })
        }
        if (info.photos && info.photos.length > 0) {
          let index = 100;
          for (const p of info.photos)
            r$ = r$.then(() => window.fetch(p.url)).then(r => r.arrayBuffer()).then(b => firstValueFrom(
              this.photoService.addPhoto(
                email,
                t.trailUuid,
                p.description ?? '',
                index++,
                b
              )
            ));
        }
        return r$;
      }).catch(e => true).then(() => progress.addWorkDone(1));
    }
  }

  close(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
