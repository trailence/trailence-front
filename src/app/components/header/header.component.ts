import { Component, Input } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonIcon, IonMenuButton, IonButton, IonPopover, IonContent } from '@ionic/angular/standalone';
import { HeaderUserMenuComponent } from '../header-user-menu/header-user-menu.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'src/app/utils/menu-item';
import { IdGenerator } from 'src/app/utils/component-utils';
import { MenuContentComponent } from '../menu-content/menu-content.component';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [IonContent, IonPopover, IonButton,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonIcon,
    IonMenuButton,
    HeaderUserMenuComponent,
    CommonModule,
    MenuContentComponent,
  ]
})
export class HeaderComponent {

  @Input() title = '';
  @Input() backUrl?: string;
  @Input() actions?: MenuItem[];

  id = IdGenerator.generateId();

  constructor(
    public auth: AuthService,
    private router: Router,
  ) {}

  back(): void {
    this.router.navigateByUrl(this.backUrl!);
  }

}
