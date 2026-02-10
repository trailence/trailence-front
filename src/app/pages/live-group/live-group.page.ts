import { AsyncPipe } from '@angular/common';
import { Component, Injector, Input, ViewChild } from '@angular/core';
import { BehaviorSubject, combineLatest, of } from 'rxjs';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { LiveGroupComponent } from 'src/app/components/live-group/live-group.component';
import { MapComponent } from 'src/app/components/map/map.component';
import { MapTrack } from 'src/app/components/map/track/map-track';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { LiveGroupDto, LiveGroupService } from 'src/app/services/live-group/live-group.service';
import { NetworkService } from 'src/app/services/network/network.service';
import { AbstractPage } from 'src/app/utils/component-utils';
import { IonInput, IonCard, IonCardContent, IonToolbar, IonLabel, IonButton, IonSpinner } from '@ionic/angular/standalone';
import { LAST_NAME_STORAGE_KEY_PREFIX } from '../../components/live-group/live-group-popup.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ErrorService } from 'src/app/services/progress/error.service';
import { defaultAuthRoute, defaultPublicRoute } from 'src/app/routes/package.routes';
import { Console } from 'src/app/utils/console';

@Component({
  templateUrl: './live-group.page.html',
  styleUrl: './live-group.page.scss',
  imports: [
    HeaderComponent,
    LiveGroupComponent,
    MapComponent,
    AsyncPipe,
    FormsModule,
    IonInput, IonCard, IonCardContent, IonToolbar, IonLabel, IonButton, IonSpinner,
  ]
})
export class LiveGroupPage extends AbstractPage {

  @Input() path1?: string;
  @Input() path2?: string;

  group?: LiveGroupDto;
  orientation: 'horizontal' | 'vertical' = 'horizontal';

  menu: MenuItem[] = [];
  mapTracks = of([] as MapTrack[]);

  joining = false;
  groupsLoaded = false;
  myName = '';

  @ViewChild('map') set map(value: MapComponent | undefined) {
    this.mapComponent$.next(value);
  }

  mapComponent$ = new BehaviorSubject<MapComponent | undefined>(undefined);

  constructor(
    public readonly i18n: I18nService,
    private readonly liveGroupService: LiveGroupService,
    public readonly network: NetworkService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly errorService: ErrorService,
    browser: BrowserService,
    injector: Injector,
  ) {
    super(injector);
    this.updateSize(browser.size$.value);
    this.whenAlive.add(browser.resize$.subscribe(size => this.updateSize(size)));
  }

  private updateSize(size: {width: number, height: number}): void {
    const newOrientation = size.width < 800 && size.height > 500 ? 'vertical' : 'horizontal';
    if (newOrientation === this.orientation) return;
    this.orientation = newOrientation;
    this.changesDetection.detectChanges();
  }

  protected override getComponentState(): any {
    return {
      path1: this.path1,
      path2: this.path2,
    };
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    this.group = undefined;
    this.joining = false;
    this.groupsLoaded = false;
    if (!this.path1 || (this.path1 === 'join' && !this.path2)) return;
    this.byStateAndVisible.subscribe(
      combineLatest([
        this.liveGroupService.groups$,
        this.network.server$,
      ]),
      ([groups, networkAvailable]) => {
        if (groups === undefined) {
          // groups not yet loaded
          return;
        }
        if (this.path1 === 'join') {
          const group = groups.find(g => g.slug === this.path2);
          if (group) this.liveGroupService.openLiveGroup(group);
          else this.groupsLoaded = true;
        } else {
          this.group = groups.find(g => g.slug === this.path1);
          if (!this.group) {
            Console.warn('Live group not found, redirecting to default page', this.path1, groups);
            this.router.navigateByUrl(this.authService.auth ? defaultAuthRoute : defaultPublicRoute);
          }
          else if (this.group.trailOwner && this.group.trailUuid)
            this.liveGroupService.openLiveGroup(this.group); // go to trail page
          else
            this.groupsLoaded = true;
        }
        this.changesDetection.detectChanges();
      }
    );
    const lastName = localStorage.getItem(LAST_NAME_STORAGE_KEY_PREFIX + this.authService.email);
    if (lastName) this.myName = lastName;
  }

  titleLongPress = () => this.edit();

  private edit(): void {
    import('../../components/live-group/live-group-popup.component')
    .then(m => {
      if (!this.group) return;
      return m.openEditLiveGroupPopup(this.injector, this.group, undefined, undefined);
    });
  }

  canJoin(): boolean {
    return this.myName.length > 0 && this.myName.length <= 25;
  }

  join(): void {
    if (!this.canJoin()) return;
    this.joining = true;
    this.liveGroupService.joinGroup(this.path2!, this.myName).subscribe({
      next: group => {
        this.router.navigateByUrl('/live-group/' + group.slug);
        this.joining = false;
      },
      error: e => {
        this.joining = false;
        this.errorService.addNetworkError(e, 'pages.live_group.joining_error', []);
      }
    });
  }
}
