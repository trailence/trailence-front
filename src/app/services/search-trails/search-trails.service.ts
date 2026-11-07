import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject, catchError, EMPTY, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { FetchSourcePlugin, SearchBubblesResult, SearchBubblesTileResult, SearchResult } from '../fetch-source/fetch-source.interfaces';
import { MenuItem } from '@trailence/components/menus/menu-item';
import { NetworkService } from '../network/network.service';
import { I18nService } from '../i18n/i18n.service';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { List } from 'immutable';
import { Trail } from '@trailence/model/trail';
import { debounceTimeExtended } from '@trailence/utils/rxjs/debounce-time-extended';
import { FiltersUtils } from '@trailence/components/trails-list/filters';
import { ErrorService } from '../progress/error.service';
import { PreferencesService } from '../preferences/preferences.service';
import { Filters } from '../preferences/preferences';
import { getLogger } from '@trailence/utils/console';
import { bboxCenter, distance, earthBBox, EarthBBox, projectEarthPointForZoom, unprojectToEarthPointForZoom } from '@trailence/utils/latlng';
import { MapBubble } from '@trailence/components/map/elements/map-bubble';
import { distance2d } from '@trailence/utils/geometry-utils';

const logger = getLogger('search-trails.service');

@Injectable({providedIn: 'root'})
export class SearchTrailsService {

  private readonly _searching$ = new BehaviorSubject<boolean>(false);
  private _searchMode: 'trails' | 'bubbles' | undefined = undefined;
  private readonly _searchMessage$ = new BehaviorSubject<string | undefined>(undefined);
  private _hasSearchResult = false;
  private _availableSearchPlugins: FetchSourcePlugin[] = [];
  private _selectedSearchPlugins: string[] = [];
  private _searchFiltersSubscription?: Subscription;
  private _searchActive = false; // when a search has been triggered at least one time, and no clear results
  private readonly _trails$ = new BehaviorSubject<List<Observable<Trail | null>> | undefined>(undefined);
  private readonly _bubbles$ = new BehaviorSubject<MapBubble[]>([]);
  private _filters$: Observable<Filters | undefined> | undefined;

  constructor(
    private readonly pluginService: FetchSourceService,
    private readonly networkService: NetworkService,
    private readonly i18n: I18nService,
    private readonly injector: Injector,
  ) {
    // available plugins
    pluginService.getAllowedPlugins$().subscribe(list => {
      logger.info('Allowed search plugins: ', list.map(p => p.name));
      this._availableSearchPlugins = list.filter(p => p.canSearchByArea());
      this.mapTopToolbar$.next([...this.mapTopToolbar$.value]);
    });
    this._selectedSearchPlugins = ['Trailence'];
  }

  public get searching$(): Observable<boolean> { return this._searching$; }
  public get searching(): boolean { return this._searching$.value; }
  public get searchMeassage$(): Observable<string | undefined> { return this._searchMessage$; }
  public get trails$(): Observable<List<Observable<Trail | null>> | undefined> { return this._trails$; }
  public get bubbles$(): Observable<MapBubble[]> { return this._bubbles$; }

  public setFilters(filters$: Observable<Filters | undefined> | undefined): void {
    this._searchFiltersSubscription?.unsubscribe();
    this._filters$ = filters$;
    if (this._searchFiltersSubscription) this.subscribeToFilters();
  }

  public readonly mapTopToolbar$ = new BehaviorSubject<MenuItem[]>([
    new MenuItem()
      .setIcon('search-map')
      .setI18nLabel(() => this.searching ? 'pages.trails.search.searching' : 'pages.trails.search.search_in_this_area')
      .setDisabled(() => this.searching || !this.networkService.internet || !this.networkService.server || this._searchMode === undefined || this._selectedSearchPlugins.length === 0)
      .setAction(() => {
        if (!this.searching && this._selectedSearchPlugins.length > 0 && this.networkService.internet && this.networkService.server && this._searchMode !== undefined)
          this.doSearch();
      }),
    new MenuItem()
      .setIcon('trash').setI18nLabel('pages.trails.search.clear_search_results')
      .setVisible(() => this._hasSearchResult)
      .setAction(() => this.clearSearchResult()),
    new MenuItem()
      .setIcon('radio-group').setI18nLabel('pages.trails.search.sources')
      .setVisible(() => this._availableSearchPlugins.length > 1)
      .setAction(() => {
        void import('@ionic/angular').then(ionic => this.injector.get(ionic.AlertController))
        .then(alertController => alertController.create({
          header: this.i18n.texts.pages.trails.search.sources,
          inputs: this._availableSearchPlugins.map(plugin => ({
            label: plugin.name,
            value: plugin.name,
            type: 'radio',
            checked: this._selectedSearchPlugins.includes(plugin.name),
          })),
          buttons: [{
            text: this.i18n.texts.buttons.ok,
            role: 'ok',
            handler: (value) => {
              if (value) {
                this._selectedSearchPlugins = [value];
                this.mapTopToolbar$.next(this.mapTopToolbar$.value);
              }
              void alertController.dismiss();
            },
          }]
        }))
        .then(a => a.present());
      }),
  ]);

