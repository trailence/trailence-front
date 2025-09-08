import { ChangeDetectorRef, Component, Injector, Input, ViewChild } from '@angular/core';
import { AbstractPage } from 'src/app/utils/component-utils';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { BehaviorSubject, EMPTY, map, of, switchMap, combineLatest, Observable, debounceTime, Subscription, catchError, from } from 'rxjs';
import { Router } from '@angular/router';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
import { TrailsAndMapComponent } from 'src/app/components/trails-and-map/trails-and-map.component';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { collection$items$ } from 'src/app/utils/rxjs/collection$items';
import { ShareService } from 'src/app/services/database/share.service';
import { Share } from 'src/app/model/share';
import { List } from 'immutable';
import { Console } from 'src/app/utils/console';
import { NetworkService } from 'src/app/services/network/network.service';
import { AuthResponse } from 'src/app/services/auth/auth-response';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import * as L from 'leaflet';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { FetchSourcePlugin, SearchBubblesResult, SearchResult } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';
import { ModerationService } from 'src/app/services/moderation/moderation.service';
import { AlertController } from '@ionic/angular/standalone';
import { MapBubble } from 'src/app/components/map/bubble/map-bubble';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { MyPublicTrailsService } from 'src/app/services/database/my-public-trails.service';
import { TrailencePlugin } from 'src/app/services/fetch-source/trailence.plugin';
import { MySelectionService } from 'src/app/services/database/my-selection.service';
import { Filters, FiltersUtils } from 'src/app/components/trails-list/filters';
import { MapLayersService } from 'src/app/services/map/map-layers.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { isPublicationCollection, TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { BrowserService } from 'src/app/services/browser/browser.service';

const LOCALSTORAGE_KEY_BUBBLES = 'trailence.trails.bubbles';

