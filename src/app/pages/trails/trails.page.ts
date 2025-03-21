import { Component, Injector, Input, ViewChild } from '@angular/core';
import { AbstractPage } from 'src/app/utils/component-utils';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { BehaviorSubject, EMPTY, map, of, switchMap, combineLatest, Observable, debounceTime } from 'rxjs';
import { Router } from '@angular/router';
import { TrailCollectionType } from 'src/app/model/trail-collection';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
import { TrailsAndMapComponent } from 'src/app/components/trails-and-map/trails-and-map.component';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'src/app/utils/menu-item';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { ShareService } from 'src/app/services/database/share.service';
import { ShareElementType } from 'src/app/model/dto/share';
import { TagService } from 'src/app/services/database/tag.service';
import { Share } from 'src/app/model/share';
import { List } from 'immutable';
import { Console } from 'src/app/utils/console';
import { NetworkService } from 'src/app/services/network/network.service';
import { AuthResponse } from 'src/app/services/auth/auth-response';
import { firstTimeout } from 'src/app/utils/rxjs/first-timeout';
import L from 'leaflet';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { ErrorService } from 'src/app/services/progress/error.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { SearchTrailsHeaderComponent } from 'src/app/components/search-trails-header/search-trails-header.component';
import { SearchResult } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { TrailMenuService } from 'src/app/services/database/trail-menu.service';

@Component({
    selector: 'app-trails-page',
    templateUrl: './trails.page.html',
    styleUrls: ['./trails.page.scss'],
    imports: [
        CommonModule,
        HeaderComponent,
        TrailsAndMapComponent,
        SearchTrailsHeaderComponent,
    ]
})
export class TrailsPage extends AbstractPage {

  @Input() trailsType?: string;
  @Input() trailsId?: string;
  @Input() trailsFrom?: string;

  title$ = new BehaviorSubject<string>('');
  trails$ = new BehaviorSubject<List<Trail>>(List());
  actions: MenuItem[] = [];

  viewId?: string;

  searching = false;
  canSearch = false;
  searchMessage?: string;

  private readonly _trailsAndMap$ = new BehaviorSubject<TrailsAndMapComponent | undefined>(undefined);

