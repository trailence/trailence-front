import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-box-title',
  template: `
  <div class="box {{title && title.length > 0 ? 'with-title' : ''}}">
    @if (title && title.length > 0) { <div class="box-title">{{title}}</div> }
    <div class="box-content"><ng-content></ng-content></div>
  </div>
  `,
  styles: `
  :host {
    background-color: var(--ion-background-color);
  }
  div.box {
    border: 1px solid var(--ion-color-medium);
    border-radius: 5px;

    &.with-title {
      margin-top: 5px;
      padding-top: 8px;
      position: relative;

      div.box-title {
        position: absolute;
        top: -8px;
        left: 20px;
        background-color: var(--ion-background-color);
        padding: 0 8px;
        font-size: 12px;
        color: var(--ion-color-medium);
      }
    }
  }
  `,
})
export class BoxTitleComponent {

  @Input() title = '';

}
