import * as C from 'chart.js';
import { Color } from 'src/app/utils/color';

export class GradientEffectPlugin implements C.Plugin<"line"> {

  id = 'trailence-gradient-effect';

  constructor(
    backgroundColor: Color
  ) {
    this.c1 = backgroundColor.copy().setAlpha(0).toString();
    this.c2 = backgroundColor.copy().setAlpha(0.2).toString();
    this.c3 = backgroundColor.copy().setAlpha(0.35).toString();
    this.c4 = backgroundColor.copy().setAlpha(0.5).toString();
  }

  private readonly c1: string;
  private readonly c2: string;
  private readonly c3: string;
  private readonly c4: string;

  afterDraw(chart: C.Chart<'line', (number | C.Point | null)[], unknown>): void {
    let hasGrades = false;
    let dataset;
    for (const meta of (chart as any)._metasets) {
      if (meta._dataset.isGrade) {
        hasGrades = true;
      } else {
        dataset = meta;
      }
    }
    if (!hasGrades) return;
    let ctx = chart.ctx;
    if (!ctx) return;
    let xAxis = chart.scales['x'];
    let yAxis = chart.scales['y'];
    ctx.save();

    let x1 = xAxis.left;
    let x2 = Math.min(xAxis.right, x1 + 5);
    let i = 0;
    let yMin = yAxis.bottom;
    while (i < dataset.data.length) {
      do {
        const y = dataset.data[i].y;
        yMin = Math.min(yMin, y);
      } while (dataset.data[i++].x <= x2 && i < dataset.data.length);
      let gradient = ctx.createLinearGradient(x1, yMin, x1, yAxis.bottom);
      gradient.addColorStop(0, this.c1)
      gradient.addColorStop(0.5, this.c1);
      gradient.addColorStop(0.66, this.c2);
      gradient.addColorStop(0.8, this.c3);
      gradient.addColorStop(1, this.c4);
      ctx.fillStyle = gradient;
      ctx.fillRect(x1, yMin, x2 - x1, yAxis.bottom - yMin);

      x1 = x2 - 0.001;
      x2 = Math.min(xAxis.right, x1 + 5);
      yMin = yAxis.bottom;
    }
    ctx.restore();
  }

}
