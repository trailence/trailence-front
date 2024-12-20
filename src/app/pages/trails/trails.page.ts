import { Component, Injector, Input } from '@angular/core';
import { AbstractPage } from 'src/app/utils/component-utils';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { BehaviorSubject, EMPTY, filter, map, of, switchMap, combineLatest, Observable, debounceTime, catchError, timer } from 'rxjs';
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
import { BrowserService } from 'src/app/services/browser/browser.service';
import L from 'leaflet';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { IonSpinner } from '@ionic/angular/standalone';
import { ErrorService } from 'src/app/services/progress/error.service';

@Component({
    selector: 'app-trails-page',
    templateUrl: './trails.page.html',
    styleUrls: ['./trails.page.scss'],
    imports: [
        CommonModule,
        HeaderComponent,
        TrailsAndMapComponent,
        IonSpinner,
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
    if (newState.type === 'collection') {
      // title is collection name, or default
      this.byState.add(this.injector.get(AuthService).auth$.pipe(
        filter(auth => !!auth),
        switchMap(auth => this.injector.get(TrailCollectionService).getCollection$(newState.id, auth.email)),
        switchMap(collection => {
          if (!collection) return this.onItemEmpty<string>(
            () => this.injector.get(TrailCollectionService).storeLoadedAndServerUpdates$(),
            auth => this.injector.get(TrailCollectionService).getCollection$(newState.id, auth.email)
          );
          this.viewId = 'collection-' + collection.uuid + '-' + collection.owner;
          // menu
          this.actions = this.injector.get(TrailCollectionService).getCollectionMenu(collection);
          if (collection.name.length > 0) return of(collection.name);
          if (collection.type === TrailCollectionType.MY_TRAILS)
            return this.i18n.texts$.pipe(map(texts => texts.my_trails));
          return of('');
        })
      ).subscribe(title => this.ngZone.run(() => this.title$.next(title))));
      // trails from collection
      this.byStateAndVisible.subscribe(
        this.injector.get(TrailService).getAll$().pipe(
          collection$items(trail => trail.collectionUuid === newState.id)
        ),
        trails => {
          const newList = List(trails);
          if (!newList.equals(this.trails$.value))
            this.ngZone.run(() => this.trails$.next(newList));
        }
      );
    } else if (newState.type === 'share') {
      this.byStateAndVisible.subscribe(
        this.injector.get(ShareService).getShare$(newState.id, newState.from).pipe(
          switchMap(share => {
            if (!share) return this.onItemEmpty<{share: Share, trails: Trail[]}>(
              () => this.injector.get(ShareService).storeLoadedAndServerUpdates$(),
              () => this.injector.get(ShareService).getShare$(newState.id, newState.from),
            );
            if (share.from === this.injector.get(AuthService).email) {
              if (share.type === ShareElementType.TRAIL)
                return this.injector.get(TrailService).getAll$().pipe(
                  collection$items(),
                  map(trails => trails.filter(trail => trail.owner === share.from && share.elements.indexOf(trail.uuid) >= 0)),
                  map(trails => ({share, trails}))
                );
              if (share.type === ShareElementType.COLLECTION)
                return this.injector.get(TrailService).getAll$().pipe(
                  collection$items(),
                  map(trails => trails.filter(trail => trail.owner === share.from && share.elements.indexOf(trail.collectionUuid) >= 0)),
                  map(trails => ({share, trails}))
                );
              return this.injector.get(TagService).getAllTrailsTags$().pipe(
                collection$items(),
                map(tags => tags.filter(tag => share.elements.indexOf(tag.tagUuid) >= 0).map(tag => tag.trailUuid)),
                switchMap(uuids => this.injector.get(TrailService).getAll$().pipe(
                  collection$items(),
                  map(trails => trails.filter(trail => trail.owner === share.from && uuids.indexOf(trail.uuid) >= 0)), // NOSONAR
                  map(trails => ({share, trails}))
                ))
              )
            } else {
              return this.injector.get(TrailService).getAll$().pipe(
                collection$items(),
                map(trails => trails.filter(trail => trail.owner === share.from && share.trails.indexOf(trail.uuid) >= 0)),
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
            this.viewId = "share-" + result.share.id + "-" + result.share.from;
            this.actions = this.injector.get(ShareService).getShareMenu(result.share);
          });
        });
    } else if (newState.type === 'search') {
      // title
      this.byStateAndVisible.subscribe(
        this.i18n.texts$,
        i18n => this.title$.next(i18n.menu.search_trail)
      );
      this.viewId = 'search-trails';
      // search trails
      let previousSearch: L.LatLngBounds | undefined = undefined;
      this.byStateAndVisible.subscribe(
        timer(1000).pipe(
          switchMap(() => this.injector.get(BrowserService).hash$),
          debounceTime(1000),
          switchMap(hash => {
            this.ngZone.run(() => this.searching = true);
            const coords = hash.get('bounds')?.split(',');
            if (coords?.length !== 4) {
              previousSearch = undefined;
              return of([] as Trail[]);
            }
            const bounds = L.latLngBounds(
              {lat: parseFloat(coords[0]), lng: parseFloat(coords[3])},
              {lat: parseFloat(coords[2]), lng: parseFloat(coords[1])}
            );
            if (previousSearch?.equals(bounds)) {
              this.ngZone.run(() => this.searching = false);
              return EMPTY;
            }
            if (bounds.getSouthEast().distanceTo(bounds.getSouthWest()) > 100000 ||
                bounds.getSouthEast().distanceTo(bounds.getNorthEast()) > 100000) {
                  previousSearch = undefined;
                  return of([] as Trail[]);
                }
            previousSearch = bounds;
            return this.injector.get(FetchSourceService).searchByArea(bounds);
          }),
          catchError(e => {
            Console.error('Error searching trails', e);
            this.injector.get(ErrorService).addNetworkError(e, 'pages.trails.search_error', []);
            this.searching = false;
            return EMPTY;
          })
        ),
        trails => {
          const newList = List(trails);
          this.ngZone.run(() => {
            if (!newList.equals(this.trails$.value))
              this.trails$.next(newList);
            this.searching = false;
          });
        }
      )

    } else {
      this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
    }
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
  }

}
