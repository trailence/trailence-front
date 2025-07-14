import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { copyPoint, PointDescriptor } from 'src/app/model/point';
import { TrackUtils } from 'src/app/utils/track-utils';
import { of } from 'rxjs';

export class LinkToNextSegment implements TrackEditTool {

  constructor(
    private readonly followingPath: boolean,
  ) {}

  labelKey(ctx: TrackEditToolContext): string {
    return 'link_to_next_segment_' + (this.followingPath ? 'follow' : 'with_line')
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    const sel = ctx.selection.getSinglePointOf(track);
    if (!sel) return false;
    if (sel.pointIndex !== track.segments[sel.segmentIndex].points.length - 1) return false;
    if (sel.segmentIndex === track.segments.length - 1) return false;
    if (!this.followingPath) return true;
    if (TrackUtils.findPath(track, sel.point.pos, track.segments[sel.segmentIndex + 1].points[0].pos)) return true;
    return false;
  }

  execute(ctx: TrackEditToolContext): void {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return;
    ctx.modifyTrack(false, track => {
      const nextSegment = track.segments[point.segmentIndex + 1];
      if (this.followingPath) {
        const path = TrackUtils.findPath(currentTrack, point.point.pos, currentTrack.segments[point.segmentIndex + 1].points[0].pos);
        if (path) {
          track.segments[point.segmentIndex].appendMany(path.map(p => this.copy(p)));
        }
      }
      track.segments[point.segmentIndex].appendMany(nextSegment.points.map(p => copyPoint(p)));
      track.removeSegmentAt(point.segmentIndex + 1);
      return of(true);
    }).subscribe(() => ctx.refreshTools());
  }

  private copy(pt: PointDescriptor): PointDescriptor {
    return {...copyPoint(pt), time: undefined, speed: undefined, heading: undefined};
  }

}
