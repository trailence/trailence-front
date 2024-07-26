import { Component } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonButton, MenuController } from "@ionic/angular/standalone";
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection, TrailCollectionType } from 'src/app/model/trail-collection';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Share } from 'src/app/model/share';
import { ShareService } from 'src/app/services/database/share.service';
import { AuthService } from 'src/app/services/auth/auth.service';

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
  sharedWithMe: Share[] = [];
  sharedByMe: Share[] = [];

  collectionsOpen = true;
  sharedWithMeOpen = false;
  sharedByMeOpen = false;

  constructor(
    public i18n: I18nService,
    public collectionService: TrailCollectionService,
    private router: Router,
    public menuController: MenuController,
    public traceRecorder: TraceRecorderService,
    shareService: ShareService,
    authService: AuthService,
  ) {
    collectionService.getAll$().pipe(
      collection$items(),
      map(list => list.sort((c1, c2) => this.compareCollections(c1, c2)))
    )
    .subscribe(list => this.collections = list);
    combineLatest([authService.auth$, shareService.getAll$().pipe(collection$items())])
    .subscribe(([auth, shares]) => {
      this.sharedByMe = shares.filter(share => share.from === auth?.email).sort((s1, s2) => this.compareShares(s1, s2));
      this.sharedWithMe = shares.filter(share => share.to === auth?.email).sort((s1, s2) => this.compareShares(s1, s2));
    });
  }

  private compareCollections(c1: TrailCollection, c2: TrailCollection): number {
    if (c1.type === TrailCollectionType.MY_TRAILS) return -1;
    if (c2.type === TrailCollectionType.MY_TRAILS) return 1;
    return c1.name.localeCompare(c2.name, this.i18n.textsLanguage);
  }

  private compareShares(s1: Share, s2: Share): number {
    return s2.createdAt - s1.createdAt;
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
