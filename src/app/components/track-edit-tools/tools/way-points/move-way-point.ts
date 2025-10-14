import { filter, Subscription, take } from 'rxjs';
import { InteractiveToolContext, TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { PointReference } from 'src/app/model/point-reference';

export class MoveWayPointTool implements TrackEditTool {

  readonly icon = 'move';
  labelKey(ctx: TrackEditToolContext) {
    return 'way_points.move_waypoint';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return false;
    const wayPoint = ctx.selection.selectedWayPoint$.value;
    if (wayPoint) return true;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    if (!point) return false;
    return TrackUtils.getWayPointAt(currentTrack, point.point.pos) !== undefined ||
      (point.segmentIndex === 0 && point.pointIndex === 0) ||
      (point.segmentIndex === currentTrack.segments.length - 1 && point.pointIndex === currentTrack.segments[point.segmentIndex].points.length - 1);
  }

  execute(ctx: TrackEditToolContext) {
    const currentTrack = ctx.currentTrack$.value;
    if (!currentTrack) return;
    const point = ctx.selection.getSinglePointOf(currentTrack);
    const wayPoint = ctx.selection.selectedWayPoint$.value;
    if (!point && !wayPoint) return;
    ctx.selection.cancelSelection();
    let selectionSubscription: Subscription | undefined;
    const stop = (iCtx: InteractiveToolContext) => {
      selectionSubscription?.unsubscribe();
      iCtx.close();
    };
    ctx.startInteractiveTool(iCtx => [
      new MenuItem().setI18nLabel('track_edit_tools.tools.way_points.select_new_position').setSectionTitle(true),
      new MenuItem()
        .setI18nLabel('buttons.cancel')
        .setIcon('cross')
        .setAction(() => {
          stop(iCtx);
        }),
    ]).then(
      iCtx => {
        selectionSubscription = ctx.selection.selection$.pipe(filter(s => s?.length === 1 && s[0] instanceof PointReference), take(1)).subscribe(s => {
          const newPos = s![0] as PointReference;
          iCtx.startEditTrack().then(editionTrack => {
            const wp = wayPoint ? editionTrack.wayPoints[currentTrack.wayPoints.indexOf(wayPoint)] : TrackUtils.getWayPointAt(editionTrack, point!.point.pos);
            if (wp) {
              wp.point.pos = {...newPos.point.pos};
              wp.point.ele = newPos.point.ele;
            }
            iCtx.trackModified().then(() => {
              iCtx.endEditTrack();
              stop(iCtx);
            })
          });
        });
      }
    );
  }

}
