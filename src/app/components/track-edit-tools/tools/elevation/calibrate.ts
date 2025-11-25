import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { Point } from 'src/app/model/point';
import { copyPoint, PointDescriptor } from 'src/app/model/point-descriptor';
import { Observable, of, switchMap } from 'rxjs';
import { AlertController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';

export class CalibrateElevationWithProvider implements TrackEditTool {

  readonly icon = undefined;
  labelKey(ctx: TrackEditToolContext): string { return 'calibrate_elevation'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return true;
  }

  execute(ctx: TrackEditToolContext) {
    ctx.modifyTrack(track => {
      const points: Point[] = [];
      const toFill: PointDescriptor[] = [];
      for (const segment of track.segments)
        for (const point of segment.points) {
          points.push(point);
          toFill.push({...copyPoint(point), ele: undefined});
        }
      return ctx.injector.get(GeoService).fillPointsElevation(toFill, true, true).pipe(
        switchMap(() => {
          let totalDiff = 0;
          let nbPoints = 0;
          for (let i = 0; i < points.length; ++i) {
            if (points[i].ele !== undefined && toFill[i].ele !== undefined) {
              totalDiff += toFill[i].ele! - points[i].ele!;
              nbPoints++;
            }
          }
          if (nbPoints === 0) return of(true);
          let diff = Math.round(totalDiff / nbPoints);
          return new Observable<boolean>(subscriber => {
            const i18n = ctx.injector.get(I18nService);
            ctx.injector.get(AlertController)
            .create({
              header: i18n.texts.track_edit_tools.tools.calibrate_elevation,
              message: i18n.translateWithArguments('track_edit_tools.tools.calibrate_elevation_message', [i18n.elevationInUserUnit(diff), i18n.shortUserElevationUnit()]),
              buttons: [
                {
                  text: i18n.texts.buttons.apply,
                  role: 'ok',
                  handler: () => {
                    for (const point of points) {
                      if (point.ele !== undefined) point.ele += diff;
                    }
                    ctx.injector.get(AlertController).dismiss();
                  }
                },
                {
                  text: i18n.texts.buttons.cancel,
                  role: 'cancel'
                }
              ]
            })
            .then(alert => {
              alert.onDidDismiss().then(() => {
                subscriber.next(true);
                subscriber.complete();
              });
              alert.present();
            })
          });
        })
      );
    }, true, false).subscribe();
  }
}
