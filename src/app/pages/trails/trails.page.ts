import { Component, Injector, Input } from '@angular/core';
import { AbstractPage } from 'src/app/utils/component-utils';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { BehaviorSubject, EMPTY, Observable, filter, map, of, switchMap } from 'rxjs';
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

@Component({
  selector: 'app-trails-page',
  templateUrl: './trails.page.html',
  styleUrls: ['./trails.page.scss'],
  standalone: true,
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
  trails$ = new BehaviorSubject<Trail[]>([]);
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
      this.injector.get(TrailCollectionService).getMyTrails$().subscribe(
        myTrails => this.injector.get(Router).navigateByUrl('/trails/collection/' + myTrails!.uuid)
      );
      return;
    }
    this.reset();
    if (newState.type === 'collection') {
      // title is collection name, or default
      this.byState.add(this.injector.get(AuthService).auth$.pipe(
        filter(auth => !!auth),
        switchMap(auth => this.injector.get(TrailCollectionService).getCollection$(newState.id, auth!.email)),
        switchMap(collection => {
          if (!collection) {
            if (this.shown && this.shown instanceof TrailCollection) {
              // collection has been removed
              this.injector.get(Router).navigateByUrl('/');
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
      ).subscribe(title => this.title$.next(title)));
      // trails from collection
      this.byStateAndVisible.subscribe(
        this.injector.get(TrailService).getAll$().pipe(
          collection$items(trail => trail.collectionUuid === newState.id)
        ),
        trails => this.trails$.next(trails)
      );
    } else {
      this.injector.get(Router).navigateByUrl('/');
    }
  }

  private reset(): void {
    this.viewId = undefined;
    this.title$.next('');
    this.trails$.next([]);
    this.actions = [];
    this.shown = undefined;
  }

}
