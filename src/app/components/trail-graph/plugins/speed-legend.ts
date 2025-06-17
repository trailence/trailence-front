import * as C from 'chart.js';
import { EmptyObject, AnyObject } from 'chart.js/dist/types/basic';

export class SpeedLegendPlugin implements C.Plugin<"line"> {

  id = 'trailence-speed-legend';

  constructor(
    private readonly lineColor: string,
    private readonly textColor: string,
    private readonly text: string,
  ) {}

  afterDraw(chart: C.Chart<'line', (number | C.Point | null)[], unknown>, args: EmptyObject, options: AnyObject): void {
    let xAxis = chart.scales['x'];
    let ctx = chart.ctx;
    ctx.save();
    let x = xAxis.right;
    ctx.font = '100 8pt Roboto,sans-serif';
    const txtSize = ctx.measureText(this.text);
    ctx.fillStyle = this.textColor;
    ctx.fillText(this.text, x - txtSize.width, xAxis.bottom - 3);
    x -= txtSize.width + 5;
    ctx.fillStyle = this.lineColor;
    ctx.fillRect(x - 18, xAxis.bottom - 8, 15, 3);
    ctx.restore();
  }

}
