import * as C from 'chart.js';

export class HoverVerticalLine implements C.Plugin<"line"> {

  id = 'trailence-hover-vertical-line';

  constructor(
    private contrastColor: string
  ) {}

  afterDraw(chart: C.Chart<"line">): void {
    if (chart.tooltip?.getActiveElements().length) {
      let x = chart.tooltip.getActiveElements()[0].element.x;
      let y = chart.tooltip.getActiveElements()[0].element.y;
      let xAxis = chart.scales['x'];
      let yAxis = chart.scales['y'];
      let ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, yAxis.top);
      ctx.lineTo(x, yAxis.bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.contrastColor;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xAxis.left, y);
      ctx.lineTo(xAxis.right, y);
      ctx.stroke();
      ctx.restore();
    }
  }

}
