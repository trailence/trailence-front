import { Component } from '@angular/core';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonIcon, IonButton, MenuController, IonBadge } from "@ionic/angular/standalone";
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { combineLatest, map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';
import { collection$items } from 'src/app/utils/rxjs/collection$items';
import { Share } from 'src/app/model/share';
import { ShareService } from 'src/app/services/database/share.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { UpdateService } from 'src/app/services/update/update.service';
import { List } from 'immutable';
import { trailenceAppVersionName } from 'src/app/trailence-version';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';

@Component({
    selector: 'app-menu',
    templateUrl: './menu.component.html',
    styleUrls: ['./menu.component.scss'],
    imports: [IonBadge, IonButton,
        CommonModule,
        IonIcon,
    ]
})
export class MenuComponent {

  versionName = trailenceAppVersionName;

  collections: List<TrailCollection> = List();
  sharedWithMe: List<Share> = List();
  sharedByMe: List<Share> = List();

  collectionsOpen = true;
  sharedWithMeOpen = false;
  sharedByMeOpen = false;

  isAdmin = false;

  constructor(
    public readonly i18n: I18nService,
    public readonly collectionService: TrailCollectionService,
    private readonly router: Router,
    public readonly menuController: MenuController,
    public readonly traceRecorder: TraceRecorderService,
    shareService: ShareService,
    authService: AuthService,
    public readonly update: UpdateService,
    public readonly fetchSourceService: FetchSourceService,
  ) {
    collectionService.getAll$().pipe(
      collection$items(),
      map(list => collectionService.sort(list))
    )
    .subscribe(list => this.collections = List(list));
    combineLatest([authService.auth$, shareService.getAll$().pipe(collection$items())])
    .subscribe(([auth, shares]) => {
      this.sharedByMe = List(shares.filter(share => share.from === auth?.email).sort((s1, s2) => this.compareShares(s1, s2)));
      this.sharedWithMe = List(shares.filter(share => share.to === auth?.email).sort((s1, s2) => this.compareShares(s1, s2)));
      this.isAdmin = !!auth?.admin;
    });
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
        this.goTo('/trail/' + trace.followingTrailOwner! + '/' + trace.followingTrailUuid);
      } else {
        this.goTo('/trail');
      }
    } else {
      this.traceRecorder.start();
      this.goTo('/trail');
    }
  }

  async close(trial: number = 1) {
    if (!await this.menuController.close()) {
      console.log('App Menu not closed ! trial ', trial);
      if (trial <= 5)
        setTimeout(() => this.close(trial + 1), 200);
    }
  }

}
