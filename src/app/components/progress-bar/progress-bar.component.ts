import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  template: `
  <div class="outer-progress" style="--color: {{ color }}; --height: {{ height }}">
    <div class="inner-progress" style="width: {{ done * 100 / total }}%"></div>
    <div class="inner-text">{{ text }}</div>
  </div>
  `,
  styles: `
  div.outer-progress {
    border: 1px solid rgb(var(--color));
    border-radius: calc(var(--height) * 1px / 3);
    position: relative;
    height: calc(var(--height) * 1px);

    div.inner-progress {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      background-color: rgb(var(--color));
      border-radius: calc(var(--height) * 1px / 5);
    }
    div.inner-text {
      text-align: center;
      font-size: calc(var(--height) * 1px - 4px);
      mix-blend-mode: overlay;
    }
  }
  `,
  imports: []
})
export class ProgressBarComponent {

  @Input() done = 0;
  @Input() total = 1;
  @Input() color = 'var(--ion-color-secondary-rgb)';
  @Input() height = 15;
  @Input() text = '';

}
