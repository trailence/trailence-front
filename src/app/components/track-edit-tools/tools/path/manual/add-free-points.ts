import { Subscription } from 'rxjs';
import { TrackEditToolContext } from '../../tool.interface';
import { AddPointsContext, AddPointsTool } from './add-points-tool';

export class AddFreePoints extends AddPointsTool {

  override labelKey(ctx: TrackEditToolContext): string {
    return 'add_points.free.title';
  }

  private anchorMapOverSubscription?: Subscription;
  private anchorMapClickSubscription?: Subscription;

  override enableAddPoints(ctx: AddPointsContext): void {
    ctx.map.addToMap(this.anchor.marker);
    this.anchorMapOverSubscription = ctx.map.mouseOver.subscribe(pos => {
      this.anchor.marker.setLatLng(pos);
    });
    this.anchorMapClickSubscription = ctx.map.mouseClick.subscribe(pos => {
      ctx.addPoints([{
        pos,
      }])
    });
  }

  override disableAddPoints(): void {
    this.anchor.marker.remove();
    this.anchorMapOverSubscription?.unsubscribe();
    this.anchorMapOverSubscription = undefined;
    this.anchorMapClickSubscription?.unsubscribe();
    this.anchorMapClickSubscription = undefined;
  }

}
