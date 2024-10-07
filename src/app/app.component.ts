import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet, IonContent, IonMenu } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { I18nService } from './services/i18n/i18n.service';
import { TrackService } from './services/database/track.service';
import { TrailService } from './services/database/trail.service';
import { TrailCollectionService } from './services/database/trail-collection.service';
import { TagService } from './services/database/tag.service';
import { AssetsService } from './services/assets/assets.service';
import { MenuComponent } from './components/menu/menu.component';
import { GeolocationService } from './services/geolocation/geolocation.service';
import { ExtensionsService } from './services/database/extensions.service';
import { ShareService } from './services/database/share.service';
import { DatabaseCleanupService } from './services/database/database-cleanup.service';
import { NavigationEnd, Router } from '@angular/router';
import { combineLatest, filter, first } from 'rxjs';
import { AuthService } from './services/auth/auth.service';
import { DatabaseService } from './services/database/database.service';
import { BrowserService } from './services/browser/browser.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [
    IonApp,
    IonMenu,
    IonContent,
    IonRouterOutlet,
    CommonModule,
    MenuComponent,
  ],
})
export class AppComponent {
  constructor(
    public i18n: I18nService,
    public geolocation: GeolocationService,
    router: Router,
    auth: AuthService,
    database: DatabaseService,
    // init browser
    browserService: BrowserService,
    // init assets
    assetsService: AssetsService,
    // depends on services with stores, so they can start synchronizing
    trackService: TrackService,
    trailService: TrailService,
    collectionService: TrailCollectionService,
    tagService: TagService,
    extensionsService: ExtensionsService,
    shareService: ShareService,
    databaseCleanup: DatabaseCleanupService,
  ) {
    combineLatest([
      router.events.pipe(
        filter(e => e instanceof NavigationEnd),
        first(),
      ),
      i18n.texts$.pipe(
        filter(texts => !!texts),
        first(),
      ),
      auth.auth$.pipe(
        filter(a => a !== undefined),
        first(),
      ),
    ]).subscribe(([e, t, a]) => {
      const startup = document.getElementById('startup')!;
      document.getElementById('root')!.style.display = '';
      if (!a)
        this.ready(startup);
      else {
        // authenticated => wait for databases to be open
        combineLatest([auth.auth$, database.allLoaded()]).subscribe(([a, l]) => {
          if (!a || l) this.ready(startup);
        });
      }
    });
  }

  private ready(startup: HTMLElement): void {
    if (!document.documentElement.classList.contains('ion-ce')) {
      setTimeout(() => this.ready(startup), 10);
      return;
    }
    startup.style.opacity = '0';
    setTimeout(() => startup.parentElement?.removeChild(startup), 500);
  }
}
