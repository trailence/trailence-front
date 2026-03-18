import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-collapsable-section',
  templateUrl: './collapsable-section.component.html',
  styleUrl: './collapsable-section.component.scss',
  imports: [
    IonIcon,
  ]
})
export class CollapsableSectionComponent implements OnChanges {

  @Input() defaultCollapsed = true;
  @Input() collapsed = this.defaultCollapsed;
  @Output() collapsedChange = new EventEmitter<boolean>();

  @Input() icon?: string;
  @Input() title!: string;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultCollapsed']) {
      this.collapsed = this.defaultCollapsed;
    }
  }

  toggle(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }

}
