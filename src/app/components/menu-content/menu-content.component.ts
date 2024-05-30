import { Component, Input } from '@angular/core';
import { MenuItem } from 'src/app/utils/menu-item';
import { IonItem, IonIcon, IonLabel } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-menu-content',
  templateUrl: './menu-content.component.html',
  styleUrls: ['./menu-content.component.scss'],
  standalone: true,
  imports: [IonLabel, IonIcon, IonItem, CommonModule]
})
export class MenuContentComponent {

  @Input() menu?: MenuItem[]

  constructor(
    public i18n: I18nService,
  ) {}

  clicked(item: MenuItem): void {
    if (item.action) item.action();
  }
}
