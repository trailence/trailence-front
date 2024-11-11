import * as C from 'chart.js';
import { Color } from 'src/app/utils/color';

export class RangeEvent {
  constructor(
    public datasetIndex: number,
    public start: C.ActiveElement,
    public end: C.ActiveElement
  ) {}
}

export class RangeSelectionEvent {
  constructor(
    public datasets: RangeEvent[]
  ) {}
}

export interface SelectedRange {
  startX: number;
  startElements?: C.ActiveElement[];
  endX: number;
  endElements?: C.ActiveElement[];
}

export class RangeSelection implements C.Plugin<"line"> {

  id = 'trailence-range-selection';

  private selecting?: SelectedRange;
  private moving = false;
  private selected?: SelectedRange;

  constructor(
    private readonly selectingColor: string,
    private readonly selectionColor: string,
    private readonly onSelecting: (event: RangeSelectionEvent | undefined) => void,
    private readonly onSelected: (event: RangeSelectionEvent | undefined) => void,
    private readonly isEnabled: () => boolean,
  ) {}

  public setSelection(selection: SelectedRange): void {
    this.selected = selection;
  }

  afterEvent(chart: C.Chart<"line">, args: any): void {
    if (!this.isEnabled()) {
      return;
    }
    const event = args.event;
    if (event.type === 'mousedown') {
      this.cancelSelection();
      this.onSelected(undefined);
      this.selecting = {
        startX: event.x,
        startElements: chart.getActiveElements(),
        endX: -1,
        endElements: undefined,
      }
      this.moving = false;
    } else if (event.type === 'mousemove') {
      if (this.selecting) {
        this.moving = true;
        this.selecting.endX = event.x;
        this.selecting.endElements = chart.getActiveElements();
        this.onSelecting(this.buildSelectingEvent());
      }
    } else if (event.type === 'mouseout') {
      if (this.selecting) {
        this.cancelSelecting();
        this.onSelecting(undefined);
      }
    } else if (event.type === 'mouseup') {
      this.onSelecting(undefined);
      if (this.selecting && this.moving) {
        this.selected = this.selecting;
        this.onSelected(this.buildSelectionEvent());
      }
      this.cancelSelecting();
      chart.draw();
    }
  }

  private cancelSelecting(): void {
    this.selecting = undefined;
    this.moving = false;
  }

  private cancelSelection(): void {
    this.selected = undefined;
  }

  afterDraw(chart: C.Chart<"line">): void {
    if (!this.isEnabled()) return;
    if (this.selecting && this.selecting.endX >= 0 && this.selecting.startX !== this.selecting.endX && this.moving) {
      // draw selecting
      this.draw(chart, this.selecting.startX, this.selecting.endX, this.selectingColor);
    } else if (this.selected && this.selected.endX >= 0 && this.selected.startX !== this.selected.endX) {
      // draw selection
      this.draw(chart, this.selected.startX, this.selected.endX, this.selectionColor);
    }
  }

  private draw(chart: C.Chart<"line">, startX: number, endX: number, color: string): void {
    if (!this.isEnabled()) return;
    const start = Math.min(startX, endX);
    const end = Math.max(startX, endX);

    let yAxis = chart.scales['y'];
    let ctx = chart.ctx;

    ctx.save();

    ctx.fillStyle = new Color(color).setAlpha(0.3).toString();
    ctx.fillRect(start, yAxis.top, end - start, yAxis.bottom - yAxis.top);

    ctx.beginPath();
    ctx.moveTo(start, yAxis.top);
    ctx.lineTo(start, yAxis.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(end, yAxis.top);
    ctx.lineTo(end, yAxis.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.restore();
  }

  private buildSelectingEvent(): RangeSelectionEvent | undefined {
    return this.buildEvent(this.selecting?.startElements, this.selecting?.endElements);
  }

  private buildSelectionEvent(): RangeSelectionEvent | undefined {
    return this.buildEvent(this.selected?.startElements, this.selected?.endElements);
  }

  private buildEvent(startElements?: C.ActiveElement[], endElements?: C.ActiveElement[]): RangeSelectionEvent | undefined {
    if (!startElements || !endElements) {
      return undefined;
    }
    const starts: {datasetIndex: number; start: C.ActiveElement}[] = [];
    for (const e of startElements) {
      starts.push({datasetIndex: e.datasetIndex, start: e});
    }
    const event = new RangeSelectionEvent([]);
    for (const e of endElements) {
      const start = starts.find(d => d.datasetIndex === e.datasetIndex && d.start.index !== e.index);
      if (start) {
        if (start.start.index < e.index)
          event.datasets.push(new RangeEvent(e.datasetIndex, start.start, e));
        else
          event.datasets.push(new RangeEvent(e.datasetIndex, e, start.start));
      }
    }
    if (event.datasets.length === 0) return undefined;
    return event;
  }

}
