import { Component, Injector, Input, ViewChild } from '@angular/core';
import { AbstractPage } from 'src/app/utils/component-utils';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { BehaviorSubject, EMPTY, map, of, switchMap, combineLatest, Observable, debounceTime, from, concat } from 'rxjs';
import { Router } from '@angular/router';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
import { TrailsAndMapComponent } from 'src/app/components/trails-and-map/trails-and-map.component';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { collection$items$ } from 'src/app/utils/rxjs/collection$items';
import { ShareService } from 'src/app/services/database/share.service';
import { Share } from 'src/app/model/share';
import { List } from 'immutable';
import { Console } from 'src/app/utils/console';
import { NetworkService } from 'src/app/services/network/network.service';
import { AuthResponse } from 'src/app/services/auth/auth-response';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { NavController } from '@ionic/angular/standalone';
import { MyPublicTrailsService } from 'src/app/services/database/my-public-trails.service';
import { MySelectionService } from 'src/app/services/database/my-selection.service';
import { Filters } from 'src/app/components/trails-list/filters';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { isPublicationCollection, TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { AsyncPipe } from '@angular/common';
import { HttpService } from 'src/app/services/http/http.service';
import { environment } from 'src/environments/environment';
import { Arrays } from 'src/app/utils/arrays';
import { UserProfile } from 'src/app/services/contribution/contribution.service';
import { ObjectUtils } from 'src/app/utils/object-utils';
import { AvatarComponent } from 'src/app/components/avatar/avatar.component';
import { ContributionsBadgesComponent } from 'src/app/components/contributions-badges/contribution-badges.component';
import { SearchTrailsService } from 'src/app/services/search-trails/search-trails.service';
import { MapBubble } from 'src/app/components/map/bubble/map-bubble';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { TranslatedString } from 'src/app/services/i18n/i18n-string';

@Component({
  selector: 'app-trails-page',
  templateUrl: './trails.page.html',
  styleUrls: ['./trails.page.scss'],
  imports: [
    HeaderComponent,
    TrailsAndMapComponent,
    AsyncPipe,
    AvatarComponent,
    ContributionsBadgesComponent,
  ]
})
export class TrailsPage extends AbstractPage {

  @Input() trailsType?: string;
  @Input() trailsId?: string;
  @Input() trailsFrom?: string;

  title = '';
  title2?: string;
  trails$ = new BehaviorSubject<List<Observable<Trail | null>> | undefined>(undefined);
  bubbles$ = new BehaviorSubject<MapBubble[]>([]);
  actions: MenuItem[] = [];
  message?: string;
  loading = true;

  viewId?: string;
  titleLongPressEvent?: () => void;

  userProfile?: UserProfile;

  connected$: Observable<boolean>;

  listToolbar?: MenuItem[];
  readonly mapTopToolbar$ = new BehaviorSubject<MenuItem[]>([]);

  private readonly _trailsAndMap$ = new BehaviorSubject<TrailsAndMapComponent | undefined>(undefined);
  @ViewChild('trailsAndMap', { read: TrailsAndMapComponent }) set trailsAndMap(v: TrailsAndMapComponent | undefined) { this._trailsAndMap$.next(v); }
  get trailsAndMap() { return this._trailsAndMap$.value; }

  private readonly filters$: Observable<Filters | undefined>;

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
    readonly networkService: NetworkService,
    public readonly mapLayerService: MapLayersService,
  ) {
    super(injector);
    this.connected$ = combineLatest([networkService.internet$, networkService.server$]).pipe(map(([i,s]) => i && !!s));
    this.filters$ = this._trailsAndMap$.pipe(
      switchMap(tm => tm ? tm.trailsList$ : of(undefined)),
      switchMap(tl => tl ? tl.filters$ : of(undefined)),
    );
  }

  protected override getComponentState() {
    return {
      type: this.trailsType,
      id: this.trailsId,
      from: this.trailsFrom
    }
  }

  protected override onComponentStateChanged(previousState: any, newState: any): void {
    if (newState.type === 'collection' && newState.id === 'my_trails') {
      this.byStateAndVisible.subscribe(this.injector.get(TrailCollectionService).getMyTrails$(),
        myTrails => this.ngZone.run(() => this.injector.get(NavController).navigateRoot('/trails/collection/' + myTrails.uuid))
      );
      return;
    }
    this.reset();
    if (!newState.type) return;
    switch (newState.type) {
      case 'collection': this.initCollection(newState.id); break;
      case 'share': this.initShare(newState.id, newState.from); break;
      case 'search': this.initSearch(); break;
      case 'all-collections': this.initAllCollections(); break;
      case 'moderation': this.initModeration(); break;
      case 'my-publications': this.initMyPublications(); break;
      case 'my-selection': this.initMySelection(); break;
      case 'user-public': this.initUserPublic(newState.id); break;
      default: this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
    }
  }

  protected override destroyComponent(): void {
    this.reset();
  }

  private initView(id: string): void {
    this.viewId = id;
  }

  private initCollection(collectionUuid: string): void {
    let collectionActions: MenuItem[] = [];
    let trailsActions: MenuItem[] = [];
    // title is collection name, or default
    this.byState.add(
      combineLatest([
        this.injector.get(AuthService).userChanged$.pipe(
          filterDefined(),
          switchMap(auth => this.injector.get(TrailCollectionService).getCollection$(collectionUuid, auth.email)),
          switchMap(collection => {
            if (!collection) return this.onItemEmpty<{title: string, collection: TrailCollection}>(
              () => this.injector.get(TrailCollectionService).storeLoadedAndServerUpdates$(),
              auth => this.injector.get(TrailCollectionService).getCollection$(collectionUuid, auth.email)
            );
            this.initView('collection-' + collection.uuid + '-' + collection.owner);
            // menu
            collectionActions = this.injector.get(TrailCollectionService).getCollectionMenu(collection);
            this.actions = [...collectionActions, ...trailsActions];
            this.titleLongPressEvent = () => {
              this.injector.get(TrailCollectionService).collectionPopup(collection, false);
            };
            return this.injector.get(TrailCollectionService).getTrailCollectionName$(collection)
              .pipe(map(name => ({title: name, collection})));
          })
        ),
        this.i18n.texts$,
      ])
      .subscribe(([result, texts]) => {
        this.title = result.title;
        if (isPublicationCollection(result.collection.type))
          this.title2 = texts.menu.my_publications;
        else if (result.collection.type === TrailCollectionType.SHARED)
          this.title2 = result.collection.sharedWith !== undefined ?
            texts.pages.trails.shared_collection :
            (result.collection.sharedBy ?
              new TranslatedString('pages.trails.shared_collection_by', [result.collection.sharedBy]).translate(this.i18n) :
              texts.pages.trails.collection);
        else
          this.title2 = texts.pages.trails.collection;
        this.changesDetection.detectChanges();
      })
    );
    // trails from collection
    let first = true;
    this.byStateAndVisible.subscribe(
      this.injector.get(AuthService).userChanged$.pipe(
        switchMap(auth => {
          if (!auth) return EMPTY;
          return combineLatest([
            this.injector.get(TrailCollectionService).getCollection$(collectionUuid, auth.email).pipe(filterDefined()),
            this.injector.get(TrailService).getAllWhenLoaded$().pipe(collection$items$()),
          ]);
        }),
      ),
      ([collection, allTrails]) => {
        const trails = allTrails.filter(t => t.item.collectionUuid === collection.uuid && t.item.owner === collection.getContentOwner());
        const newList = List(trails.map(t => t.item$));
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
          this.loading = false;
          const index = this.actions.findIndex(a => a.isSeparator());
          if (index > 0) this.actions.splice(index, this.actions.length - index);
          const actions = this.injector.get(TrailMenuService).getTrailsMenu(trails.map(t => t.item), false, collection, true);
          if (actions.length > 0)
            actions.splice(0, 0, new MenuItem());
          trailsActions = actions;
          this.actions = [...collectionActions, ...trailsActions];
          this.ngZone.run(() => this.trails$.next(newList));
        }
      }
    );
  }

  private initAllCollections(): void {
    this.initView('all-collections');
    this.actions = [];
    // title
    this.byState.add(this.i18n.texts$.pipe(map(texts => texts.all_collections)).subscribe(title => {
      this.title = title;
      this.changesDetection.detectChanges();
    }));
    // trails
    let first = true;
    this.byStateAndVisible.subscribe(
      combineLatest([
        this.injector.get(TrailService).getAllWhenLoaded$().pipe(collection$items$()),
        this.injector.get(TrailCollectionService).getAllCollectionsReady$(),
      ]),
      ([allTrails, collections]) => {
        const owner = this.injector.get(AuthService).email!;
        const ownedCollectionsWithoutPub = collections.filter(c => !isPublicationCollection(c.type) && c.type !== TrailCollectionType.SHARED);
        const sharedCollectionsOwners = collections.filter(c => c.type === TrailCollectionType.SHARED).map(c => c.getContentOwner());
        const newList = List(
          allTrails
          .filter(t => (t.item.owner === owner && ownedCollectionsWithoutPub.some(col => col.uuid === t.item.collectionUuid)) || sharedCollectionsOwners.includes(t.item.owner))
          .map(t => t.item$)
        );
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
          this.loading = false;
          this.ngZone.run(() => this.trails$.next(newList));
        }
      }
    );
  }

  private initMySelection(): void {
    this.initView('my-selection');
    this.actions = [];
    // title
    this.byState.add(this.i18n.texts$.pipe(map(texts => texts.my_selection)).subscribe(title => {
      this.title = title;
      this.changesDetection.detectChanges();
    }));
    // trails
    let first = true;
    this.byStateAndVisible.subscribe(
      this.injector.get(MySelectionService).getMySelection()
      .pipe(
        map(selection => {
          this.message = undefined;
          let nbMissing = 0;
          const trails$: Observable<Trail | null>[] = [];
          for (const selectedTrail of selection) {
            let trail$ = this.injector.get(TrailService).getTrail$(selectedTrail.uuid, selectedTrail.owner);
            if (!selectedTrail.owner.includes('@')) {
              let isMissing = false;
              trail$ = trail$.pipe(
                map(trail => {
                  if (!trail && !this.networkService.internet) {
                    if (!isMissing) {
                      isMissing = true;
                      nbMissing++;
                    }
                    this.message = 'pages.trails.missing_trails_because_offline';
                  } else if (isMissing) {
                    isMissing = false;
                    if (--nbMissing === 0) this.message = undefined;
                  }
                  return trail;
                })
              );
            }
            trails$.push(trail$);
          }
          return trails$;
        }),
      ),
      trails => {
        const newList = List(trails);
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
          this.loading = false;
          this.ngZone.run(() => this.trails$.next(newList));
        }
      }
    );
  }

  private initUserPublic(userId: string): void {
    this.initView('user-public-' + userId);
    this.actions = [];
    this.title = '';
    let current: Trail[] | undefined = undefined;
    this.byStateAndVisible.subscribe(
      this.injector.get(HttpService).get<{ids: string[], alias?: string, avatar?: string, nbPublications?: number, nbComments?: number, nbRates?: number}>(environment.apiBaseUrl + '/public/trails/v1/user/' + userId)
      .pipe(
        switchMap(user => {
          const trails$ = user.ids.length === 0 ? of([]) : this.injector.get(FetchSourceService).getTrailence$().pipe(switchMap(trailence => from(trailence.getTrails(user.ids))));
          return trails$.pipe(map(trails => ({
            trails,
            userProfile: {
              alias: user.alias || undefined,
              avatar: user.avatar || undefined,
              nbPublications: user.nbPublications || 0,
              nbComments: user.nbComments || 0,
              nbRates: user.nbRates || 0,
            } as UserProfile
          })))
        }),
      ),
      result => {
        if (current === undefined || !Arrays.sameContent(current, result.trails)) {
          current = result.trails;
          this.loading = false;
          this.ngZone.run(() => this.trails$.next(List(result.trails.map(t => of(t)))));
          this.changesDetection.detectChanges();
        }
        const title = result.userProfile.alias || this.i18n.texts.pages.preferences.anonymous;
        if (this.title !== title) {
          this.title = title;
          this.changesDetection.detectChanges();
        }
        if (!ObjectUtils.sameContent(this.userProfile, result.userProfile)) {
          this.userProfile = result.userProfile;
          this.changesDetection.detectChanges();
        }
      }
    );
  }

  private initShare(shareId: string, sharedBy: string): void {
    this.byStateAndVisible.subscribe(
      combineLatest([
        this.injector.get(ShareService).getShare$(shareId, sharedBy).pipe(
          switchMap(share => {
            if (!share) return this.onItemEmpty<{share: Share, trails: Observable<Trail | null>[]}>(
              () => this.injector.get(ShareService).storeLoadedAndServerUpdates$(),
              () => this.injector.get(ShareService).getShare$(shareId, sharedBy),
            );
            return this.injector.get(ShareService).getTrailsByShare([share]).pipe(
              map(result => ({share, trails: result.get(share) ?? []}))
            );
          })
        ),
        this.i18n.texts$,
      ]), ([result, texts]) => {
        this.title = result.share.name;
        if (sharedBy === this.injector.get(AuthService).email) {
          this.title2 = texts.pages.trails.your_share;
        } else {
          this.title2 = texts.pages.trails.share_from + ' ' + sharedBy;
        }
        const newList = List(result.trails);
        if (!newList.equals(this.trails$.value))
          this.trails$.next(newList);
        this.loading = false;
        this.initView('share-' + result.share.uuid + '-' + result.share.owner);
        this.actions = this.injector.get(ShareService).getShareMenu(result.share);
        this.changesDetection.detectChanges();
      }
    );
  }

  private initSearch(): void {
    // title
    this.byStateAndVisible.subscribe(
      this.i18n.texts$,
      i18n => {
        this.title = i18n.menu.search_trail;
        this.changesDetection.detectChanges();
      }
    );
    this.initView('search-trails');

    // search service
    const service = this.injector.get(SearchTrailsService);
    // searching
    this.loading = false;
    this.byStateAndVisible.subscribe(service.searching$, searching => {
      if (this.loading !== searching) {
        this.loading = searching;
        this.changesDetection.detectChanges();
      }
    });
    this.byStateAndVisible.subscribe(service.searchMeassage$, message => {
      if (this.message !== message) {
        this.message = message;
        this.changesDetection.detectChanges();
      }
    });
    // map state change
    this.byStateAndVisible.subscribe(
      this._trailsAndMap$.pipe(
        switchMap(c => c ? c.map$ : of(undefined)),
        switchMap(c => c ? combineLatest([c.getState().center$, c.getState().zoomInt$, this.injector.get(FetchSourceService).getAllowedPlugins$()]).pipe(
          debounceTime(200),
          map(() => ({bounds: c.getBounds(), zoom: c.getState().zoom}))
        ) : of(undefined))
      ),
      state => service.mapStateChanged(state)
    );
    // map toolbar
    this.byStateAndVisible.subscribe(service.mapTopToolbar$, toolbar => {
      this.mapTopToolbar$.next(toolbar);
      this.changesDetection.detectChanges();
    });
    // refresh toolbar when network change or size change or filters change
    this.byStateAndVisible.subscribe(combineLatest([
      this.connected$,
      concat(of(undefined), this.injector.get(BrowserService).resize$),
      this._trailsAndMap$,
      this.filters$
    ]), () => {
      this.mapTopToolbar$.next([...this.mapTopToolbar$.value]);
    });
    // results
    this.byStateAndVisible.subscribe(service.trails$, trails => {
      this.trails$.next(trails);
      this.changesDetection.detectChanges();
    });
    this.byStateAndVisible.subscribe(service.bubbles$, bubbles => {
      this.bubbles$.next(bubbles);
      this.changesDetection.detectChanges();
    });
    this.byState.add(this.visible$.subscribe(visible => {
      if (!visible) service.setFilters(undefined);
      else service.setFilters(this.filters$);
    }));
  }


  private initModeration(): void {
    this.viewId = 'moderation';
    this.actions = [];
    // title
    this.byState.add(this.i18n.texts$.pipe(map(texts => texts.publications.moderation.menu_title)).subscribe(title => {
      this.title = title;
      this.changesDetection.detectChanges();
    }));
    // trails
    const refresh$ = new BehaviorSubject<boolean>(true);
    this.listToolbar = [
      new MenuItem().setIcon('refresh').setI18nLabel('publications.moderation.refresh')
      .setAction(() => refresh$.next(true))
    ];
    let first = true;
    this.byStateAndVisible.subscribe(
      refresh$.pipe(switchMap(() => {
        first = true;
        this.loading = true;
        this.ngZone.run(() => this.trails$.next(List()));
        return this.injector.get(ModerationService).getTrailsToReview();
      })),
      trails => {
        const newList = List(trails);
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
          this.loading = false;
          this.ngZone.run(() => this.trails$.next(newList));
        }
      }
    );
  }

  private initMyPublications(): void {
    this.viewId = 'my-publications';
    this.actions = [];
    // title
    this.byState.add(this.i18n.texts$.pipe(map(texts => texts.publications.my_public_trails_name)).subscribe(title => {
      this.title = title;
      this.changesDetection.detectChanges();
    }));
    // trails
    let first = true;
    this.byStateAndVisible.subscribe(
      this.injector.get(MyPublicTrailsService).myPublicTrails$.pipe(
        switchMap(ids => this.injector.get(FetchSourceService).getTrailence$().pipe(
          switchMap(plugin => plugin ? from(plugin.getTrails(ids.map(pair => pair.publicUuid))) : of([] as Trail[])),
          map(trails => trails.map(trail => of(trail))),
        ))
      ),
      trails => {
        const newList = List(trails);
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
          this.loading = false;
          this.ngZone.run(() => this.trails$.next(newList));
        }
      }
    );
  }


  private onItemEmpty<T>(storeReady$: () => Observable<boolean>, getItem$: (auth: AuthResponse) => Observable<any>): Observable<T> {
    return this.injector.get(AuthService).auth$.pipe(
      switchMap(auth => !auth ? EMPTY : combineLatest([ // NOSONAR
        storeReady$(),
        this.visible$,
        this.injector.get(NetworkService).server$,
        getItem$(auth).pipe(
          firstTimeout(item => !!item, 2000, () => null),
        ),
      ]).pipe(
        switchMap(([loaded, visible, connected, item]) => {
          if (item === null && (!connected || (loaded && visible))) {
            Console.warn('Item not found, redirecting to home');
            this.ngZone.run(() => this.injector.get(NavController).navigateRoot('/'));
          }
          return EMPTY;
        })
      ))
    );
  }

  private reset(): void {
    this.viewId = undefined;
    this.title = '';
    this.title2 = undefined;
    this.trails$.next(undefined);
    this.bubbles$.next([]);
    this.actions = [];
    this.message = undefined;
    this.loading = true;
    this.listToolbar = undefined;
    this.mapTopToolbar$.next([]);
    this.titleLongPressEvent = undefined;
    this.userProfile = undefined;
  }

}
