import { Component, ElementRef, Injector } from '@angular/core';
import { IonRouterOutlet, NavController } from '@ionic/angular/standalone';
import { AbstractPage } from '../utils/component-utils';
import { ActivatedRoute, Router } from '@angular/router';
import { PreferencesService } from '../services/preferences/preferences.service';

@Component({
  template: `<ion-router-outlet></ion-router-outlet>`,
  imports: [IonRouterOutlet]
})
export class PublicPageRoute extends AbstractPage {

  override ionViewWillEnter(): void {
    if (this.visible) this._propagateVisible(true);
    else super.ionViewWillEnter();
  }

  protected override _propagateVisible(visible: boolean): void {
    if (!visible) {
      super._propagateVisible(false);
      return;
    }
    const outlet = this.injector.get(ElementRef).nativeElement.children.item(0)!;
    const pages = outlet.children;
    for (let i = 0; i < pages.length; ++i) {
      const page = pages.item(i);
      if (page._abstractComponent && !page.classList.contains('hidden')) {
        if (page._abstractComponent.visible)
          page._abstractComponent.setVisible(false);
        page._abstractComponent.setVisible(true);
      }
    }
  }

}

@Component({
  template: '',
})
export class PublicPageWithoutLang {

  constructor(
    private readonly prefs: PreferencesService,
    private readonly navController: NavController,
    private readonly router: Router,
  ) {}

  ionViewWillEnter(): void {
    this.navController.navigateRoot('/' + this.prefs.preferences.lang + this.router.url);
  }

}

export abstract class PublicPage extends AbstractPage {

  constructor(
    injector: Injector,
  ) {
    super(injector);
    this.visible$.subscribe(visible => {
      if (visible) {
        const lang = this.injector.get(ActivatedRoute).snapshot.parent?.routeConfig?.path;
        if (lang) this.injector.get(PreferencesService).setLanguage(lang);
      }
    });
  }

}
