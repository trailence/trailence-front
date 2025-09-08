import { ChangeDetectorRef, Component, Injector, NgZone, OnInit } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonButton, MenuController, IonBadge, Platform, PopoverController } from "@ionic/angular/standalone";
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { combineLatest, concat, map, of, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Share } from 'src/app/model/share';
import { ShareService } from 'src/app/services/database/share.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { UpdateService } from 'src/app/services/update/update.service';
import { List } from 'immutable';
import { trailenceAppVersionName } from 'src/app/trailence-version';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { MenuContentComponent } from '../menu-content/menu-content.component';
import { PreferencesService } from 'src/app/services/preferences/preferences.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { isPublicationCollection, TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { MyPublicTrail, MyPublicTrailsService } from 'src/app/services/database/my-public-trails.service';
import { MySelectionService } from 'src/app/services/database/my-selection.service';

@Component({
    selector: 'app-menu',
    templateUrl: './menu.component.html',
    styleUrls: ['./menu.component.scss'],
    imports: [
      CommonModule,
      IonBadge, IonButton, IonIcon,
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

  collectionsOpen = true;
  sharedWithMeOpen = true;
  sharedByMeOpen = false;
  publicationsOpen = false;
  moderationOpen = false;

  isAdmin = false;
  isAnonymous = false;
  isModerator = false;
  isNative: boolean;

  isInit = false;

  constructor(
    public readonly i18n: I18nService,
    public readonly collectionService: TrailCollectionService,
    public readonly shareService: ShareService,
    readonly trailService: TrailService,
    private readonly router: Router,
    public readonly menuController: MenuController,
    public readonly traceRecorder: TraceRecorderService,
    readonly authService: AuthService,
    public readonly update: UpdateService,
    public readonly fetchSourceService: FetchSourceService,
    readonly platform: Platform,
    private readonly injector: Injector,
    readonly preferences: PreferencesService,
    readonly myPublicTrailsService: MyPublicTrailsService,
    readonly mySelectionService: MySelectionService,
    readonly changeDetector: ChangeDetectorRef,
    readonly ngZone: NgZone,
  ) {
    const refresh = () => {
      if (!this.isInit) return;
      ngZone.run(() => changeDetector.detectChanges());
    };
    this.isNative = platform.is('capacitor');
    combineLatest([
      authService.auth$,
      collectionService.getAllCollectionsReady$().pipe(
        map(list => collectionService.sort(list)),
      )
    ]).pipe(
      switchMap(([auth, collections]) => {
        const withInfo: CollectionWithInfo[] = collections.map(c => new CollectionWithInfo(c));
        if (collections.length === 0) return of([]);
        return concat(
          of(withInfo),
          trailService.getAllWhenLoaded$().pipe(
            collection$items(t => t.owner === auth?.email),
            map(trails => {
              withInfo.forEach(c => c.nbTrails = 0);
              const allCollectionsWithoutPub = collections.filter(c => !isPublicationCollection(c.type));
              this.allCollectionsTrails = trails.filter(t => allCollectionsWithoutPub.findIndex(c => c.uuid === t.collectionUuid) >= 0).length;
              trails.forEach(t => {
                const c = withInfo.find(i => i.collection.uuid === t.collectionUuid && t.owner === i.collection.owner);
                if (c) c.nbTrails!++;
              })
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
      authService.auth$,
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
                withInfo.forEach(s => s.nbTrails = (result.get(s.share) ?? []).length);
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
    myPublicTrailsService.myPublicTrails$.subscribe(list => {
      this.myPublicTrails = list;
      refresh();
    });
    mySelectionService.getMySelection().subscribe(list => {
      this.mySelectionCount = list.length;
      refresh();
    });
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
    const trace = this.traceRecorder.current;
    if (trace) {
      if (trace.followingTrailUuid) {
        this.goTo('/trail/' + trace.followingTrailOwner! + '/' + trace.followingTrailUuid);
      } else {
        this.goTo('/trail');
      }
    } else {
      this.traceRecorder.start().then(() => this.goTo('/trail'));
    }
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
