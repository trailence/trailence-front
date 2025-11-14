import * as C from 'chart.js';
import { Track } from 'src/app/model/track';
import { Color } from 'src/app/utils/color';

export class PositionPlugin implements C.Plugin<"line"> {

  id = 'trailence-position';

  public track?: Track;
  public segmentIndex?: number;
  public pointIndex?: number;

  afterDraw(chart: C.Chart<"line">): void {
    if (this.segmentIndex === undefined || this.pointIndex === undefined || this.track === undefined || chart.data.datasets.length === 0) return;
    const ds = chart.data.datasets.find(ds => (ds as any).track === this.track);
    if (!ds) return;
    const index = ds.data.findIndex((d: any) => d.segmentIndex === this.segmentIndex && d.pointIndex === this.pointIndex);
    if (index < 0) return;
    const meta = chart.getDatasetMeta(0);
    const elements = meta.data;
    if (index >= elements.length) return;
    const element = elements[index];
    let ctx = chart.ctx;
    ctx.save();
    ctx.lineWidth = 2.5;
    const color = new Color((ds as any).strokeColor);
    ctx.strokeStyle = color.toString();
    ctx.fillStyle = color.copy().setAlpha(0.25).toString();
    ctx.beginPath();
    ctx.ellipse(element.x, element.y, 5, 5, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'none';
    ctx.beginPath();
    ctx.ellipse(element.x, element.y, 5, 5, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

}
