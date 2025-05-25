import * as C from 'chart.js';
import { AnyObject } from 'chart.js/dist/types/basic';
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
    private readonly singleSelectionColor: string,
    private readonly onSelecting: (event: RangeSelectionEvent | undefined) => void,
    private readonly onSelected: (event: RangeSelectionEvent | undefined) => void,
    private readonly isEnabled: () => boolean,
    private readonly onZoomButton: (pos: {x: number, y: number} | undefined) => void,
  ) {}

  public setSelection(selection: SelectedRange | undefined): void {
    this.selected = selection;
  }

  beforeEvent(chart: C.Chart<'line', (number | C.Point | null)[], unknown>, args: { event: C.ChartEvent; replay: boolean; cancelable: true; inChartArea: boolean; }, options: AnyObject): boolean | void {
    if (args.event.type === 'click' && this.selected && this.selected.endX === args.event.x) {
      // prevent click if from a range selection
      args.event.native?.preventDefault();
      args.event.native?.stopPropagation();
      return false;
    }
  }

  afterEvent(chart: C.Chart<"line">, args: any): void {
    if (!this.isEnabled()) {
      return;
    }
    const event = args.event;
    if (event.type === 'mousedown') {
      this.cancelSelection();
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
        if (event.x !== this.selecting.startX || this.selecting.endX !== -1) {
          this.selecting.endX = event.x;
          this.selecting.endElements = chart.getActiveElements();
          this.onSelecting(this.buildSelectingEvent());
        }
      }
    } else if (event.type === 'mouseout') {
      if (this.selecting) {
        this.cancelSelecting();
        this.onSelecting(undefined);
      }
    } else if (event.type === 'mouseup') {
      if (this.selecting && this.moving) {
        this.selected = this.selecting;
        this.onSelecting(undefined);
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
    if (this.selected) {
      this.selected = undefined;
      this.onSelected(undefined);
    }
  }

  afterDraw(chart: C.Chart<"line">): void {
    if (!this.isEnabled()) return;
    if (this.selecting && this.selecting.endX >= 0 && this.selecting.startX !== this.selecting.endX && this.moving) {
      // draw selecting
      this.drawRange(chart, this.selecting.startX, this.selecting.endX, this.selectingColor);
    } else if (this.selected && this.selected.startX !== -1) {
      // draw selection
      if (this.selected.endX >= 0 && this.selected.startX !== this.selected.endX) {
        this.drawRange(chart, this.selected.startX, this.selected.endX, this.selectionColor);
      } else {
        this.drawSinglePoint(chart, this.selected.startX, (this.selected.startElements ?? []).map(e => e.element.y), this.singleSelectionColor);
        this.onZoomButton(undefined);
      }
    } else {
      this.onZoomButton(undefined);
    }
  }

  private drawRange(chart: C.Chart<"line">, startX: number, endX: number, color: string): void {
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
    if (this.selecting) {
      this.onZoomButton(undefined);
    } else {
      let minY = -1;
      let maxY = -1;
      this.selected?.startElements?.forEach(e => {
        if (minY === -1 || e.element.y < minY) minY = e.element.y;
        if (maxY === -1 || e.element.y > maxY) maxY = e.element.y;
      });
      this.selected?.endElements?.forEach(e => {
        if (minY === -1 || e.element.y < minY) minY = e.element.y;
        if (maxY === -1 || e.element.y > maxY) maxY = e.element.y;
      });
      if (minY === -1) this.onZoomButton(undefined);
      else this.onZoomButton({
        x: (startX + (endX - startX) / 2) - 17,
        y: (maxY < yAxis.bottom - (yAxis.bottom - yAxis.top) * 0.6) ? yAxis.bottom - 35 : yAxis.top
      });
    }
  }

  private drawSinglePoint(chart: C.Chart<"line">, x: number, ys: number[], color: string): void {
    if (!this.isEnabled()) return;

    let yAxis = chart.scales['y'];
    let ctx = chart.ctx;

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(x, yAxis.top);
    ctx.lineTo(x, yAxis.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.lineWidth = 2;
    for (const y of ys) {
      ctx.beginPath();
      ctx.ellipse(x, y, 3, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

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
