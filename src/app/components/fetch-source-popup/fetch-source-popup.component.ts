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

@Component({
  selector: 'app-fetch-source-popup',
  templateUrl: './fetch-source-popup.component.html',
  styleUrls: ['./fetch-source-popup.component.scss'],
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
        if (info.description && trail.description.length === 0) {
          r$ = r$.then(() => new Promise(resolve => this.trailService.doUpdate(trail, t => t.description = info.description!, () => resolve(true))));
        }
        if (info.wayPoints && info.wayPoints.length > 0) {
          r$ = r$
          .then(() => firstValueFrom(combineLatest([this.trackService.getFullTrackReady$(trail.originalTrackUuid, email), this.trackService.getFullTrackReady$(trail.currentTrackUuid, email)])))
          .then(([track1, track2]) => {
            let track1Updated = false;
            let track2Updated = false;
            for (let i = 0; i < info.wayPoints!.length; ++i) {
              const wp = info.wayPoints![i];
              if (wp.description) {
                if (track1.wayPoints.length > i) {
                  track1.wayPoints[i].description = wp.description;
                  track1Updated = true;
                }
                if (track2.uuid !== track1.uuid && track2.wayPoints.length > i) {
                  track2.wayPoints[i].description = wp.description;
                  track2Updated = true;
                }
              }
            }
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
    /*
        // fetch additional info from source
        let fetchPhotos: PhotoInfo[] | undefined;
        if (imported.source) {
          const fetchService = this.injector.get(FetchSourceService);
          if (fetchService.canFetchTrailInfo(imported.source)) {
            result$ = result$.then(() =>
              fetchService.fetchTrailInfo(imported.source!).catch(e => null).then(info => {
                if (!info) return true;
                if (info.description && imported.trail.description.length === 0) {
                  imported.trail.description = info.description;
                }
                console.log(info.wayPoints, imported.tracks[0].wayPoints, imported.tracks[1].wayPoints);
                if (info.wayPoints && info.wayPoints.length > 0) {
                  for (let i = 0; i < info.wayPoints.length; ++i) {
                    const wp = info.wayPoints[i];
                    if (wp.description) {
                      if (imported.tracks[0].wayPoints.length > i) {
                        imported.tracks[0].wayPoints[i].description = wp.description;
                      }
                      if (imported.tracks[1].wayPoints.length > i) {
                        imported.tracks[1].wayPoints[i].description = wp.description;
                      }
                    }
                  }
                }
                if (info.photos && info.photos.length > 0) {
                  fetchPhotos = info.photos;
                }
                return true;
              })
            );
          }
        }


        result$ = result$.then(() => {
          if (!fetchPhotos || fetchPhotos.length === 0) return true;
          const photoService = this.injector.get(PhotoService);
          let r$: Promise<any> = Promise.resolve(true);
          for (const p of fetchPhotos) {
            r$ = r$.then(() => window.fetch(p.url)).then(r => r.arrayBuffer()).then(b => firstValueFrom(
              photoService.addPhoto(
                imported.trail.owner,
                imported.trail.uuid,
                p.description ?? '',
                100,
                b
              )
            ))
          }
          return r$;
        });
*/
  }

  close(): void {
    this.modalController.dismiss(null, 'cancel');
  }

}
