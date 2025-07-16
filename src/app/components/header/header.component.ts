import { Component, Injector, Input } from '@angular/core';
import { IonHeader, IonToolbar, IonButtons, IonIcon, IonMenuButton, IonButton, IonPopover, IonContent, IonBadge, IonLabel, IonList, IonItem } from '@ionic/angular/standalone';
import { HeaderUserMenuComponent } from '../header-user-menu/header-user-menu.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { AbstractComponent, IdGenerator } from 'src/app/utils/component-utils';
import { MenuContentComponent } from '../menus/menu-content/menu-content.component';
import { UpdateService } from 'src/app/services/update/update.service';
import { of } from 'rxjs';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { publicRoutes } from 'src/app/routes/package.routes';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { LongPressDirective } from 'src/app/utils/long-press.directive';

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss'],
    imports: [IonItem, IonList,
      IonBadge, IonContent, IonPopover, IonButton, IonHeader, IonToolbar, IonButtons, IonIcon, IonLabel, IonMenuButton,
      HeaderUserMenuComponent, MenuContentComponent,
      CommonModule, LongPressDirective,
    ]
})
export class HeaderComponent extends AbstractComponent {

  @Input() title = '';
  @Input() backUrl?: string;
  @Input() actions?: MenuItem[];
  @Input() description?: string;
  @Input() useH1 = false;
  @Input() neverShowTrailenceTitle = false;
  @Input() titleLongPress?: () => void;

  id = IdGenerator.generateId();
  small: boolean;
  publicUrl?: string;
  alwaysTightMenu = false;

  constructor(
    injector: Injector,
    public readonly auth: AuthService,
    private readonly router: Router,
    public readonly update: UpdateService,
    public readonly i18n: I18nService,
    public readonly prefs: PreferencesService,
    public readonly browser: BrowserService,
  ) {
    super(injector);
    this.small = browser.width < 500;
    this.whenAlive.add(browser.resize$.subscribe(s => this.small = s.width < 500));
    if (router.url.startsWith('/fr/') || router.url.startsWith('/en/')) this.publicUrl = this.router.url.substring(4);
  }

  back(): void {
    this.router.navigateByUrl(this.backUrl!);
  }

  titlePress(): void {
    if (this.titleLongPress) this.titleLongPress();
  }

  goTo(url: string): void {
    this.router.navigateByUrl(url);
  }

  home(): void {
    if (publicRoutes.find(r => r.path === 'home'))
      this.goTo('/home');
    else
      this.goTo('/');
  }

  protected override getComponentState() {
    return this.title;
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.byStateAndVisible.subscribe(of(true), () => {
      const head = document.getElementsByTagName('head')[0];
      const title = head.getElementsByTagName('title')[0];
      title.innerText = this.title.length > 0 ? this.title + ' - Trailence' : 'Trailence';
      const desc = document.getElementById('head_meta_description');
      if (desc && this.description) {
        desc.setAttribute('content', this.description);
      }
    }, true);
    this.alwaysTightMenu = this.actions ? this.actions.reduce((p, i) => p + (i.isSeparator() ? 0 : 1), 0) > 10 : false;
  }

}
