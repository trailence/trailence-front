import { Injector } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { TrackService } from '../database/track.service';
import { combineLatest, first, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { PreferencesService } from '../preferences/preferences.service';
import { Track } from 'src/app/model/track';
import { I18nService } from '../i18n/i18n.service';
import { TrailService } from '../database/trail.service';
import { Router } from '@angular/router';
import { copyPoint } from 'src/app/model/point-descriptor';

export function mergeTrails(injector: Injector, trails: Trail[], collectionUuid: string): void {
  const trackService = injector.get(TrackService);
  combineLatest(trails.map(
    trail => combineLatest([
      trackService.getFullTrackReady$(trail.originalTrackUuid, trail.owner).pipe(first()),
      trackService.getFullTrackReady$(trail.currentTrackUuid, trail.owner).pipe(first())
    ]).pipe(
      map(([track1, track2]) => ({trail, track1, track2}))
    )
  )).subscribe(trailsAndTracks => {
    trailsAndTracks.sort((t1, t2) => (t1.track1.metadata.startDate ?? 0) - (t2.track1.metadata.startDate ?? 0))
    const owner = injector.get(AuthService).email!;
    const preferences = injector.get(PreferencesService);
    const originalTrack = new Track({owner}, preferences);
    const editedTrack = new Track({owner}, preferences);
    const merge = new Trail({
      owner,
      collectionUuid,
      name: injector.get(I18nService).texts.pages.trail.actions.merged_trail_name,
      originalTrackUuid: originalTrack.uuid,
      currentTrackUuid: editedTrack.uuid
    });
    for (const trail of trailsAndTracks) {
      mergeTrack(trail.track1, originalTrack);
      mergeTrack(trail.track2, editedTrack);
    }
    trackService.create(editedTrack);
    trackService.create(originalTrack);
    injector.get(TrailService).create(merge);
    const router = injector.get(Router);
    router.navigateByUrl('/trail/' + encodeURIComponent(owner) + '/' + merge.uuid + '?from=' + encodeURIComponent(router.url));
  });
}

function mergeTrack(source: Track, target: Track) {
  for (const segment of source.segments) {
    const st = target.newSegment();
    st.appendMany(segment.points.map(pt => copyPoint(pt)));
  }
  for (const wp of source.wayPoints) {
    target.appendWayPoint(wp.copy());
  }
}
