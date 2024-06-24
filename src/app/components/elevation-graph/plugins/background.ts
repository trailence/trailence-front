import * as C from 'chart.js';
import { AnyObject } from 'chart.js/dist/types/basic';

export class BackgroundPlugin implements C.Plugin<"line"> {

  id = 'trailence-background';

  constructor(
    private backgroundColor: string
  ) {}

  beforeDraw(chart: C.Chart<"line">): void {
    let xAxis = chart.scales['x'];
    let yAxis = chart.scales['y'];
    let ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(xAxis.left, yAxis.top, xAxis.right - xAxis.left, yAxis.bottom - yAxis.top);
    ctx.restore();
  }

}
