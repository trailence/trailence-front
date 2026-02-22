import { Component, Input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-collapsable-section',
  templateUrl: './collapsable-section.component.html',
  styleUrl: './collapsable-section.component.scss',
  imports: [
    IonIcon,
  ]
})
export class CollapsableSectionComponent {

  @Input() defaultCollapsed = true;
  @Input() collapsed = this.defaultCollapsed;

  @Input() icon?: string;
  @Input() title!: string;

  toggle(): void {
    this.collapsed = !this.collapsed;
  }

}
