import { Track } from 'src/app/model/track';
import { InteractiveToolContext, TrackEditTool, TrackEditToolContext } from '../../tool.interface';
import { Segment } from 'src/app/model/segment';
import { PointDescriptor } from 'src/app/model/point-descriptor';
import { MapAnchor } from 'src/app/components/map/markers/map-anchor';
import { MapComponent } from 'src/app/components/map/map.component';
import { Injector } from '@angular/core';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { MenuItem } from 'src/app/components/menus/menu-item';

export abstract class AddPointsTool implements TrackEditTool {

  abstract labelKey(ctx: TrackEditToolContext): string;

  isAvailable(ctx: TrackEditToolContext): boolean {
    const track = ctx.currentTrack$.value;
    if (!track) return false;
    const sel = ctx.selection.getSinglePointOf(track);
    if (!sel) return false;
    return sel.pointIndex === 0 || sel.pointIndex === track.segments[sel.segmentIndex].points.length - 1;
  }

  execute(ctx: TrackEditToolContext): void {
    const track = ctx.currentTrack$.value;
    if (!track) return;
    const sel = ctx.selection.getSinglePointOf(track);
    if (!sel) return;
    const isForward = sel.pointIndex !== 0;
    ctx.selection.cancelSelection();
    ctx.startInteractiveTool(iCtx => [
      new MenuItem()
        .setI18nLabel('track_edit_tools.stop_interactive')
        .setIcon('stop')
        .setAction(() => {
          this.disableAddPoints(true);
          iCtx.map.removeFromMap(this.anchor.marker);
          iCtx.close();
        }),
    ]).then(
      iCtx => {
        iCtx.startEditTrack().then(editionTrack => {
          this.continueAddPoints(ctx.injector, iCtx, editionTrack, sel.segmentIndex, isForward);
        });
      }
    );
  }

  protected anchor: MapAnchor = new MapAnchor({lat: 0, lng: 0}, '#0000d0', '+', undefined, '#ffffff', '#0000d0', undefined, false);

  private continueAddPoints(injector: Injector, iCtx: InteractiveToolContext, track: Track, segmentIndex: number, isForward: boolean): void {
    const that = this;
    this.enableAddPoints({
      track,
      segment: track.segments[segmentIndex],
      point: track.segments[segmentIndex].points[isForward ? track.segments[segmentIndex].points.length - 1 : 0],
      isForward,
      map: iCtx.map,
      injector,
      addPoints(points) {
        that.disableAddPoints(false);
        injector.get(GeoService).fillPointsElevation(points, true, false)
        .subscribe(() => {
          if (this.isForward) {
            this.segment.appendMany(points);
          } else {
            this.segment.insertMany(0, points);
          }
          iCtx.trackModified().then(newTrack => that.continueAddPoints(injector, iCtx, newTrack, segmentIndex, isForward));
        });
      },
    });
  }

  abstract enableAddPoints(ctx: AddPointsContext): void;
  abstract disableAddPoints(stop: boolean): void;

}

export interface AddPointsContext {

  track: Track;
  segment: Segment;
  point: PointDescriptor;
  isForward: boolean;

  map: MapComponent,
  injector: Injector,

  addPoints(points: PointDescriptor[]): void;

}
