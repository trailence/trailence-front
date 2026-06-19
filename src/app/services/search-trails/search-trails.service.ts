import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject, catchError, EMPTY, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { FetchSourcePlugin, SearchBubblesResult, SearchBubblesTileResult, SearchResult } from '../fetch-source/fetch-source.interfaces';
import { LeafletUtils } from 'src/app/utils/leaflet-utils';
import { MenuItem } from 'src/app/components/menus/menu-item';
import { NetworkService } from '../network/network.service';
import { I18nService } from '../i18n/i18n.service';
import { FetchSourceService } from '../fetch-source/fetch-source.service';
import { Console } from 'src/app/utils/console';
import * as L from 'leaflet';
import { List } from 'immutable';
import { Trail } from 'src/app/model/trail';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { MapBubble } from 'src/app/components/map/bubble/map-bubble';
import { Filters, FiltersUtils } from 'src/app/components/trails-list/filters';
import { ErrorService } from '../progress/error.service';
import { PreferencesService } from '../preferences/preferences.service';

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
  private readonly _showBubbles$ = new BehaviorSubject<boolean>(false);
  private readonly _bubblesToolAvailable$ = new BehaviorSubject<boolean>(true);
  private _filters$: Observable<Filters | undefined> | undefined;

  constructor(
    private readonly pluginService: FetchSourceService,
    private readonly networkService: NetworkService,
    private readonly i18n: I18nService,
    private readonly injector: Injector,
  ) {
    // available plugins
    pluginService.getAllowedPlugins$().subscribe(list => {
      Console.info('Allowed search plugins: ', list.map(p => p.name));
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
  public get showBubbles$(): Observable<boolean> { return this._showBubbles$; }
  public get bubblesToolAvailable$(): Observable<boolean> { return this._bubblesToolAvailable$; }

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
        import('@ionic/angular/standalone').then(ionic => this.injector.get(ionic.AlertController))
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
              alertController.dismiss();
            },
          }]
        }))
        .then(a => a.present());
      }),
  ]);

  public mapStateChanged(state: {bounds: L.LatLngBounds | undefined, zoom: number} | undefined): void {
    const modeBefore = this._searchMode;
    this.setSearchBounds(state?.bounds, state?.zoom);
    if (!this.searching && this._selectedSearchPlugins.length > 0 && this.networkService.internet && this.networkService.server &&
      modeBefore === 'bubbles' && this._searchMode !== undefined && this.searchZoom && this.searchBounds && this.lastSearchZoom && this.lastSearchBounds &&
      this._searchActive &&
      (this.lastSearchZoom !== this.searchZoom || L.CRS.EPSG3857.latLngToPoint(this.searchBounds.getCenter(), this.searchZoom).distanceTo(L.CRS.EPSG3857.latLngToPoint(this.lastSearchBounds.getCenter(), this.lastSearchZoom)) > 50)
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


  private searchBounds?: L.LatLngBounds;
  private searchZoom?: number;
  private lastSearchBounds?: L.LatLngBounds;
  private lastSearchZoom?: number;
  private setSearchBounds(bounds?: L.LatLngBounds, zoom?: number, forceRefresh: boolean = false): void {
    if (bounds) {
      bounds = LeafletUtils.normalizeBounds(bounds);
    }
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
        bounds.getSouthEast().distanceTo(bounds.getSouthWest()) > 100000 ||
        bounds.getSouthEast().distanceTo(bounds.getNorthEast()) > 100000
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
    this._showBubbles$.next(false);
    this._bubblesToolAvailable$.next(false);
    let firstResult = true;
    this._searchFiltersSubscription?.unsubscribe();
    this._searchFiltersSubscription = undefined;
    const fillResults = (result: SearchResult) => {
      if (firstResult) this._bubbles$.next([]);
      Console.info('search result', result.trails.length, result.end, result.tooManyResults);
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
    Console.info('Start search on bounds ', this.searchBounds, 'using plugins', plugins);
    this.pluginService.searchByArea(this.searchBounds!, 200, plugins).subscribe({ // NOSONAR
      next: result => fillResults(result),
      error: e => {
        Console.error('Error searching trails on ' + plugins.join(',') + ' with bounds', this.searchBounds, 'error', e);
        this.injector.get(ErrorService).addNetworkError(e, 'pages.trails.search.error', []);
        this._searching$.next(false);
        this.setSearchBounds(this.searchBounds, this.searchZoom, true);
      }
    });
  }

  private doSearchBubbles(): void {
    this._showBubbles$.next(true);
    this._bubblesToolAvailable$.next(false);
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
    Console.info('Start search bubbles on bounds ', bounds, 'zoom', zoom, 'using plugins', plugin);
    this._searchFiltersSubscription = this._filters$?.pipe(
      debounceTimeExtended(0, 1000),
      switchMap(filters => {
        const count = ++searchCount;
        this._searching$.next(true);
        return (plugin?.searchBubbles(bounds, zoom, filters ?? FiltersUtils.createEmpty(), this.injector.get(PreferencesService).preferences.lang) ?? of({trailsByTile: [], uuids: undefined})).pipe(
          catchError(e => {
            Console.error('Error searching bubbles on ' + plugin + ' with bounds', bounds, 'and zoom', zoom, 'error', e);
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
      Console.info('Search bubbles found', result.trailsByTile.length);
      if (result.uuids?.length) {
        plugin.getTrails(result.uuids)
        .catch(e => {
          Console.error('Get trails by uuids error', e);
          return [] as Trail[];
        })
        .then(trails => {
          this._trails$.next(List(trails.map(t => of(t))));
          this._searching$.next(false);
          this._hasSearchResult = result.trailsByTile.length > 0;
          this.setSearchBounds(bounds, zoom, true);
          this._showBubbles$.next(false);
          this._bubblesToolAvailable$.next(true);
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
        setTimeout(() => {
          const zoom = map.getZoom();
          if (!this.searching && zoom && this.lastSearchZoom !== zoom)
            this.doSearch();
        }, 100);
      };
      map.addEventListener('zoomend', listener);
      map.fitBounds(bounds);
      setTimeout(() => {
        if (!called) listener();
      }, 2000);
    });
  }

}
