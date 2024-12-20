import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonIcon, IonBadge } from '@ionic/angular/standalone';

@Component({
    selector: 'app-icon-label-button',
    templateUrl: './icon-label-button.component.html',
    styleUrls: ['./icon-label-button.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, IonIcon, IonBadge]
})
export class IconLabelButtonComponent {

  @Input() icon: string = '';
  @Input() label: string = '';

  @Input() size = 20;
  @Input() fontSize?: number;

  @Input() color = 'default';

  @Input() badge?: any;
  @Input() showBadge?: (badge: any) => boolean;

  @Input() disabled = false;

}
