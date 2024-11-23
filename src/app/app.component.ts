import { Component, Injector } from '@angular/core';
import { IonApp, IonRouterOutlet, IonContent, IonMenu } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { I18nService } from './services/i18n/i18n.service';
import { AssetsService } from './services/assets/assets.service';
import { MenuComponent } from './components/menu/menu.component';
import { NavigationEnd, Router } from '@angular/router';
import { combineLatest, filter, first, Observable, tap } from 'rxjs';
import { AuthService } from './services/auth/auth.service';
import { BrowserService } from './services/browser/browser.service';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
    imports: [
        IonApp,
        IonMenu,
        IonContent,
        IonRouterOutlet,
        CommonModule,
        MenuComponent,
    ]
})
export class AppComponent {

  loadMenu = false;
  loadMenuContent = false;
  waitingForGps = false;

  constructor(
    public i18n: I18nService,
    router: Router,
    auth: AuthService,
    private readonly injector: Injector,
    // init browser
    browserService: BrowserService,
    // init assets
    assetsService: AssetsService,
  ) {
    combineLatest([
      router.events.pipe(
        filter(e => e instanceof NavigationEnd),
        first(),
      ),
      i18n.texts$.pipe(
        filter(texts => !!texts),
        first(),
        tap(() => this.loadMenu = true)
      ),
      auth.auth$.pipe(
        filter(a => a !== undefined),
        first(),
      ),
    ]).subscribe(([e, t, a]) => {
      const startup = document.getElementById('startup')!;
      document.getElementById('root')!.style.display = '';
      if (!a) {
        this.ready(startup);
        auth.auth$.pipe(
          filter(a => !!a),
          first(),
        ).subscribe(() => this.loadServices().then(() => {}));
      } else {
        this.loadServices().then(allDatabasesLoaded => {
          combineLatest([auth.auth$, allDatabasesLoaded()]).subscribe(([a, l]) => {
            if (!a || l) this.ready(startup);
          });
        });
      }
      import('./services/geolocation/geolocation.service')
      .then(module => injector.get(module.GeolocationService).waitingForGps$.subscribe(value => this.waitingForGps = value));
    });
  }

  private loadServices(): Promise<() => Observable<boolean>> {
    return Promise.all([
      import('./services/database/database.service'),
      import('./services/database/database-cleanup.service'),
      import('./services/database/share.service'),
      import('./services/database/extensions.service'),
      import('./services/database/tag.service'),
      import('./services/database/trail-collection.service'),
      import('./services/database/trail.service'),
      import('./services/database/track.service'),
    ]).then(services => {
      const database = this.injector.get(services[0].DatabaseService);
      this.injector.get(services[1].DatabaseCleanupService);
      this.injector.get(services[2].ShareService);
      this.injector.get(services[3].ExtensionsService);
      this.injector.get(services[4].TagService);
      this.injector.get(services[5].TrailCollectionService);
      this.injector.get(services[6].TrailService);
      this.injector.get(services[7].TrackService);
      return () => database.allLoaded();
    });
  }

  private ready(startup: HTMLElement): void {
    if (!document.documentElement.classList.contains('ion-ce')) {
      setTimeout(() => this.ready(startup), 10);
      return;
    }
    startup.style.opacity = '0';
    setTimeout(() => startup.parentElement?.removeChild(startup), 500);
    this.loadMenuContent = true;
  }
}