  @ViewChild('trailsAndMap', { read: TrailsAndMapComponent }) set trailsAndMap(v: TrailsAndMapComponent) { this._trailsAndMap$.next(v); }

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
  ) {
    super(injector);
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
      default: this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
    }
  }

  private initCollection(collectionUuid: string): void {
    // title is collection name, or default
    this.byState.add(this.injector.get(AuthService).auth$.pipe(
      filterDefined(),
      switchMap(auth => this.injector.get(TrailCollectionService).getCollection$(collectionUuid, auth.email)),
      switchMap(collection => {
        if (!collection) return this.onItemEmpty<string>(
          () => this.injector.get(TrailCollectionService).storeLoadedAndServerUpdates$(),
          auth => this.injector.get(TrailCollectionService).getCollection$(collectionUuid, auth.email)
        );
        this.viewId = 'collection-' + collection.uuid + '-' + collection.owner;
        // menu
        this.actions.splice(0, 0, ...this.injector.get(TrailCollectionService).getCollectionMenu(collection));
        if (collection.name.length > 0) return of(collection.name);
        if (collection.type === TrailCollectionType.MY_TRAILS)
          return this.i18n.texts$.pipe(map(texts => texts.my_trails));
        return of('');
      })
    ).subscribe(title => this.ngZone.run(() => this.title$.next(title))));
    // trails from collection
    this.byStateAndVisible.subscribe(
      this.injector.get(TrailService).getAll$().pipe(
        collection$items(trail => trail.collectionUuid === collectionUuid)
      ),
      trails => {
        const newList = List(trails);
        if (!newList.equals(this.trails$.value)) {
          const index = this.actions.findIndex(a => a.isSeparator());
          if (index > 0) this.actions.splice(index, this.actions.length - index);
          const addActions = this.injector.get(TrailMenuService).getTrailsMenu(trails, false, collectionUuid, true);
          if (addActions.length > 0) {
            this.actions.push(new MenuItem(), ...addActions);
          }
          this.ngZone.run(() => this.trails$.next(newList));
        }
      }
    );
  }

  private initShare(shareId: string, sharedBy: string): void {
    this.byStateAndVisible.subscribe(
      this.injector.get(ShareService).getShare$(shareId, sharedBy).pipe(
        switchMap(share => {
          if (!share) return this.onItemEmpty<{share: Share, trails: Trail[]}>(
            () => this.injector.get(ShareService).storeLoadedAndServerUpdates$(),
            () => this.injector.get(ShareService).getShare$(shareId, sharedBy),
          );
          if (share.owner === this.injector.get(AuthService).email) {
            if (share.type === ShareElementType.TRAIL)
              return this.injector.get(TrailService).getAll$().pipe(
                collection$items(),
                map(trails => trails.filter(trail => trail.owner === share.owner && share.elements.indexOf(trail.uuid) >= 0)),
                map(trails => ({share, trails}))
              );
            if (share.type === ShareElementType.COLLECTION)
              return this.injector.get(TrailService).getAll$().pipe(
                collection$items(),
                map(trails => trails.filter(trail => trail.owner === share.owner && share.elements.indexOf(trail.collectionUuid) >= 0)),
                map(trails => ({share, trails}))
              );
            return this.injector.get(TagService).getAllTrailsTags$().pipe(
              collection$items(),
              map(tags => tags.filter(tag => share.elements.indexOf(tag.tagUuid) >= 0).map(tag => tag.trailUuid)),
              switchMap(uuids => this.injector.get(TrailService).getAll$().pipe(
                collection$items(),
                map(trails => trails.filter(trail => trail.owner === share.owner && uuids.indexOf(trail.uuid) >= 0)),
                map(trails => ({share, trails}))
              ))
            )
          } else {
            return this.injector.get(TrailService).getAll$().pipe(
              collection$items(),
              map(trails => trails.filter(trail => trail.owner === share.owner && share.trails.indexOf(trail.uuid) >= 0)),
              map(trails => ({share, trails}))
            );
          }
        })
      ), (result: {share: Share, trails: Trail[]}) => {
        this.ngZone.run(() => {
          this.title$.next(result.share.name);
          const newList = List(result.trails);
          if (!newList.equals(this.trails$.value))
            this.trails$.next(newList);
          this.viewId = "share-" + result.share.uuid + "-" + result.share.owner;
          this.actions = this.injector.get(ShareService).getShareMenu(result.share);
        });
      }
    );
  }

  private initSearch(): void {
    // title
    this.byStateAndVisible.subscribe(
      this.i18n.texts$,
      i18n => this.title$.next(i18n.menu.search_trail)
    );
    this.viewId = 'search-trails';
    // search trails
    this.byStateAndVisible.subscribe(
      this._trailsAndMap$.pipe(
        switchMap(c => c ? c.map$ : of(undefined)),
        switchMap(c => c ? combineLatest([c.getState().center$, c.getState().zoom$]).pipe(debounceTime(200), map(() => c.getBounds())) : of(undefined))
      ),
      bounds => this.setSearchBounds(bounds)
    );
  }

  private searchBounds?: L.LatLngBounds;
  private setSearchBounds(bounds?: L.LatLngBounds): void {
    this.ngZone.run(() => {
      this.searchBounds = bounds;
      if (!bounds ||
        bounds.getSouthEast().distanceTo(bounds.getSouthWest()) > 100000 ||
        bounds.getSouthEast().distanceTo(bounds.getNorthEast()) > 100000
      ) {
        this.canSearch = false;
        this.searchMessage = 'pages.trails.search.needs_zoom';
      } else {
        this.canSearch = true;
        this.searchMessage = undefined;
      }
    });
  }

  doSearch(plugins: string[]): void {
    let firstResult = true;
    const fillResults = (result: SearchResult) => {
      console.log('search result', result.trails.length, result.end, result.tooManyResults);
      const newList = List(firstResult ? result.trails : [...this.trails$.value, ...result.trails]);
      firstResult = false;
      this.ngZone.run(() => {
        if (!newList.equals(this.trails$.value))
          this.trails$.next(newList);
        if (result.end) {
          this.searching = false;
          this.setSearchBounds(this.searchBounds);
        }
        if (result.tooManyResults) this.searchMessage = 'pages.trails.search.too_much_results';
      });
    };
    this.ngZone.run(() => {
      this.searching = true;
      this.canSearch = false;
      this.searchMessage = undefined;
    });
    this.injector.get(FetchSourceService).searchByArea(this.searchBounds!, 200, plugins).subscribe({ // NOSONAR
      next: result => fillResults(result),
      error: e => {
        Console.error('Error searching trails on ' + plugins.join(',') + ' with bounds', this.searchBounds, 'error', e);
        this.injector.get(ErrorService).addNetworkError(e, 'pages.trails.search.error', []);
        this.searching = false;
        this.setSearchBounds(this.searchBounds);
      }
    });
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
    this.title$.next('');
    this.trails$.next(List());
    this.actions = [];
    this.searching = false;
    this.searchMessage = undefined;
    this.canSearch = false;
  }

}
