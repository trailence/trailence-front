import { combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { TrackEditToolContext } from '../tool.interface';
import { TrackUtils } from 'src/app/utils/track-utils';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { WayPointFromTrack } from 'src/app/utils/track-waypoints/waypoints-from-track';

export class MoveWayPointIndexTool {


  public static getMenu(ctx: TrackEditToolContext): Observable<MenuItem[]> {
    return combineLatest([
      ctx.currentTrack$.pipe(
        switchMap(track => track ? track.computed.wayPoints$.pipe(map(wayPoints => ({track, wayPoints}))) : of(undefined))
      ),
      ctx.selection.selectedWayPoint$,
    ]).pipe(
      map(r => {
        if (!r[0]) return [];
        let wayPoint = r[1];
        if (!wayPoint) {
          const point = ctx.selection.getSinglePointOf(r[0].track);
          if (!point) return [];
          wayPoint = TrackUtils.getWayPointAt(r[0].track, point.point.pos);
          if (!wayPoint) return [];
        }
        const computedWp = r[0].wayPoints.find(wp => WayPointFromTrack.from(wp)?.wayPoint === wayPoint);
        if (!computedWp) return [];
        const computed = WayPointFromTrack.from(computedWp)!;
        if (computed.otherPossibleIndexes.length === 0) return [];
        const currentIndex = r[0].track.wayPoints.indexOf(computed.wayPoint);
        if (currentIndex < 0) return [];
        const subItems: MenuItem[] = [];
        for (const newPossibility of computed.otherPossibleIndexes) {
          const newTargetWp = r[0].wayPoints.find(w => WayPointFromTrack.from(w)?.index === newPossibility.newIndex);
          if (!newTargetWp) continue;
          const newTarget = WayPointFromTrack.from(newTargetWp)!;
          const newTargetIndex = r[0].track.wayPoints.indexOf(newTarget.wayPoint);
          const newIndex = newTargetIndex >= 0 ? newTargetIndex : r[0].track.wayPoints.length;
          subItems.push(
            new MenuItem()
            .setIcon('sort')
            .setFixedLabel(() => ctx.injector.get(I18nService).texts.track_edit_tools.tools.way_points.move_waypoint_index_submenu + ' ' + newPossibility.newIndex)
            .setAction(() => {
              ctx.modifyTrack(track => {
                const wp = track.wayPoints[currentIndex];
                const newPos = track.segments[newPossibility.segmentIndex].points[newPossibility.pointIndex];
                console.log('move', currentIndex, newIndex, wp.point.pos, newPos.pos, newPossibility)
                wp.point.pos = {...newPos.pos};
                wp.point.ele = newPos.ele;
                track.moveWayPointAt(currentIndex, newIndex);
                return of(true);
              }, true, false).subscribe();
            })
          );
        }
        return subItems;
      })
    );
  }

}
