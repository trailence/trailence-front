import { Injector } from '@angular/core';
import { Track } from '@trailence/model/track';
import { Trail } from '@trailence/model/trail';
import { FetchSourceService } from '@trailence/services/fetch-source/fetch-source.service';
import { ErrorService } from '@trailence/services/progress/error.service';
import { MapTrackPath } from '../map/elements/map-track-path';
import { bboxPadRatio } from '@trailence/utils/latlng';
import { Color } from '@trailence/utils/color';

export function checkPublicTrailsAround(injector: Injector, track: Track, listener: (mapTracks: MapTrackPath[]) => void) {
  const trailence = injector.get(FetchSourceService).getPluginByName('Trailence');
  if (!trailence) return;
  let bounds = track.metadata.bounds;
  if (!bounds) return;
  bounds = bboxPadRatio(bounds, 1);
  const trails: Trail[] = [];
  trailence.searchByArea(bounds, 100).subscribe(
    result => {
      trails.push(...result.trails);
      if (!result.end) return;
      Promise.all(
        trails.map(trail => trailence.getFullTrack(trail.uuid).then(t => ({trail, track: t})))
      ).then(trailsAndTracks => {
        const list = trailsAndTracks.filter(t => !!t.track) as ({trail: Trail, track: Track}[]);
        const mapTracks = list.map(item => new MapTrackPath(item.trail, item.track, Color.parse('#FF60FFA0'), false, 4));
        listener(mapTracks);
      }).catch(e => injector.get(ErrorService).addError(e));
    }
  );
}
