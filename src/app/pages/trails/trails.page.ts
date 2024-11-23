import { Component, Injector, Input } from '@angular/core';
import { AbstractPage } from 'src/app/utils/component-utils';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { BehaviorSubject, EMPTY, filter, map, of, switchMap } from 'rxjs';
import { Router } from '@angular/router';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
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

  title$ = new BehaviorSubject<string>('');
  trails$ = new BehaviorSubject<List<Trail>>(List());
  actions: MenuItem[] = [];

  viewId?: string;
  shown: any;

  constructor(
    injector: Injector,
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
          if (!collection) {
            if (this.shown && this.shown instanceof TrailCollection) {
              // collection has been removed
              this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
            }
            return EMPTY;
          }
          this.shown = collection;
          this.viewId = 'collection-' + collection.uuid + '-' + collection.owner;
          // menu
          this.actions = this.injector.get(TrailCollectionService).getCollectionMenu(collection);
          if (collection.name.length > 0) return of(collection.name);
          if (collection.type === TrailCollectionType.MY_TRAILS)
            return this.injector.get(I18nService).texts$.pipe(map(texts => texts.my_trails));
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
        this.injector.get(ShareService).getAll$().pipe(
          collection$items(),
          map(shares => shares.find(share => share.id === newState.id && share.from === newState.from)),
          switchMap(share => {
            if (!share) return of({share, trails: [] as Trail[]});
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
                  map(trails => trails.filter(trail => trail.owner === share.from && uuids.indexOf(trail.uuid) >= 0)),
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
        ), (result: {share: Share | undefined, trails: Trail[]}) => {
          this.ngZone.run(() => {
            if (!result.share) {
              Console.warn('Share not found, redirecting to home');
              if (this.shown && this.shown instanceof Share) {
                // share has been removed
                this.injector.get(Router).navigateByUrl('/');
              }
              return;
            }
            this.title$.next(result.share.name);
            const newList = List(result.trails);
            if (!newList.equals(this.trails$.value))
              this.trails$.next(newList);
            this.viewId = "share-" + result.share.id + "-" + result.share.from;
            this.shown = result.share;
            this.actions = this.injector.get(ShareService).getShareMenu(result.share);
          });
        });
    } else {
      this.ngZone.run(() => this.injector.get(Router).navigateByUrl('/'));
    }
  }

  private reset(): void {
    this.viewId = undefined;
    this.title$.next('');
    this.trails$.next(List());
    this.actions = [];
    this.shown = undefined;
  }

}
