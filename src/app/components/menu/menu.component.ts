import { Component } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon } from "@ionic/angular/standalone";
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { combineLatest, map, mergeMap, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
  ]
})
export class MenuComponent {

  collections: TrailCollection[] = [];

  constructor(
    public i18n: I18nService,
    collectionService: TrailCollectionService,
    private router: Router,
  ) {
    collectionService.getAll$().values$.pipe(
      mergeMap(items$ => items$.length === 0 ? of([]) : combineLatest(items$)),
      map(list => list.filter(item => !!item) as TrailCollection[])
    )
    .subscribe(
      list => {
        // TODO sort
        this.collections = list;
      }
    );
  }

  goTo(url: string): void {
    this.router.navigateByUrl(url);
  }

}
