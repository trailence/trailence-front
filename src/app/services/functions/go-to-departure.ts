import { Injector } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { TrackService } from '../database/track.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { first, of, timeout } from 'rxjs';
import { Platform } from '@ionic/angular/standalone';

export function goToDeparture(injector: Injector, trail: Trail): void {
  injector.get(TrackService).getSimplifiedTrack$(trail.currentTrackUuid, trail.owner).pipe(
    filterDefined(),
    timeout({
      first: 10000,
      with: () => of(null)
    }),
    first()
  ).subscribe(track => {
    if (track?.points && track.points.length > 0) {
      const departure = track.points[0];
      if (injector.get(Platform).is('capacitor')) {
        const link = document.createElement('A') as HTMLAnchorElement;
        link.style.position = 'fixed';
        link.style.top = '-10000px';
        link.style.left = '-10000px';
        link.href = 'geo:0,0?q=' + departure.lat + ',' + departure.lng;
        link.target = '_blank';
        document.documentElement.appendChild(link);
        link.click();
        link.remove();
      } else {
        const link = document.createElement('A') as HTMLAnchorElement;
        link.style.position = 'fixed';
        link.style.top = '-10000px';
        link.style.left = '-10000px';
        link.target = '_blank';
        link.href = 'https://www.google.com/maps/dir/?api=1&dir_action=navigate&destination=' + departure.lat + ',' + departure.lng;
        document.documentElement.appendChild(link);
        link.click();
        link.remove();
      }
    }
  });
}
