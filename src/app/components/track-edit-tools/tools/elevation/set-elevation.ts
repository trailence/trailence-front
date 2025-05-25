import { of } from 'rxjs';
import { TrackEditTool, TrackEditToolContext } from '../tool.interface';
import { AlertController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';

export class SetElevationOnRangeWithStartTool implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext): string {
    return 'set_elevation_on_range.with_start';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext): void {
    ctx.modifySelectedRange(true, track => {
      const elevation = track.departurePoint?.ele;
      if (elevation !== undefined)
        track.forEachPoint(p => {
          p.ele = elevation;
          return undefined;
        });
      return of(true);
    }).subscribe();
  }

}

export class SetElevationOnRangeWithEndTool implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext): string {
    return 'set_elevation_on_range.with_end';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext): void {
    ctx.modifySelectedRange(true, track => {
      const elevation = track.arrivalPoint?.ele;
      if (elevation !== undefined)
        track.forEachPoint(p => {
          p.ele = elevation;
          return undefined;
        });
      return of(true);
    }).subscribe();
  }

}

export class SetElevationOnRangeSmoothTool implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext): string {
    return 'set_elevation_on_range.smoothing';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext): void {
    ctx.modifySelectedRange(true, track => {
      const start = track.departurePoint?.ele;
      const end = track.arrivalPoint?.ele;
      if (start !== undefined && end !== undefined) {
        let nb = 0;
        for (const segment of track.segments)
          nb += segment.points.length;
        nb -= 2;
        if (nb > 0) {
          let index = 0;
          for (const segment of track.segments)
            for (const point of segment.points) {
              if (index > 0 && index <= nb) {
                const elevation = start + ((end - start) / nb) * index;
                point.ele = elevation;
              }
              index++;
            }
        }
      }
      return of(true);
    }).subscribe();
  }
}

export class SetElevationOnRangeManuallyTool implements TrackEditTool {

  labelKey(ctx: TrackEditToolContext): string {
    return 'set_elevation_on_range.manually';
  }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return ctx.selection.isRange();
  }

  execute(ctx: TrackEditToolContext): void {
    const i18n = ctx.injector.get(I18nService);
    ctx.injector.get(AlertController).create({
      header: i18n.texts.track_edit_tools.categories.set_elevation_on_range,
      inputs: [
        {
          type: 'number',
          attributes: {
            step: 'any'
          }
        }
      ],
      buttons: [
        {
          text: i18n.texts.buttons.apply,
          role: 'ok'
        },
        {
          text: i18n.texts.buttons.cancel,
          role: 'cancel'
        }
      ]
    }).then(alert => {
      alert.onDidDismiss().then(result => {
        if (result.role === 'ok') {
          const elevation = parseFloat(result.data?.values[0]);
          if (!isNaN(elevation)) {
            ctx.modifySelectedRange(true, track => {
              track.forEachPoint(p => {
                p.ele = elevation;
                return undefined;
              });
              return of(true);
            }).subscribe();
          }
        }
      });
      alert.present();
    });
  }

}
