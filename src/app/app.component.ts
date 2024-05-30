import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet, IonContent, IonMenu } from '@ionic/angular/standalone';
import { HeaderComponent } from './components/header/header.component';
import { CommonModule } from '@angular/common';
import { I18nService } from './services/i18n/i18n.service';
import { addIcons } from 'ionicons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [
    IonApp,
    IonMenu,
    IonContent,
    IonRouterOutlet,
    HeaderComponent,
    CommonModule,
  ],
})
export class AppComponent {
  constructor(
    public i18n: I18nService,
  ) {
    addIcons({
      'add-circle': 'assets/ionicons/add-circle-outline.svg',
      'caret-down': 'assets/ionicons/caret-down.svg',
      'date': 'assets/ionicons/calendar-outline.svg',
      'distance': 'assets/distance.1.svg',
      'duration': 'assets/ionicons/time-outline.svg',
      'filters': 'assets/ionicons/funnel-outline.svg',
      'i18n': 'assets/ionicons/language-outline.svg',
      'item-menu': 'assets/ionicons/ellipsis-vertical.svg',
      'offline': 'assets/ionicons/alert-circle-outline.svg',
      'online': 'assets/ionicons/checkmark-circle-outline.svg',
      'negative-elevation': 'assets/negative-elevation.1.svg',
      'positive-elevation': 'assets/positive-elevation.1.svg',
      'settings': 'assets/ionicons/settings.svg',
      'sort': 'assets/ionicons/swap-vertical-outline.svg',
      'sync': 'assets/ionicons/sync-circle-outline.svg',
      'tags': 'assets/ionicons/pricetags-outline.svg',
      'trash': 'assets/ionicons/trash.svg',
      'theme': 'assets/ionicons/color-palette-outline.svg',
      'theme-light': 'assets/ionicons/sunny-outline.svg',
      'theme-dark': 'assets/ionicons/moon-outline.svg',
      'theme-system': 'assets/ionicons/cog-outline.svg',
    })
  }
}
