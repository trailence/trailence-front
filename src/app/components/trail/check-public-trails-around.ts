import { MapTrack } from '../map/track/map-track';
import { Injector } from '@angular/core';
import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';

export function checkPublicTrailsAround(injector: Injector, track: Track, listener: (mapTracks: MapTrack[]) => void) {
  const trailence = injector.get(FetchSourceService).getPluginByName('Trailence');
  if (!trailence) return;
  const bounds = track.metadata.bounds?.pad(1);
  if (!bounds) return;
  const trails: Trail[] = [];
  trailence.searchByArea(bounds, 100).subscribe(
    result => {
      trails.push(...result.trails);
      if (!result.end) return;
      Promise.all(
        trails.map(trail => trailence.getFullTrack(trail.uuid).then(t => ({trail, track: t})))
      ).then(trailsAndTracks => {
        const list = trailsAndTracks.filter(t => !!t.track) as ({trail: Trail, track: Track}[]);
        const i18n = injector.get(I18nService);
        const mapTracks = list.map(item => {
          const mt = new MapTrack(item.trail, item.track, '#FF60FFA0', 1, false, i18n, 4);
          mt.ignoreCursorHover = true;
          return mt;
        });
        listener(mapTracks);
      });
    }
  );
}
