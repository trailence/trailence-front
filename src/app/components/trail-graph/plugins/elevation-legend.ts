import * as C from 'chart.js';
import { Color } from 'src/app/utils/color';

const width = 25;
const height = 15;
const space = 1;

export class ElevationLegendPlugin implements C.Plugin<"line"> {

  id = 'trailence-elevation-legend';

  constructor(
    private readonly gradeColors: string[],
    private readonly gradeLegend: string[],
  ) {}

  afterDraw(chart: C.Chart<'line', (number | C.Point | null)[], unknown>): void {
    let xAxis = chart.scales['x'];
    if (xAxis.width < 225) return;
    let ctx = chart.ctx;
    ctx.save();
    let x = xAxis.right;
    for (let i = this.gradeColors.length -1; i >= 0; --i) {
      const bg = new Color(this.gradeColors[i]);
      ctx.fillStyle = this.gradeColors[i];
      ctx.fillRect(x - width, xAxis.bottom - height, width, height);
      if (bg.r + bg.g + bg.b < 120 * 3)
        ctx.fillStyle = '#FFFFFF';
      else
        ctx.fillStyle = '#000000';
      ctx.font = '100 6pt Roboto,sans-serif';
      const txtSize = ctx.measureText(this.gradeLegend[i]);
      ctx.fillText(this.gradeLegend[i], x - width + (width / 2 - txtSize.width / 2), xAxis.bottom - height + height / 2 + 2);
      x -= width + space;
    }
    ctx.restore();
  }

}