  public mapStateChanged(state: {bounds: EarthBBox | undefined, zoom: number} | undefined): void {
    const modeBefore = this._searchMode;
    this.setSearchBounds(state?.bounds, state?.zoom);
    if (!this.searching && this._selectedSearchPlugins.length > 0 && this.networkService.internet && this.networkService.server &&
      modeBefore === 'bubbles' && this._searchMode !== undefined && this.searchZoom && this.searchBounds && this.lastSearchZoom && this.lastSearchBounds &&
      this._searchActive &&
      (this.lastSearchZoom !== this.searchZoom || distance2d(projectEarthPointForZoom(bboxCenter(this.searchBounds), this.searchZoom), projectEarthPointForZoom(bboxCenter(this.lastSearchBounds), this.lastSearchZoom)) > 50)
    ) {
      this.doSearch();
    }
  }

  public clearSearchResult(): void {
    this._hasSearchResult = false;
    this._searchActive = false;
    this._trails$.next(undefined);
    this._bubbles$.next([]);
  }


  private searchBounds?: EarthBBox;
  private searchZoom?: number;
  private lastSearchBounds?: EarthBBox;
  private lastSearchZoom?: number;
  private setSearchBounds(bounds?: EarthBBox, zoom?: number, forceRefresh: boolean = false): void {
    this.searchBounds = bounds;
    this.searchZoom = zoom;
    this._searchMessage$.next(undefined);
    let changed = false;
    if (!bounds || !zoom) {
      if (this._searchMode !== undefined) {
        this._searchMode = undefined;
        changed = true;
      }
    } else if (
      zoom <= 10 && (
        distance({lat: bounds.maxlat, lng: bounds.minlng}, {lat: bounds.maxlat, lng: bounds.maxlng}) > 100000 ||
        distance({lat: bounds.maxlat, lng: bounds.maxlng}, {lat: bounds.minlat, lng: bounds.maxlng}) > 100000
      )
    ) {
      if (this.pluginService.getPluginsByName(this._selectedSearchPlugins).some(p => p.canSearchBubbles())) {
        if (this._searchMode !== 'bubbles') {
          this._searchMode = 'bubbles';
          changed = true;
        }
      } else if (this._searchMode !== undefined) {
        this._searchMode = undefined;
        this._searchMessage$.next('pages.trails.search.needs_zoom');
        changed = true;
      }
    } else if (this._searchMode !== 'trails') {
      this._searchMode = 'trails';
      changed = true;
    }
    if (changed || forceRefresh) {
      this.mapTopToolbar$.next([...this.mapTopToolbar$.value]);
    }
  }

  private doSearch(): void {
    if (this._searchMode === undefined || this.searching) return;
    this._searching$.next(true);
    this._searchMessage$.next(undefined);
    this._hasSearchResult = false;
    this.lastSearchBounds = this.searchBounds;
    this.lastSearchZoom = this.searchZoom;
    this._searchActive = true;
    this.mapTopToolbar$.next(this.mapTopToolbar$.value);
    if (this._searchMode === 'trails')
      this.doSearchTrails();
    else
      this.doSearchBubbles();
  }

