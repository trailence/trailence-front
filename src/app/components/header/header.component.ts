import { Component, Input } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonIcon, IonMenuButton, IonButton } from '@ionic/angular/standalone';
import { HeaderUserMenuComponent } from '../header-user-menu/header-user-menu.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [IonButton,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonIcon,
    IonMenuButton,
    HeaderUserMenuComponent,
    CommonModule,
  ]
})
export class HeaderComponent {

  @Input() title = '';
  @Input() backUrl?: string;

  constructor(
    public auth: AuthService,
    private router: Router,
  ) {}

  back(): void {
    this.router.navigateByUrl(this.backUrl!);
  }

}
