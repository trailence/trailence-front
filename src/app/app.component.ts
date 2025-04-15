import { ChangeDetectorRef, Component, Injector } from '@angular/core';
import { IonApp, IonRouterOutlet, IonContent, IonMenu } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { I18nService } from './services/i18n/i18n.service';
import { AssetsService } from './services/assets/assets.service';
import { MenuComponent } from './components/menu/menu.component';
import { NavigationEnd, Router } from '@angular/router';
import { combineLatest, filter, first, Observable, of, switchMap, tap } from 'rxjs';
import { AuthService } from './services/auth/auth.service';
import { BrowserService } from './services/browser/browser.service';
import { Console } from './utils/console';
import { PlatformService } from './services/platform/platform.service';
import { NetworkService } from './services/network/network.service';
import { filterDefined } from './utils/rxjs/filter-defined';
import { QuotaService } from './services/auth/quota.service';

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

  i18nLoaded = false;
  waitingForGpsText = '';

  constructor(
    private readonly injector: Injector,
  ) {
    // start network service as soon as possible
    injector.get(NetworkService);
    // then I18nService
    const i18n = injector.get(I18nService);
    // init browser
    injector.get(BrowserService);
    // init assets
    injector.get(AssetsService);
    // init platform specificities
    injector.get(PlatformService);
    // init auth and quotas
    const auth = injector.get(AuthService);
    injector.get(QuotaService);

    combineLatest([
      injector.get(Router).events.pipe(
        filter(e => e instanceof NavigationEnd),
        first(),
        switchMap(e => {
          if (e.url.startsWith('/link/')) return of(null);
          return auth.auth$.pipe(
            filter(a => a !== undefined),
            first(),
          );
        })
      ),
      i18n.texts$.pipe(
        filter(texts => !!texts),
        tap(texts => {
          this.i18nLoaded = true;
          this.waitingForGpsText = texts.waiting_for_gps;
        }),
        first(),
      ),
    ]).subscribe(([a, t]) => {
      this.loadMenu = true;
      const startup = document.getElementById('startup')!;
      document.getElementById('root')!.style.display = '';
      if (!a) {
        this.ready(startup);
        auth.auth$.pipe(
          filterDefined(),
          first(),
        ).subscribe(() => this.loadServices().then(() => {}));
        setTimeout(() => this.loadServices(), 1000);
      } else {
        this.loadServices().then(allDatabasesLoaded => {
          combineLatest([auth.auth$, allDatabasesLoaded()]).pipe(
            filter(([a, l]) => !a || l),
            first(),
          )
          .subscribe(() => this.ready(startup));
        });
      }
      import('./services/geolocation/geolocation.service')
      .then(module => injector.get(module.GeolocationService).waitingForGps$.subscribe(value => {
        this.waitingForGps = value;
        this.injector.get(ChangeDetectorRef).detectChanges();
      }));
    });
    i18n.texts$.subscribe(texts => this.waitingForGpsText = texts?.waiting_for_gps);
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
      import('./services/database/dependencies.service'),
    ]).then(services => {
      const database = this.injector.get(services[0].DatabaseService);
      this.injector.get(services[1].DatabaseCleanupService);
      this.injector.get(services[2].ShareService);
      this.injector.get(services[3].ExtensionsService);
      this.injector.get(services[4].TagService);
      this.injector.get(services[5].TrailCollectionService);
      this.injector.get(services[6].TrailService);
      this.injector.get(services[7].TrackService);
      this.injector.get(services[8].DependenciesService);
      return () => database.allLoaded();
    });
  }

  private ready(startup: HTMLElement): void {
    if (!document.documentElement.classList.contains('ion-ce')) {
      setTimeout(() => this.ready(startup), 10);
      return;
    }
    Console.info('Starting app: ready in ' + (Date.now() - (window as any)._trailenceStart) + 'ms.');
    const startupContent = document.getElementById('startup-content');
    startupContent?.parentElement?.removeChild(startupContent);
    startup.style.opacity = '0';
    setTimeout(() => startup.parentElement?.removeChild(startup), 500);
    this.loadMenuContent = true;
  }
}
