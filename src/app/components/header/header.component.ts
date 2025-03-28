import { Component, Injector, Input } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonIcon, IonMenuButton, IonButton, IonPopover, IonContent, IonBadge, IonLabel } from '@ionic/angular/standalone';
import { HeaderUserMenuComponent } from '../header-user-menu/header-user-menu.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'src/app/utils/menu-item';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { UpdateService } from 'src/app/services/update/update.service';
import { of } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss'],
    imports: [
      IonBadge, IonContent, IonPopover, IonButton, IonHeader, IonToolbar, IonButtons, IonIcon, IonLabel, IonMenuButton,
      HeaderUserMenuComponent, MenuContentComponent,
      CommonModule,
    ]
})
export class HeaderComponent extends AbstractComponent {

  @Input() title = '';
  @Input() backUrl?: string;
  @Input() actions?: MenuItem[];
  @Input() icon?: string;
  @Input() iconClass?: string;

  id = IdGenerator.generateId();

  constructor(
    injector: Injector,
    public readonly auth: AuthService,
    private readonly router: Router,
    public readonly update: UpdateService,
    public readonly i18n: I18nService,
  ) {
    super(injector);
  }

  back(): void {
    this.router.navigateByUrl(this.backUrl!);
  }

  goTo(url: string): void {
    this.router.navigateByUrl(url);
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