  private doSearchTrails(): void {
    let firstResult = true;
    this._searchFiltersSubscription?.unsubscribe();
    this._searchFiltersSubscription = undefined;
    const fillResults = (result: SearchResult) => {
      if (firstResult) this._bubbles$.next([]);
      logger.info('search result', result.trails.length, result.end, result.tooManyResults);
      const newTrails = result.trails.map(t => of(t));
      const newList = List(firstResult ? newTrails : [...(this._trails$.value ?? []), ...newTrails]);
      firstResult = false;
      if (!newList.equals(this._trails$.value))
        this._trails$.next(newList);
      if (result.end) {
        this._searching$.next(false);
        this.setSearchBounds(this.searchBounds, this.searchZoom, true);
      }
      if (result.tooManyResults) this._searchMessage$.next('pages.trails.search.too_much_results');
      if (result.trails.length > 0) this._hasSearchResult = true;
    };
    const plugins = this._selectedSearchPlugins;
    logger.info('Start search on bounds ', this.searchBounds, 'using plugins', plugins);
    this.pluginService.searchByArea(this.searchBounds!, 200, plugins).subscribe({ // NOSONAR
      next: result => fillResults(result),
      error: e => {
        logger.error('Error searching trails on ' + plugins.join(',') + ' with bounds', this.searchBounds, 'error', e);
        this.injector.get(ErrorService).addNetworkError(e, 'pages.trails.search.error', []);
        this._searching$.next(false);
        this.setSearchBounds(this.searchBounds, this.searchZoom, true);
      }
    });
  }

  private doSearchBubbles(): void {
    this._searchFiltersSubscription?.unsubscribe();
    this.subscribeToFilters();
  }

  private subscribeToFilters(): void {
    if (this._selectedSearchPlugins.length === 0 || !this.searchBounds || !this.searchZoom) {
      this._searchFiltersSubscription = undefined;
      return;
    }
    const bounds = this.searchBounds;
    const zoom = this.searchZoom;
    const plugin = this.pluginService.getPluginByName(this._selectedSearchPlugins[0])!;
    let searchCount = 0;
    logger.info('Start search bubbles on bounds ', bounds, 'zoom', zoom, 'using plugin', plugin.name);
    this._searchFiltersSubscription = this._filters$?.pipe(
      debounceTimeExtended(0, 1000),
      switchMap(filters => {
        const count = ++searchCount;
        this._searching$.next(true);
        return (plugin?.searchBubbles(bounds, zoom, filters ?? FiltersUtils.createEmpty(), this.injector.get(PreferencesService).preferences.lang) ?? of({trailsByTile: [], uuids: undefined})).pipe(
          catchError(e => {
            logger.error('Error searching bubbles on ' + plugin?.name + ' with bounds', bounds, 'and zoom', zoom, 'error', e);
            this.injector.get(ErrorService).addNetworkError(e, 'pages.trails.search.error', []);
            if (searchCount === count) {
              this._searching$.next(false);
              this.setSearchBounds(bounds, zoom, true);
            }
            return EMPTY;
          }),
          map(result => ([result, count]) as [SearchBubblesResult, number]),
        );
      })
    ).subscribe(([result, count]) => {
      if (searchCount !== count) return;
      this._bubbles$.next(result.trailsByTile.map(r => this.searchBubbleResultToMapBubble(r, zoom)));
      logger.info('Search bubbles found', result.trailsByTile.length);
      if (result.uuids?.length) {
        void plugin.getTrails(result.uuids)
        .catch(e => {
          logger.error('Get trails by uuids error', e);
          return [] as Trail[];
        })
        .then(trails => {
          this._trails$.next(List(trails.map(t => of(t))));
          this._searching$.next(false);
          this._hasSearchResult = result.trailsByTile.length > 0;
          this.setSearchBounds(bounds, zoom, true);
        });
      } else {
        this._trails$.next(List());
        this._searching$.next(false);
        this._hasSearchResult = result.trailsByTile.length > 0;
        this.setSearchBounds(bounds, zoom, true);
      }
    });
  }

  private searchBubbleResultToMapBubble(r: SearchBubblesTileResult, zoom: number): MapBubble {
    //const pos = L.latLng(r.pos);
    const centerPoint = projectEarthPointForZoom(r.pos, zoom);
    const bubbleBounds = earthBBox(
      unprojectToEarthPointForZoom({x: centerPoint.x - 60, y: centerPoint.y - 60}, zoom),
      unprojectToEarthPointForZoom({x: centerPoint.x + 60, y: centerPoint.y + 60}, zoom),
    );
    const bounds = earthBBox(
      unprojectToEarthPointForZoom({x: centerPoint.x - 64, y: centerPoint.y - 64}, zoom),
      unprojectToEarthPointForZoom({x: centerPoint.x + 64, y: centerPoint.y + 64}, zoom),
    );
    const bubble = new MapBubble(
      'searchResult$' + r.pos.lat + '$' + r.pos.lng, // unique id
      bubbleBounds,
      bounds,
      '#80808080',
      '#C0C0C0C0',
      '' + r.count,
      20,
      '#000000',
    );
    bubble.events.addClickListener((bubble, event) => {
      event.renderer.fitBounds(bounds, true);
    });
    return bubble;
  }

}