@Component({
    selector: 'app-trails-page',
    templateUrl: './trails.page.html',
    styleUrls: ['./trails.page.scss'],
    imports: [
        CommonModule,
        HeaderComponent,
        TrailsAndMapComponent,
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

  viewId?: string;
  titleLongPressEvent?: () => void;

  searching = false;
  searchMode: 'trails' | 'bubbles' | undefined = undefined;
  searchMessage?: string;
  hasSearchResult = false;
  availableSearchPlugins: FetchSourcePlugin[] = [];
  selectedSearchPlugins: string[] = [];
  searchPluginsSubscription?: Subscription;

  connected$: Observable<boolean>;

  readonly mapTopToolbar$ = new BehaviorSubject<MenuItem[]>([]);
  readonly showBubbles$ = new BehaviorSubject<boolean>(false);
  readonly bubblesToolAvailable$ = new BehaviorSubject<boolean>(true);

  private readonly _trailsAndMap$ = new BehaviorSubject<TrailsAndMapComponent | undefined>(undefined);
  @ViewChild('trailsAndMap', { read: TrailsAndMapComponent }) set trailsAndMap(v: TrailsAndMapComponent | undefined) { this._trailsAndMap$.next(v); }
  get trailsAndMap() { return this._trailsAndMap$.value; }

  private readonly filters$: Observable<Filters | undefined>;
  private searchFiltersSubscription?: Subscription;

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
    readonly networkService: NetworkService,
    public readonly mapLayerService: MapLayersService,
  ) {
    super(injector);
    this.connected$ = combineLatest([networkService.internet$, networkService.server$]).pipe(map(([i,s]) => i && s));
    combineLatest([this.bubblesToolAvailable$, this.showBubbles$]).subscribe(
      ([available, show]) => {
        if (this.viewId && available) localStorage.setItem(LOCALSTORAGE_KEY_BUBBLES + '.' + this.viewId, JSON.stringify(show));
      }
    );
    this.filters$ = this._trailsAndMap$.pipe(
      switchMap(tm => tm ? tm.trailsList$ : of(undefined)),
      switchMap(tl => tl ? tl.filters$ : of(undefined))
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
        myTrails => this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/trails/collection/' + myTrails.uuid))
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
      default: this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
    }
  }

  protected override destroyComponent(): void {
    this.reset();
  }

  private initView(id: string): void {
    this.viewId = id;
    this.loadShowBubbleState();
  }

  private loadShowBubbleState(): void {
    const showBubblesState = localStorage.getItem(LOCALSTORAGE_KEY_BUBBLES + '.' + this.viewId);
    if (showBubblesState) {
      try {
        this.showBubbles$.next(!!JSON.parse(showBubblesState));
      } catch (e) { // NOSONAR
        // ignore
        this.showBubbles$.next(false);
      }
    } else {
      this.showBubbles$.next(false);
    }
  }

  private initCollection(collectionUuid: string): void {
    let collectionActions: MenuItem[] = [];
    let trailsActions: MenuItem[] = [];
    // title is collection name, or default
    this.byState.add(
      combineLatest([
        this.injector.get(AuthService).auth$.pipe(
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
        else
          this.title2 = texts.pages.trails.collection;
        this.injector.get(ChangeDetectorRef).detectChanges();
      })
    );
    // trails from collection
    let first = true;
    this.byStateAndVisible.subscribe(
      combineLatest([
        this.injector.get(AuthService).auth$.pipe(
          switchMap(auth => auth ? this.injector.get(TrailCollectionService).getCollection$(collectionUuid, auth.email) : of(undefined)),
          filterDefined(),
        ),
        this.injector.get(TrailService).getAllWhenLoaded$().pipe(
          collection$items$(trail => trail.collectionUuid === collectionUuid)
        ),
      ]),
      ([collection, trails]) => {
        const newList = List(trails.map(t => t.item$));
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
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
      this.injector.get(ChangeDetectorRef).detectChanges();
    }));
    // trails
    let first = true;
    this.byStateAndVisible.subscribe(
      combineLatest([
        this.injector.get(TrailService).getAllWhenLoaded$().pipe(collection$items$()),
        this.injector.get(TrailCollectionService).getAllCollectionsReady$(),
      ]),
      ([allTrails, collections]) => {
        const owner = this.injector.get(AuthService).email;
        const collectionsWithoutPub = collections.filter(c => !isPublicationCollection(c.type));
        const newList = List(allTrails.filter(t => t.item.owner === owner && collectionsWithoutPub.findIndex(col => col.uuid === t.item.collectionUuid) >= 0).map(t => t.item$));
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
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
      this.injector.get(ChangeDetectorRef).detectChanges();
    }));
    // trails
    let first = true;
    this.byStateAndVisible.subscribe(
      this.injector.get(MySelectionService).getMySelection()
      .pipe(
        map(selection => selection.map(s => this.injector.get(TrailService).getTrail$(s.uuid, s.owner))),
      ),
      trails => {
        const newList = List(trails);
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
          this.ngZone.run(() => this.trails$.next(newList));
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
        this.initView('share-' + result.share.uuid + '-' + result.share.owner);
        this.actions = this.injector.get(ShareService).getShareMenu(result.share);
        this.injector.get(ChangeDetectorRef).detectChanges();
      }
    );
  }

  private searchActive = false;
  private initSearch(): void {
    this.searchActive = false;
    // title
    this.byStateAndVisible.subscribe(
      this.i18n.texts$,
      i18n => {
        this.title = i18n.menu.search_trail;
        this.injector.get(ChangeDetectorRef).detectChanges();
      }
    );
    this.initView('search-trails');
    if (this.bubblesToolAvailable$.value)
      this.bubblesToolAvailable$.next(false);
    // search trails
    this.byStateAndVisible.subscribe(
      this._trailsAndMap$.pipe(
        switchMap(c => c ? c.map$ : of(undefined)),
        switchMap(c => c ? combineLatest([c.getState().center$, c.getState().zoom$, this.injector.get(FetchSourceService).getAllowedPlugins$()]).pipe(
          debounceTime(200),
          map(() => ({bounds: c.getBounds(), zoom: c.getState().zoom}))
        ) : of(undefined))
      ),
      state => {
        const modeBefore = this.searchMode;
        this.setSearchBounds(state?.bounds, state?.zoom);
        if (!this.searching && this.selectedSearchPlugins.length > 0 && this.networkService.internet && this.networkService.server &&
          modeBefore === 'bubbles' && this.searchMode !== undefined && this.searchZoom && this.searchBounds && this.lastSearchZoom && this.lastSearchBounds &&
          this.searchActive &&
          (this.lastSearchZoom !== this.searchZoom || L.CRS.EPSG3857.latLngToPoint(this.searchBounds.getCenter(), this.searchZoom).distanceTo(L.CRS.EPSG3857.latLngToPoint(this.lastSearchBounds.getCenter(), this.lastSearchZoom)) > 50)
        ) {
          this.doSearch(this.selectedSearchPlugins);
        }
      }
    );
    // map toolbar
    this.mapTopToolbar$.next([
      new MenuItem()
        .setIcon('search-map')
        .setI18nLabel(() => this.searching ? 'pages.trails.search.searching' : 'pages.trails.search.search_in_this_area')
        .setDisabled(() => this.searching || !this.networkService.internet || !this.networkService.server || this.searchMode === undefined || this.selectedSearchPlugins.length === 0)
        .setAction(() => {
          if (!this.searching && this.selectedSearchPlugins.length > 0 && this.networkService.internet && this.networkService.server && this.searchMode !== undefined)
            this.doSearch(this.selectedSearchPlugins);
        }),
      new MenuItem()
        .setIcon('trash').setI18nLabel('pages.trails.search.clear_search_results')
        .setVisible(() => this.hasSearchResult)
        .setAction(() => this.clearSearchResult()),
      new MenuItem()
        .setIcon('radio-group').setI18nLabel('pages.trails.search.sources')
        .setVisible(() => this.availableSearchPlugins.length > 1)
        .setAction(() => {
          this.injector.get(AlertController).create({
            header: this.i18n.texts.pages.trails.search.sources,
            inputs: this.availableSearchPlugins.map(plugin => ({
              label: plugin.name,
              value: plugin.name,
              type: 'radio',
              checked: this.selectedSearchPlugins.indexOf(plugin.name) >= 0,
            })),
            buttons: [{
              text: this.i18n.texts.buttons.ok,
              role: 'ok',
              handler: (value) => {
                if (value) {
                  this.selectedSearchPlugins = [value];
                  this.mapTopToolbar$.next(this.mapTopToolbar$.value);
                }
                this.injector.get(AlertController).dismiss();
              },
            }]
          }).then(a => a.present());
        }),
      new MenuItem()
        .setIcon('filters').setI18nLabel('tools.filters')
        .setVisible(() => this.trailsAndMap?.isSmall === true)
        .setBadgeTopRight(() => {
          const nb = this.trailsAndMap?.trailsList?.nbActiveFilters();
          if (!nb) return undefined;
          return { text: '' + nb, color: 'success', fill: true };
        })
        .setAction(() => this.trailsAndMap?.trailsList?.filtersModal?.present())
    ]);
    // available plugins
    this.searchPluginsSubscription = this.injector.get(FetchSourceService).getAllowedPlugins$().subscribe(list => {
      Console.info('Allowed search plugins: ', list.map(p => p.name));
      this.availableSearchPlugins = list;
      this.mapTopToolbar$.next([...this.mapTopToolbar$.value]);
    });
    this.selectedSearchPlugins = ['Trailence'];
    // refresh toolbar when network change or size change
    this.byStateAndVisible.subscribe(combineLatest([this.connected$, this.injector.get(BrowserService).resize$, this._trailsAndMap$, this.filters$]), () => {
      this.mapTopToolbar$.next([...this.mapTopToolbar$.value]);
    });
  }

  private searchBounds?: L.LatLngBounds;
  private searchZoom?: number;
  private lastSearchBounds?: L.LatLngBounds;
  private lastSearchZoom?: number;
  private setSearchBounds(bounds?: L.LatLngBounds, zoom?: number, forceRefresh: boolean = false): void {
    this.ngZone.run(() => {
      this.searchBounds = bounds;
      this.searchZoom = zoom;
      this.searchMessage = undefined;
      let changed = false;
      if (!bounds || !zoom) {
        if (this.searchMode !== undefined) {
          this.searchMode = undefined;
          changed = true;
        }
      } else if (
        zoom <= 10 && (
          bounds.getSouthEast().distanceTo(bounds.getSouthWest()) > 100000 ||
          bounds.getSouthEast().distanceTo(bounds.getNorthEast()) > 100000
        )
      ) {
        if (this.injector.get(FetchSourceService).getPluginsByName(this.selectedSearchPlugins).filter(p => p.canSearchBubbles()).length > 0) {
          if (this.searchMode !== 'bubbles') {
            this.searchMode = 'bubbles';
            changed = true;
          }
        } else if (this.searchMode !== undefined) {
          this.searchMode = undefined;
          this.searchMessage = 'pages.trails.search.needs_zoom';
          changed = true;
        }
      } else if (this.searchMode !== 'trails') {
        this.searchMode = 'trails';
        changed = true;
      }
      if (changed || forceRefresh) {
        this.mapTopToolbar$.next([...this.mapTopToolbar$.value]);
      }
    });
  }

  doSearch(plugins: string[]): void {
    if (this.searchMode === undefined) return;
    this.ngZone.run(() => {
      this.searching = true;
      this.searchMessage = undefined;
      this.hasSearchResult = false;
    });
    this.lastSearchBounds = this.searchBounds;
    this.lastSearchZoom = this.searchZoom;
    this.searchActive = true;
    this.mapTopToolbar$.next(this.mapTopToolbar$.value);
    if (this.searchMode === 'trails')
      this.doSearchTrails(plugins);
    else
      this.doSearchBubbles(plugins);
  }

  private doSearchTrails(plugins: string[]): void {
    this.showBubbles$.next(false);
    let firstResult = true;
    this.searchFiltersSubscription?.unsubscribe();
    this.searchFiltersSubscription = undefined;
    const fillResults = (result: SearchResult) => {
      if (firstResult) this.bubbles$.next([]);
      Console.info('search result', result.trails.length, result.end, result.tooManyResults);
      const newTrails = result.trails.map(t => of(t));
      const newList = List(firstResult ? newTrails : [...(this.trails$.value ?? []), ...newTrails]);
      firstResult = false;
      this.ngZone.run(() => {
        if (!newList.equals(this.trails$.value))
          this.trails$.next(newList);
        if (result.end) {
          this.searching = false;
          this.setSearchBounds(this.searchBounds, this.searchZoom, true);
        }
        if (result.tooManyResults) this.searchMessage = 'pages.trails.search.too_much_results';
        if (result.trails.length > 0) this.hasSearchResult = true;
      });
    };
    Console.info('Start search on bounds ', this.searchBounds, 'using plugins', plugins);
    this.injector.get(FetchSourceService).searchByArea(this.searchBounds!, 200, plugins).subscribe({ // NOSONAR
      next: result => fillResults(result),
      error: e => {
        Console.error('Error searching trails on ' + plugins.join(',') + ' with bounds', this.searchBounds, 'error', e);
        this.injector.get(ErrorService).addNetworkError(e, 'pages.trails.search.error', []);
        this.searching = false;
        this.setSearchBounds(this.searchBounds, this.searchZoom, true);
      }
    });
  }

  private doSearchBubbles(plugins: string[]): void {
    this.showBubbles$.next(true);
    const bounds = this.searchBounds!;
    const zoom = this.searchZoom!;
    Console.info('Start search bubbles on bounds ', bounds, 'zoom', zoom, 'using plugins', plugins);
    this.searchFiltersSubscription?.unsubscribe();
    let searchCount = 0;
    this.searchFiltersSubscription = this.filters$.pipe(
      debounceTimeExtended(0, 1000),
      switchMap(filters => {
        const count = ++searchCount;
        this.ngZone.run(() => {
          this.searching = true;
        });
        return (this.injector.get(FetchSourceService).getPluginByName(plugins[0])?.searchBubbles(bounds, zoom, filters ?? FiltersUtils.createEmpty()) ?? of([])).pipe(
          catchError(e => {
            Console.error('Error searching bubbles on ' + plugins.join(',') + ' with bounds', bounds, 'and zoom', zoom, 'error', e);
            this.injector.get(ErrorService).addNetworkError(e, 'pages.trails.search.error', []);
            if (searchCount === count) {
              this.searching = false;
              this.setSearchBounds(bounds, zoom, true);
            }
            return EMPTY;
          }),
          map(result => ([result, count]) as [SearchBubblesResult[], number]),
        );
      })
    ).subscribe(([result, count]) => {
      this.ngZone.run(() => {
        if (searchCount !== count) return;
        this.trails$.next(List());
        this.bubbles$.next(result.map(r => {
          const pos = L.latLng(r.pos);
          const centerPoint = L.CRS.EPSG3857.latLngToPoint(pos, zoom);
          const bubbleBoundsPoint = L.bounds(L.point(centerPoint.x - 60, centerPoint.y - 60), L.point(centerPoint.x + 60, centerPoint.y + 60));
          const bubbleBounds = L.latLngBounds(L.CRS.EPSG3857.pointToLatLng(bubbleBoundsPoint.getBottomLeft(), zoom), L.CRS.EPSG3857.pointToLatLng(bubbleBoundsPoint.getTopRight(), zoom));
          const boundsPoint = L.bounds(L.point(centerPoint.x - 64, centerPoint.y - 64), L.point(centerPoint.x + 64, centerPoint.y + 64));
          const bounds = L.latLngBounds(L.CRS.EPSG3857.pointToLatLng(boundsPoint.getBottomLeft(), zoom), L.CRS.EPSG3857.pointToLatLng(boundsPoint.getTopRight(), zoom));
          return new MapBubble(
            bubbleBounds,
            bounds,
            '#80808080',
            '#C0C0C0C0',
            '' + r.count,
            20,
            '#000000',
          ).onClick(map => {
            let called = false;
            const listener = () => {
              if (called) return;
              called = true;
              map.removeEventListener('zoomend', listener);
              setTimeout(() => this.doSearch(this.selectedSearchPlugins), 100);
            };
            map.addEventListener('zoomend', listener);
            map.fitBounds(bounds);
            setTimeout(() => {
              if (!called) listener();
            }, 2000);
          });
        }));
        this.searching = false;
        this.hasSearchResult = result.length > 0;
        this.setSearchBounds(bounds, zoom, true);
        Console.info('Search bubbles found', result.length);
      });
    });
  }

  clearSearchResult(): void {
    this.ngZone.run(() => {
      this.hasSearchResult = false;
      this.searchActive = false;
      this.trails$.next(undefined);
      this.bubbles$.next([]);
    });
  }

  private initModeration(): void {
    this.viewId = 'moderation';
    this.actions = [];
    // title
    this.byState.add(this.i18n.texts$.pipe(map(texts => texts.publications.moderation.menu_title)).subscribe(title => {
      this.title = title;
      this.injector.get(ChangeDetectorRef).detectChanges();
    }));
    // trails
    let first = true;
    this.byStateAndVisible.subscribe(
      this.injector.get(ModerationService).getTrailsToReview(),
      trails => {
        const newList = List(trails);
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
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
      this.injector.get(ChangeDetectorRef).detectChanges();
    }));
    // trails
    let first = true;
    this.byStateAndVisible.subscribe(
      this.injector.get(MyPublicTrailsService).myPublicTrails$.pipe(
        switchMap(ids => this.injector.get(FetchSourceService).plugin$('trailence').pipe(
          switchMap(plugin => plugin ? from((plugin as TrailencePlugin).getTrails(ids.map(pair => pair.publicUuid))) : of([] as Trail[])),
          map(trails => trails.map(trail => of(trail))),
        ))
      ),
      trails => {
        const newList = List(trails);
        if (first || !newList.equals(this.trails$.value)) {
          first = false;
          this.ngZone.run(() => this.trails$.next(newList));
        }
      }
    );
  }


  private onItemEmpty<T>(storeReady$: () => Observable<boolean>, getItem$: (auth: AuthResponse) => Observable<any>): Observable<T> {
    return this.injector.get(AuthService).auth$.pipe(
      switchMap(auth => !auth ? EMPTY : combineLatest([
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
            this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
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
    this.bubblesToolAvailable$.next(true);
    this.showBubbles$.next(false);
    this.actions = [];
    this.searching = false;
    this.searchMessage = undefined;
    this.searchMode = undefined;
    this.mapTopToolbar$.next([]);
    this.searchPluginsSubscription?.unsubscribe();
    this.searchPluginsSubscription = undefined;
    this.availableSearchPlugins = [];
    this.selectedSearchPlugins = [];
    this.searchFiltersSubscription?.unsubscribe();
    this.searchFiltersSubscription = undefined;
    this.titleLongPressEvent = undefined;
  }

}
