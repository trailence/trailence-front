import { Injector } from '@angular/core';
import { catchError, combineLatest, debounceTime, first, map, of } from 'rxjs';
import { Trail } from 'src/app/model/trail';
import { filterItemsDefined } from 'src/app/utils/rxjs/filter-defined';
import { TrackService } from '../database/track.service';
import { ModalController } from '@ionic/angular/standalone';

export function openMapDownloadDialog(injector: Injector, trails: Trail[], bounds?: L.LatLngBounds) {
  const tracks$ = trails.length === 0 ? of([]) : combineLatest(trails.map(trail =>
    injector.get(TrackService).getFullTrackReady$(trail.currentTrackUuid, trail.owner).pipe(catchError(() => of(null)))
  )).pipe(
    debounceTime(100),
    first(),
    map(tracks => filterItemsDefined(tracks))
  );
  tracks$.subscribe(async (tracks) => {
    const module = await import('../../components/download-map-popup/download-map-popup.component');
    const modal = await injector.get(ModalController).create({
      component: module.DownloadMapPopupComponent,
      backdropDismiss: false,
      componentProps: {
        tracks,
        bounds,
      }
    });
    modal.present();
  });
}
