import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-percent-circle',
  template: `
<svg viewBox="0 0 36 36" class="circular-chart" style="--size: {{size}}px; --color: {{color}}; --bgColor: {{bgColor}}; --textColor: {{textColor}}; --percent: {{percent}}">
  <path class="circle-bg"
    d="M18 2.0845
      a 15.9155 15.9155 0 0 1 0 31.831
      a 15.9155 15.9155 0 0 1 0 -31.831"
  />
  <path class="circle"
    stroke-dasharray="var(--percent), 100"
    d="M18 2.0845
      a 15.9155 15.9155 0 0 1 0 31.831
      a 15.9155 15.9155 0 0 1 0 -31.831"
  />
  <text x="18" y="20.35" class="percentage">{{percent}}%</text>
</svg>
  `,
  styles: `
.circular-chart {
  display: block;
  max-width: var(--size);
  max-height: var(--size);
  min-width: var(--size);
  min-height: var(--size);
}

.circle-bg {
  fill: none;
  stroke: var(--bgColor);
  stroke-width: 3.8;
}

.circle {
  fill: none;
  stroke-width: 3.8;
  stroke-linecap: round;
  stroke: var(--color);
}

.percentage {
  fill: var((--textColor));
  font-family: sans-serif;
  font-size: 0.7em;
  text-anchor: middle;
}
  `,
})
export class PercentCircleComponent {

  @Input() percent = 0;
  @Input() color = 'var(--ion-color-primary)';
  @Input() bgColor = 'var(--ion-color-medium)';
  @Input() textColor = 'var(--ion-text-color)';
  @Input() size = 32;

}
