import { ChangeDetectorRef, Component, Injector, NgZone, OnInit } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonButton, MenuController, IonBadge, Platform, PopoverController } from "@ionic/angular/standalone";
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { combineLatest, concat, EMPTY, from, map, of, switchMap } from 'rxjs';
import { Router } from '@angular/router';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Share } from 'src/app/model/share';
import { ShareService } from 'src/app/services/database/share.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { List } from 'immutable';
import { trailenceAppVersionName } from 'src/app/trailence-version';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { isPublicationCollection, TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { ChangesDetection } from 'src/app/utils/angular-helpers';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { MenuItem } from '../menu-item';
import { LiveGroupDto } from 'src/app/model/dto/live-group';
import { MyPublicTrail } from 'src/app/model/dto/my-public-trail';
import { ModerationCounters } from 'src/app/model/dto/moderation-counters';
import { AppDownload } from 'src/app/services/update/common';

@Component({
    selector: 'app-menu',
    templateUrl: './menu.component.html',
    styleUrls: ['./menu.component.scss'],
    imports: [
      IonBadge, IonButton, IonIcon, I18nPipe,
    ]
})
export class MenuComponent implements OnInit {

  versionName = trailenceAppVersionName;

  collections: List<CollectionWithInfo> = List();
  sharedWithMe: List<ShareWithInfo> = List();
  sharedByMe: List<ShareWithInfo> = List();
  allCollectionsTrails = 0;
  mySelectionCount = 0;
  pubDraft?: CollectionWithInfo;
  pubSubmit?: CollectionWithInfo;
  pubReject?: CollectionWithInfo;
  myPublicTrails: MyPublicTrail[] = [];
  liveGroups: LiveGroupDto[] = [];
  liveGroupsPaused = false;
  moderationCounters: ModerationCounters | undefined = undefined;
  update?: AppDownload;
  recording = false;

  collectionsOpen = true;
  sharedWithMeOpen = true;
  sharedByMeOpen = false;
  publicationsOpen = false;
  moderationOpen = false;

  isAdmin = false;
  isAnonymous = false;
  isModerator = false;
  email?: string;
  isNative: boolean;

  isInit = false;

  constructor(
    private readonly injector: Injector,
    public readonly i18n: I18nService,
    public readonly collectionService: TrailCollectionService,
    public readonly shareService: ShareService,
    trailService: TrailService,
    private readonly router: Router,
    public readonly menuController: MenuController,
    private readonly authService: AuthService,
    platform: Platform,
    preferences: PreferencesService,
    changeDetector: ChangeDetectorRef,
    ngZone: NgZone,
  ) {
    const changesDetection = new ChangesDetection(ngZone, changeDetector);
    const refresh = () => {
      if (!this.isInit) return;
      changesDetection.detectChanges();
    };
    this.isNative = platform.is('capacitor');
    combineLatest([
      authService.userChanged$,
      collectionService.getAllCollectionsReady$().pipe(
        map(list => collectionService.sort(list)),
      )
    ]).pipe(
      switchMap(([auth, collections]) => {
        this.email = auth?.email;
        const withInfo: CollectionWithInfo[] = collections.map(c => new CollectionWithInfo(c));
        if (collections.length === 0) return of([]);
        return concat(
          of(withInfo),
          trailService.getAllWhenLoaded$().pipe(
            collection$items(),
            map(trails => {
              for (const c of withInfo) c.nbTrails = 0;
              const allCollectionsWithoutPub = collections.filter(c => !isPublicationCollection(c.type));
              this.allCollectionsTrails = trails.filter(t => allCollectionsWithoutPub.some(c => c.uuid === t.collectionUuid && c.getContentOwner() == t.owner)).length;
              for (const t of trails) {
                const c = withInfo.find(i => i.collection.uuid === t.collectionUuid && t.owner === i.collection.getContentOwner());
                if (c) c.nbTrails!++;
              }
              return withInfo;
            })
          )
        );
      }),
      debounceTimeExtended(0, 10),
    )
    .subscribe(list => {
      this.collections = List(list.filter(c => !isPublicationCollection(c.collection.type)));
      this.pubDraft = list.find(c => c.collection.type === TrailCollectionType.PUB_DRAFT);
      this.pubSubmit = list.find(c => c.collection.type === TrailCollectionType.PUB_SUBMIT);
      this.pubReject = list.find(c => c.collection.type === TrailCollectionType.PUB_REJECT);
      refresh();
    });
    combineLatest([
      authService.permissionsChanged$,
      shareService.getAll$().pipe(
        collection$items(),
        map(shares => {
          shares.sort((s1,s2) => s1.name.localeCompare(s2.name, preferences.preferences.lang));
          return shares;
        }),
        switchMap(shares => {
          const withInfo: ShareWithInfo[] = shares.map(s => new ShareWithInfo(s));
          if (shares.length === 0) return of([]);
          return concat(
            of(withInfo),
            shareService.getTrailsByShare(shares).pipe(
              map(result => {
                for (const s of withInfo) s.nbTrails = (result.get(s.share) ?? []).length;
                return withInfo;
              })
            )
          );
        }),
        debounceTimeExtended(0, 10),
      )
    ])
    .subscribe(([auth, shares]) => {
      this.sharedByMe = List(shares.filter(share => share.share.owner === auth?.email));
      this.sharedWithMe = List(shares.filter(share => share.share.owner !== auth?.email));
      this.isAdmin = !!auth?.admin;
      this.isAnonymous = !!auth?.isAnonymous;
      this.isModerator = !!auth?.roles?.find(r => r === 'moderator');
      refresh();
    });
    setTimeout(() => this.deferedInit(refresh), 1000);
  }

  private deferedInit(refresh: () => void): void {
    import('src/app/services/database/my-public-trails.service')
    .then(module => this.injector.get(module.MyPublicTrailsService).myPublicTrails$.subscribe(list => {
      this.myPublicTrails = list;
      refresh();
    }));
    import('src/app/services/database/my-selection.service')
    .then(module => this.injector.get(module.MySelectionService).getMySelection().subscribe(list => {
      this.mySelectionCount = list.length;
      refresh();
    }));
    import('src/app/services/live-group/live-group.service')
    .then(module => {
      const service = this.injector.get(module.LiveGroupService);
      service.groups$.pipe(
        switchMap(groups => groups?.length ? service.paused$.pipe(map(paused => ({groups, paused}))) : of({groups: [], paused: false}))
      ).subscribe(result => {
        this.liveGroups = result.groups;
        this.liveGroupsPaused = result.paused;
        refresh();
      });
    });
    this.authService.permissionsChanged$.pipe(
      switchMap(auth => {
        if (!auth || (!auth.admin && !auth.roles?.includes('moderator'))) return EMPTY;
        return from(import('src/app/services/moderation/moderation.service'));
      }),
      switchMap(module => this.injector.get(module.ModerationService).counters$),
    ).subscribe(counters => {
      this.moderationCounters = counters;
      refresh();
    });
    import('src/app/services/update/update.service')
    .then(module => this.injector.get(module.UpdateService).availableDownload$.subscribe(update => {
      this.update = update;
      refresh();
    }));
    import('src/app/services/trace-recorder/trace-recorder.service')
    .then(module => this.injector.get(module.TraceRecorderService).current$.subscribe(recording => {
      const isRecording = !!recording;
      if (this.recording !== isRecording) {
        this.recording = isRecording;
        refresh();
      }
    }));
  }

  ngOnInit(): void {
    this.isInit = true;
  }

  goTo(url: string): void {
    this.router.navigateByUrl(url);
  }

  goToPublicPage(url: string): void {
    this.goTo('/' + this.injector.get(PreferencesService).preferences.lang + url);
  }

  goToRecordTrace(): void {
    import('src/app/services/trace-recorder/trace-recorder.service')
    .then(module => {
      const service = this.injector.get(module.TraceRecorderService);
      const trace = service.current;
      if (trace) {
        if (trace.followingTrailUuid) {
          this.goTo('/trail/' + trace.followingTrailOwner! + '/' + trace.followingTrailUuid);
        } else {
          this.goTo('/trail');
        }
      } else {
        service.start().then(() => this.goTo('/trail'));
      }
    });
  }

  createLiveGroup(): void {
    import('../../live-group/live-group-popup.component')
    .then(m => m.openCreateLiveGroupPopup(this.injector))
    .then(created => {
      if (created)
        import('src/app/services/live-group/live-group.service')
        .then(module => this.injector.get(module.LiveGroupService).openLiveGroup(created));
    });
    this.close();
  }

  liveGroupMenu($event: MouseEvent): void {
    $event.stopPropagation();
    import('src/app/services/live-group/live-group.service')
    .then(module => {
      const liveGroupService = this.injector.get(module.LiveGroupService);
      const menu: MenuItem[] = [
        new MenuItem().setIcon('pause').setI18nLabel('pages.live_group.pause')
          .setVisible(() => !liveGroupService.paused)
          .setAction(() => liveGroupService.pause()),
        new MenuItem().setIcon('play').setI18nLabel('pages.live_group.resume')
          .setVisible(() => liveGroupService.paused)
          .setAction(() => liveGroupService.resume()),
        new MenuItem(),
        ...this.liveGroups.map(
          group => new MenuItem().setFixedLabel(group.name)
            .setSubLabel([
              this.i18n.texts.pages.live_group.date_from + ' ' + this.i18n.timestampToDateString(group.startedAt) + ' ' +
              this.i18n.texts.pages.live_group.date_to + ' ' + this.i18n.timestampToDateString(group.expiresAt)
            ])
            .setAction(() => { liveGroupService.openLiveGroup(group); this.close(); })
        ),
        new MenuItem().setIcon('add').setI18nLabel('menu.create_live_group').setTextColor('success')
          .setVisible(() => !this.isAnonymous && this.liveGroups.length < 10)
          .setAction(() => this.createLiveGroup()),
      ];
      this.injector.get(PopoverController).create({
        component: MenuContentComponent,
        componentProps: {
          menu,
        },
        event: $event,
        side: 'right',
        dismissOnSelect: true,
        arrow: true,
      }).then(p => p.present());
    });
  }

  openHelp(): void {
    window.open('https://help.trailence.org/' + this.injector.get(PreferencesService).preferences.lang + '/home.html', '_blank');
  }

  async close(trial: number = 1) {
    if (!await this.menuController.close()) {
      console.log('App Menu not closed ! trial ', trial);
      if (trial <= 5)
        setTimeout(() => this.close(trial + 1), 200);
    }
  }

  emailsSplit(emails: string[]): string {
    let s = emails.join(', ');
    if (s.length <= 30) return s;
    s = '';
    for (let i = 0; i < emails.length; ++i) {
      const e = this.emailSplit(emails[i]);
      if (i === 0) s = e;
      else {
        if (s.length + 2 + e.length > 30) {
          const full = emails.slice(0, i).join(', ');
          if (full.length <= s.length || full.length < 28) s = full;
          s += ' +' + (emails.length - i);
          return s;
        }
        s += ', ' + e;
      }
    }
    return s;
  }

  private emailSplit(email: string): string {
    const i = email.indexOf('@');
    let part1 = i >= 0 ? email.substring(0, i) : email;
    let part2 = i >= 0 ? email.substring(i + 1) : '';
    if (part1.length > 12) part1 = part1.substring(0, 9) + '...';
    if (part2.length > 12) part2 = part2.substring(0, 9) + '...';
    return part1 + '@' + part2;
  }

  openCollectionMenu($event: MouseEvent, collection: TrailCollection) {
    $event.stopPropagation();
    const menu = this.collectionService.getCollectionMenu(collection);
    this.injector.get(PopoverController).create({
      component: MenuContentComponent,
      componentProps: {
        menu,
      },
      event: $event,
      side: 'right',
      dismissOnSelect: true,
      arrow: true,
    }).then(p => p.present());
  }

  openShareMenu($event: MouseEvent, share: Share) {
    $event.stopPropagation();
    const menu = this.shareService.getShareMenu(share);
    this.injector.get(PopoverController).create({
      component: MenuContentComponent,
      componentProps: {
        menu,
      },
      event: $event,
      side: 'right',
      dismissOnSelect: true,
      arrow: true,
    }).then(p => p.present());
  }

  debugLastClick = 0;
  debugClickCount = 0;
  debug(): void {
    const now = Date.now();
    if (now - this.debugLastClick < 2000) {
      if (++this.debugClickCount >= 10) {
        this.debugClickCount = 0;
        import('src/app/services/debug/debug.service')
        .then(module => this.injector.get(module.DebugService).openPopup());
      }
    }
    this.debugLastClick = now;
  }

}

class CollectionWithInfo {

  constructor(
    public collection: TrailCollection,
    public nbTrails: number | undefined = undefined
  ) {}

}

class ShareWithInfo {

  constructor(
    public share: Share,
    public nbTrails: number | undefined = undefined
  ) {}

}
