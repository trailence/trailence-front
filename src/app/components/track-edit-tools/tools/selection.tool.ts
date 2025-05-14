import { SelectionComponent } from './selection/selection.component';
import { PointReference, PointReferenceRange, TrackEditToolContext } from './tool.interface';

export class SelectionTool {

  public cancel(ctx: TrackEditToolContext): void {
    ctx.removeTool(SelectionComponent);
  }

  public selectPoint(ctx: TrackEditToolContext, point: PointReference): void {
    ctx.appendTool({component: SelectionComponent, onCreated: (component) => component.selectPoint(point)});
  }

  public selectRange(ctx: TrackEditToolContext, range: PointReferenceRange): void {
    ctx.appendTool({component: SelectionComponent, onCreated: (component) => component.selectRange(range)});
  }

}

export function isSinglePoint(selection?: PointReference | PointReferenceRange): boolean {
  return (selection as any)?.pointIndex !== undefined;
}

export function isRange(selection?: PointReference | PointReferenceRange): boolean {
  return (selection as any)?.start !== undefined;
}
