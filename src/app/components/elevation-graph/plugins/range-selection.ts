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

export class RangeSelection implements C.Plugin<"line"> {

  id = 'trailence-range-selection';

  private startX = -1;
  private startElements?: C.ActiveElement[];
  private endX = -1;
  private endElements?: C.ActiveElement[];
  private moving = false;

  private selectedFromX = -1;
  private selectedFromElements?: C.ActiveElement[];
  private selectedToX = -1;
  private selectedToElements?: C.ActiveElement[];

  constructor(
    private selectingColor: string,
    private selectionColor: string,
    private onSelecting: (event: RangeSelectionEvent | undefined) => void,
    private onSelected: (event: RangeSelectionEvent | undefined) => void,
    private isEnabled: () => boolean
  ) {}

  afterEvent(chart: C.Chart<"line">, args: any): void {
    if (!this.isEnabled()) {
      return;
    }
    const event = args.event;
    if (event.type === 'mousedown') {
      this.cancelSelection();
      this.onSelected(undefined);
      this.startX = event.x;
      this.startElements = chart.getActiveElements();
      this.endX = -1;
      this.endElements = undefined;
      this.moving = false;
    } else if (event.type === 'mousemove') {
      if (this.startX >= 0) {
        this.moving = true;
        this.endX = event.x;
        this.endElements = chart.getActiveElements();
        this.onSelecting(this.buildSelectingEvent());
      }
    } else if (event.type === 'mouseout') {
      if (this.startX >= 0) {
        this.cancelSelecting();
        this.onSelecting(undefined);
      }
    } else if (event.type === 'mouseup') {
      this.onSelecting(undefined);
      if (this.startX >= 0 && this.moving) {
        this.selectedFromX = this.startX;
        this.selectedFromElements = this.startElements;
        this.selectedToX = this.endX;
        this.selectedToElements = this.endElements;
        this.onSelected(this.buildSelectionEvent());
      }
      this.cancelSelecting();
      chart.draw();
    }
  }

  private cancelSelecting(): void {
    this.startX = -1;
    this.startElements = undefined;
    this.endX = -1;
    this.endElements = undefined;
    this.moving = false;
  }

  private cancelSelection(): void {
    this.selectedFromX = -1;
    this.selectedFromElements = undefined;
    this.selectedToX = -1;
    this.selectedToElements = undefined;
  }

  afterDraw(chart: C.Chart<"line">): void {
    if (!this.isEnabled()) return;
    if (this.startX >= 0 && this.endX >= 0 && this.startX !== this.endX && this.moving) {
      // draw selecting
      this.draw(chart, this.startX, this.endX, this.selectingColor);
    } else if (this.selectedFromX >= 0 && this.selectedToX >= 0 && this.selectedFromX !== this.selectedToX) {
      // draw selection
      this.draw(chart, this.selectedFromX, this.selectedToX, this.selectionColor);
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
    return this.buildEvent(this.startElements, this.endElements);
  }

  private buildSelectionEvent(): RangeSelectionEvent | undefined {
    return this.buildEvent(this.selectedFromElements, this.selectedToElements);
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
