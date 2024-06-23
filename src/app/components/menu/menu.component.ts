import { Component } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonButton, MenuController } from "@ionic/angular/standalone";
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { combineLatest, map, mergeMap, of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';

@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss'],
  standalone: true,
  imports: [IonButton,
    CommonModule,
    IonIcon,
  ]
})
export class MenuComponent {

  collections: TrailCollection[] = [];

  constructor(
    public i18n: I18nService,
    public collectionService: TrailCollectionService,
    private router: Router,
    public menuController: MenuController,
    public traceRecorder: TraceRecorderService,
  ) {
    collectionService.getAll$().values$.pipe(
      mergeMap(items$ => items$.length === 0 ? of([]) : combineLatest(items$)),
      map(list => (list.filter(item => !!item) as TrailCollection[]).sort((c1, c2) => this.compareCollections(c1, c2)))
    )
    .subscribe(list => this.collections = list);
  }

  private compareCollections(c1: TrailCollection, c2: TrailCollection): number {
    if (c1.type === TrailCollectionType.MY_TRAILS) return -1;
    if (c2.type === TrailCollectionType.MY_TRAILS) return 1;
    return c1.name.localeCompare(c2.name, this.i18n.textsLanguage);
  }

  goTo(url: string): void {
    this.router.navigateByUrl(url);
  }

  goToRecordTrace(): void {
    const trace = this.traceRecorder.current;
    if (trace) {
      if (trace.followingTrailUuid) {
        this.goTo('/trail/' + trace.followingTrailOwner! + '/' + trace.followingTrailUuid!);
      } else {
        this.goTo('/trail');
      }
    } else {
      this.traceRecorder.start();
      this.goTo('/trail');
    }
  }

}
