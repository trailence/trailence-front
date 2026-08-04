import { AfterContentChecked, Component, ElementRef, Injector } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { Platform } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/services/auth/auth.service';
import { PublicPage } from '../public.page';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { Router } from '@angular/router';
import { filter, first, firstValueFrom } from 'rxjs';
import { HttpService } from 'src/app/services/http/http.service';
import { TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { Trail } from 'src/app/model/trail';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { TrailOverviewComponent } from 'src/app/components/trail-overview/trail-overview.component';
import { NetworkService } from 'src/app/services/network/network.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  imports: [
    HeaderComponent,
    TrailOverviewComponent,
  ]
})
export class HomePage extends PublicPage implements AfterContentChecked {

  ssUrl = environment.assetsUrl + '/home-ss/ss.3';
  year = new Date().getFullYear();

  isAndroidApp: boolean;

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
    public readonly auth: AuthService,
    public readonly preferences: PreferencesService,
    public readonly router: Router,
    private readonly element: ElementRef<HTMLElement>,
    platform: Platform,
  ) {
    super(injector);
    this.isAndroidApp = platform.is('capacitor');
  }

  private readonly io = new IntersectionObserver(es => {
    es.forEach(e => {
      if(e.isIntersecting){
        e.target.classList.add('in');
        this.io.unobserve(e.target);
      }
    });
  }, {threshold:.14});

  ngAfterContentChecked(): void {
    this.ngZone.runOutsideAngular(() => setTimeout(() => {
      this.element.nativeElement.querySelectorAll('.reveal').forEach(el => this.io.observe(el));
    }, 0));
  }

  protected override initComponent(): void {
    this.injector.get(NetworkService).server$.pipe(
      filter(connected => !!connected && !this.examples),
    ).subscribe(() => this.showExamples());
  }

  exampleConfig = {
    mergeDurationAndEstimated: true,
    showBreaksDuration: false,
    showHighestAndLowestAltitude: true,
    allowSmallOnOneLine: true,
    mayHave2Values: false,
    alwaysShowElevation: true,
    showSpeed: false,
  };

  examples?: TrailWithInfo[];
  private async showExamples() {
    const fetchSource = await import('../../services/fetch-source/fetch-source.service').then(m => this.injector.get(m.FetchSourceService));
    const trailence = await firstValueFrom(fetchSource.getTrailence$().pipe(first(p => !!p)));
    const http = this.injector.get(HttpService);
    const uuids = await firstValueFrom(http.get<string[]>(environment.apiBaseUrl + '/public/trails/v1/examples?nb=3'));
    const trails = await trailence.getTrails(uuids);
    const tracks = await trailence.getMetadataList(trails.map(t => t.currentTrackUuid));
    const result: TrailWithInfo[] = [];
    for (const trail of trails) {
      const track = tracks.find(t => t.uuid === trail.currentTrackUuid);
      if (!track) continue;
      const info = await trailence.getInfo(trail.uuid);
      if (!info) continue;
      result.push({trail, track, info});
    }
    result.sort((t1, t2) => {
      const p1 = t1.info.photos?.length ?? 0;
      const p2 = t2.info.photos?.length ?? 0;
      if (p1 > p2) return -1;
      if (p2 > p1) return 1;
      return -1;
    });
    this.examples = result;
  }

  langUpToDown(): string {
    switch (this.preferences.preferences.lang) {
      case 'pt': return 'br.';
      case 'es': return '';
      default: return this.preferences.preferences.lang + '.';
    }
  }

}

interface TrailWithInfo {
  trail: Trail;
  track: TrackMetadataSnapshot;
  info: TrailInfo;
}
