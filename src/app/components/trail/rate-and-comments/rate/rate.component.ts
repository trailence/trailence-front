import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-rate',
  template: `
  <ion-icon [name]="rate < 0.5 ? 'star-empty' : rate >= 1 ? 'star-filled' : 'star-half'"></ion-icon>
  <ion-icon [name]="rate < 1.5 ? 'star-empty' : rate >= 2 ? 'star-filled' : 'star-half'"></ion-icon>
  <ion-icon [name]="rate < 2.5 ? 'star-empty' : rate >= 3 ? 'star-filled' : 'star-half'"></ion-icon>
  <ion-icon [name]="rate < 3.5 ? 'star-empty' : rate >= 4 ? 'star-filled' : 'star-half'"></ion-icon>
  <ion-icon [name]="rate < 4.5 ? 'star-empty' : rate >= 5 ? 'star-filled' : 'star-half'"></ion-icon>
  <span *ngIf="showValue">{{ rate | number:'1.0-1' }}{{ showOn5 ? ' / 5' : ''}}</span>
  <span *ngIf="nbRates"> ({{nbRates}})</span>
  `,
  styles: `
  :host {
    display: flex;
    flex-direction: row;
    align-items: center;
  }
  ion-icon {
    width: 12px;
    height: 12px;
    color: var(--star-color);
  }
  span {
    margin-left: 5px;
    font-size: 12px;
  }
  `,
  imports: [CommonModule, IonIcon]
})
export class RateComponent {

  @Input() rate!: number;
  @Input() showValue = true;
  @Input() showOn5 = true;

  @Input() nbRates?: number;

}
