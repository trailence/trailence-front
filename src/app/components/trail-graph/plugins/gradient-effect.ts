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

    const values: {val: number, nb: number}[] = [];
    const startX = Math.floor(xAxis.left) + 1;
    const endX = Math.floor(xAxis.right) + 1;
    for (let x = startX; x <= endX; ++x) values.push({val: 0, nb: 0});
    for (const data of dataset.data) {
      const i = Math.max(0, Math.min(values.length - 1, Math.round(data.x) - startX));
      values[i].val += data.y;
      values[i].nb++;
    }
    for (let x = 0; x < values.length; ++x) {
      let v = values[x];
      if (v.nb === 0) {
        let x1 = x - 1;
        while (x1 > 0 && values[x1].nb === 0) x1--;
        let x2 = x + 1;
        while (x2 < values.length && values[x2].nb === 0) x2++;
        if (x1 < 0) {
          if (x2 >= values.length) {
            continue;
          }
          v = {...values[x2]};
        } else if (x2 >= values.length) {
          v = {...values[x1]};
        } else {
          let x1Val = values[x1].val / values[x1].nb;
          let x2Val = values[x2].val / values[x2].nb;
          let x1Distance = x - x1;
          let x2Distance = x2 - x;
          let totalDistance = x1Distance + x2Distance;
          v = {val: x1Val * (x2Distance / totalDistance) + x2Val * (x1Distance / totalDistance), nb: 1};
        }
      }
      const y = v.val / v.nb;
      let gradient = ctx.createLinearGradient(x, y, x, yAxis.bottom);
      gradient.addColorStop(0, this.c1)
      gradient.addColorStop(0.5, this.c1);
      gradient.addColorStop(0.66, this.c2);
      gradient.addColorStop(0.8, this.c3);
      gradient.addColorStop(1, this.c4);
      ctx.fillStyle = gradient;
      ctx.fillRect(x + startX - 1, y, 1, yAxis.bottom - y);
    }

    ctx.restore();
  }

}
