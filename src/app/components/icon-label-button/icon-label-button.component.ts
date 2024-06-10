import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-icon-label-button',
  templateUrl: './icon-label-button.component.html',
  styleUrls: ['./icon-label-button.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon]
})
export class IconLabelButtonComponent {

  @Input() icon: string = '';
  @Input() label: string = '';

  @Input() size = 20;
  @Input() fontSize?: number;

  @Input() color = 'default';

}
