import { TrackEditTool, TrackEditToolContext } from '../tool.interface';

export class CloseSelectionTool implements TrackEditTool {

  readonly icon = 'selection-off';
  labelKey(ctx: TrackEditToolContext) { return 'selection.close'; }

  isAvailable(ctx: TrackEditToolContext): boolean {
    return !!ctx.getSelection();
  }

  execute(ctx: TrackEditToolContext) {
    ctx.cancelSelection();
  }

}
