import { ChangeDetectorRef, Component, Injector } from '@angular/core';
import { IonApp, IonRouterOutlet, IonContent, IonMenu } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { I18nService } from './services/i18n/i18n.service';
import { AssetsService } from './services/assets/assets.service';
import { MenuComponent } from './components/menus/global-menu/menu.component';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, filter, first, from, map, Observable, of, switchMap, tap, timeout } from 'rxjs';
import { AuthService } from './services/auth/auth.service';
import { BrowserService } from './services/browser/browser.service';
import { Console } from './utils/console';
import { PlatformService } from './services/platform/platform.service';
import { NetworkService } from './services/network/network.service';
import { filterDefined } from './utils/rxjs/filter-defined';
import { QuotaService } from './services/auth/quota.service';

Console.info('App loading: main component loaded ', Date.now() - ((window as any)._trailenceStart || 0));

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
        RouterLink,
    ]
})
export class AppComponent {

  loadMenu = false;
  loadMenuContent = false;
  waitingForGps = false;
  traceInProgress?: string;

  i18nLoaded = false;
  waitingForGpsText = '';
  traceInProgressText = '';
  private readonly _ready$ = new BehaviorSubject<boolean>(false);

  constructor(
    private readonly injector: Injector,
  ) {
    Console.info('App loading: main component init ', Date.now() - ((window as any)._trailenceStart || 0));
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
    Console.info('App loading: main services init ', Date.now() - ((window as any)._trailenceStart || 0));

    combineLatest([
      injector.get(Router).events.pipe(
        filter(e => e instanceof NavigationEnd),
        first(),
        switchMap(e => {
          Console.info('App loading: first navigation done ', Date.now() - ((window as any)._trailenceStart || 0));
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
          this.traceInProgressText = texts.menu.current_trace;
        }),
        first(),
      ),
    ]).subscribe(([a, t]) => {
      Console.info('App loading: auth and i18n loaded ', Date.now() - ((window as any)._trailenceStart || 0));
      const startup = document.getElementById('startup')!;
      startup.style.opacity = '0.75';
      document.getElementById('root')!.style.display = '';
      if (!a) {
        this.ready(startup);
        auth.auth$.pipe(
          filterDefined(),
          first(),
        ).subscribe(() => {
          this.loadMenu = true;
          this.loadServices().then(() => {});
        });
        setTimeout(() => this.loadServices(), 1000);
      } else {
        this.loadMenu = true;
        combineLatest([
          auth.auth$,
          from(this.loadServices()).pipe(
            timeout(10000),
            switchMap(allDatabasesLoaded => allDatabasesLoaded()),
            catchError(e => {
              Console.error('Error loading services', e);
              return of(true);
            })
          )
        ]).pipe(
          filter(([a, l]) => !a || l),
          first(),
        )
        .subscribe(() => this.ready(startup));
      }
      import('./services/geolocation/geolocation.service')
      .then(module => injector.get(module.GeolocationService).waitingForGps$.subscribe(value => {
        this.waitingForGps = value;
        this.injector.get(ChangeDetectorRef).detectChanges();
      }));
    });
    i18n.texts$.subscribe(texts => {
      this.waitingForGpsText = texts?.waiting_for_gps ?? '';
      this.traceInProgressText = texts?.menu.current_trace ?? '';
    });
    combineLatest([
      this.injector.get(Router).events.pipe(
        filter(e => e instanceof NavigationEnd),
        map(e => e.url)
      ),
      this._ready$.pipe(
        filter(loaded => loaded),
        switchMap(() => from(import('./services/trace-recorder/trace-recorder.service').then(s => this.injector.get(s.TraceRecorderService)))),
        switchMap(t => t.current$)
      ),
    ]).subscribe(([url, trace]) => {
      const newValue = trace ?
        (trace.followingTrailUuid ?
          (!url.startsWith('/trail/' + trace.followingTrailOwner! + '/' + trace.followingTrailUuid) ? '/trail/' + trace.followingTrailOwner! + '/' + trace.followingTrailUuid : undefined)
          : (url !== '/trail' ? '/trail' : undefined)
        ) : undefined;
      if (newValue !== this.traceInProgress) {
        this.traceInProgress = newValue;
        this.injector.get(ChangeDetectorRef).detectChanges();
      }
    });

  }

  private loadServices(): Promise<() => Observable<boolean>> {
    return Promise.all([
      import('./services/database/database.service'),
      import('./services/database/trail-collection.service'),
      import('./services/database/share.service'),
      import('./services/database/trail.service'),
      import('./services/database/tag.service'),
      import('./services/database/track.service'),
    ]).then(services => {
      const database = this.injector.get(services[0].DatabaseService);
      this.injector.get(services[1].TrailCollectionService);
      this.injector.get(services[2].ShareService);
      this.injector.get(services[3].TrailService);
      this.injector.get(services[4].TagService);
      const trackService = this.injector.get(services[5].TrackService);
      return () => database.storesLoaded(['trail_collections', 'shares', 'trails', 'tags', 'trail_tags']).pipe(
        switchMap(loaded => loaded ? trackService.dbReady$() : of(false)),
        tap(loaded => {
          if (!this._ready$.value && loaded) this._ready$.next(true);
        })
      );
    });
  }

  private ready(startup: HTMLElement): void {
    if (!document.documentElement.classList.contains('ion-ce')) {
      setTimeout(() => this.ready(startup), 10);
      return;
    }
    Console.info('-- Starting app: ready in ' + (Date.now() - (window as any)._trailenceStart) + 'ms. --------------------------------');
    const startupContent = document.getElementById('startup-content');
    startupContent?.parentElement?.removeChild(startupContent);
    startup.style.opacity = '0';
    setTimeout(() => startup.parentElement?.removeChild(startup), 500);
    this.loadMenuContent = true;
  }
}
