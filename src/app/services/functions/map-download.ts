import { Injector } from '@angular/core';
import { catchError, combineLatest, debounceTime, first, map, of } from 'rxjs';
import { Trail } from '@trailence/model/trail';
import { filterItemsDefined } from '@trailence/utils/rxjs/filter-defined';
import { TrackService } from '../database/track.service';
import { ModalController } from '@ionic/angular';
import { EarthBBox } from '@trailence/utils/latlng';

export function openMapDownloadDialog(injector: Injector, trails: Trail[], bounds?: EarthBBox, layer?: string) {
  const tracks$ = trails.length === 0 ? of([]) : combineLatest(trails.map(trail =>
    injector.get(TrackService).getFullTrackReady$(trail.currentTrackUuid, trail.owner).pipe(catchError(() => of(null)))
  )).pipe(
    debounceTime(100),
    first(),
    map(tracks => filterItemsDefined(tracks))
  );
  tracks$.subscribe(async (tracks) => {
    const module = await import('../../components/map/tools/download-map-popup/download-map-popup.component');
    const modal = await injector.get(ModalController).create({
      component: module.DownloadMapPopupComponent,
      backdropDismiss: false,
      componentProps: {
        tracks,
        bounds,
        layer,
      }
    });
    await modal.present();
  });
}
