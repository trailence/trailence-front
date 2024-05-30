import { Component, Injector, Input } from '@angular/core';
import { AbstractPage } from 'src/app/utils/component-utils';
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { BehaviorSubject, EMPTY, Observable, combineLatest, filter, first, map, mergeMap, of, tap } from 'rxjs';
import { Router } from '@angular/router';
import { TrailCollectionType } from 'src/app/model/trail-collection';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
import { TrailsAndMapComponent } from 'src/app/components/trails-and-map/trails-and-map.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-trails',
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

  title$?: Observable<string>;
  trails$?: Observable<Observable<Trail | null>[]>;

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
      this.injector.get(TrailCollectionService).getAll$().pipe(
        mergeMap(collections => collections.length === 0 ? of([]) : combineLatest(collections)),
        map(collections => collections.find(collection => collection?.type === TrailCollectionType.MY_TRAILS)),
        filter(myTrails => !!myTrails),
        first()
      ).subscribe(myTrails => this.injector.get(Router).navigateByUrl('/trails/collection/' + myTrails!.uuid));
      return;
    }
    this.reset();
    if (newState.type === 'collection') {
      // title is collection name, or default
      this.title$ = this.injector.get(AuthService).auth$.pipe(
        filter(auth => !!auth),
        mergeMap(auth => this.injector.get(TrailCollectionService).getCollection$(newState.id, auth!.email)),
        mergeMap(collection => {
          if (!collection) return EMPTY;
          if (collection.name.length > 0) return of(collection.name);
          if (collection.type === TrailCollectionType.MY_TRAILS)
            return this.injector.get(I18nService).texts$.pipe(map(texts => texts.my_trails));
          return of('');
        })
      );
      // trails from collection
      this.trails$ = this.injector.get(TrailService).getAllForCollectionUuid$(newState.id);
    } else {
      this.injector.get(Router).navigateByUrl('/');
    }
  }

  private reset(): void {
    this.title$ = undefined;
    this.trails$ = undefined;
  }

}
