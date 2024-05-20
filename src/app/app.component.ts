import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet, IonContent, IonMenu } from '@ionic/angular/standalone';
import { HeaderComponent } from './components/header/header.component';
import { CommonModule } from '@angular/common';
import { I18nService } from './services/i18n/i18n.service';

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
  ) {}
}
