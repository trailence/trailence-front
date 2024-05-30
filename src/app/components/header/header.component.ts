import { Component, Input } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonIcon, IonMenuButton } from '@ionic/angular/standalone';
import { HeaderUserMenuComponent } from '../header-user-menu/header-user-menu.component';
import { AuthService } from 'src/app/services/auth/auth.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonIcon,
    IonMenuButton,
    HeaderUserMenuComponent,
  ]
})
export class HeaderComponent {

  @Input()
  title = '';

  constructor(
    public auth: AuthService,
  ) {}

}
