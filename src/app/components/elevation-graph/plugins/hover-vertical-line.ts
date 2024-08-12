import * as C from 'chart.js';

export class HoverVerticalLine implements C.Plugin<"line"> {

  id = 'trailence-hover-vertical-line';

  constructor(
    private contrastColor: string
  ) {}

  afterDraw(chart: C.Chart<"line">): void {
    const activeElements = chart.tooltip?.getActiveElements();
    if (activeElements?.length) {
      let ctx = chart.ctx;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.contrastColor;
      for (const activeElement of activeElements) {
        let x = activeElement.element.x;
        let y = activeElement.element.y;
        let xAxis = chart.scales['x'];
        let yAxis = chart.scales['y'];
        ctx.beginPath();
        ctx.moveTo(x, yAxis.top);
        ctx.lineTo(x, yAxis.bottom);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(xAxis.left, y);
        ctx.lineTo(xAxis.right, y);
        ctx.stroke();
        ctx.ellipse(x, y, 3, 3, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

}
