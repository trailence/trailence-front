import { map } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { RangeReference } from '@trailence/model/point-reference';
import { buildOsmSubTrack } from '@trailence/utils/track-computed-data/build-osm-track';

export class FollowOsmPath implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext) {
    return 'follow-osm-path';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    return ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const sel = ctx.selection.getSelectionForTrack(currentTrack);
    if (!(sel instanceof RangeReference)) return;
    ctx.modifyTrack(track => {
      return track.computed.osmWaysMatch$.pipe(
        map(response => {
          if (!response) return false;
          const newPoints = buildOsmSubTrack(track, response.osmTrackPoints, sel);
          if (newPoints.length === 0) return false;
          track.replaceWithPoints(sel.start.segmentIndex, sel.start.pointIndex, sel.end.segmentIndex, sel.end.pointIndex, newPoints);
          return true;
        })
      );
    }, true, false).subscribe(() => ctx.refreshTools());
  }

}
