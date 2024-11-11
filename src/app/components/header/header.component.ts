import { Component, Injector, Input } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonIcon, IonMenuButton, IonButton, IonPopover, IonContent, IonBadge } from '@ionic/angular/standalone';
import { HeaderUserMenuComponent } from '../header-user-menu/header-user-menu.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'src/app/utils/menu-item';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { UpdateService } from 'src/app/services/update/update.service';
import { of } from 'rxjs';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [IonBadge, IonContent, IonPopover, IonButton,
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
export class HeaderComponent extends AbstractComponent {

  @Input() title = '';
  @Input() backUrl?: string;
  @Input() actions?: MenuItem[];

  id = IdGenerator.generateId();

  constructor(
    injector: Injector,
    public auth: AuthService,
    private readonly router: Router,
    public update: UpdateService,
  ) {
    super(injector);
  }

  back(): void {
    this.router.navigateByUrl(this.backUrl!);
  }

  protected override getComponentState() {
    return this.title;
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.byStateAndVisible.subscribe(of(true), () => {
      const title = document.getElementsByTagName('head')[0].getElementsByTagName('title')[0];
      title.innerText = this.title + ' - Trailence';
    }, true);
  }

}
