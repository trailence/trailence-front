import { Component, Injector } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Contributions, ContributionService } from 'src/app/services/contribution/contribution.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { AbstractPage } from 'src/app/utils/component-utils';
import { IonSegment, IonSegmentButton } from '@ionic/angular/standalone';
import { TrailsListComponent } from 'src/app/components/trails-list/trails-list.component';
import { MyPublicTrailsService } from 'src/app/services/database/my-public-trails.service';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { combineLatest, from, map, Observable, of, switchMap } from 'rxjs';
import { List } from 'immutable';
import { Trail } from 'src/app/model/trail';
import { AsyncPipe } from '@angular/common';
import { Feedback, FeedbackService } from 'src/app/services/feedback/feedback.service';
import { TrailOverviewComponent } from 'src/app/components/trail-overview/trail-overview.component';
import { FeedbackComponent } from 'src/app/components/trail/rate-and-comments/feedback/feedback.component';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { TrackMetadataSnapshot } from 'src/app/model/snapshots';
import { TrackMetadataConfig } from 'src/app/components/track-metadata/track-metadata.component';

type ContributionTab = 'publications' | 'comments' | 'rates';

@Component({
  templateUrl: './my-contributions.page.html',
  styleUrl: './my-contributions.page.scss',
  imports: [
    IonSegment, IonSegmentButton,
    AsyncPipe,
    HeaderComponent,
    TrailsListComponent,
    TrailOverviewComponent,
    FeedbackComponent,
  ]
})
export class MyContributionsPage extends AbstractPage {

  tab: ContributionTab = 'publications';
  contributions?: Contributions;
  trails$?: Observable<List<Observable<Trail | null>>>;
  feedbacks$?: Observable<{trail: Trail, info: TrailInfo | undefined, metadata: TrackMetadataSnapshot | undefined, comments: Feedback[], rates: Feedback[]}[]>;

  metadataConfig: TrackMetadataConfig = {
    mergeDurationAndEstimated: true,
    showBreaksDuration: false,
    showHighestAndLowestAltitude: true,
    allowSmallOnOneLine: false,
    mayHave2Values: false,
    alwaysShowElevation: true,
    showSpeed: false,
  };

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
    private readonly authService: AuthService,
    private readonly contributionsService: ContributionService,
    private readonly myPublicTrailsService: MyPublicTrailsService,
    private readonly fetchSourceService: FetchSourceService,
    private readonly feedbackService: FeedbackService,
  ) {
    super(injector);
  }

  protected override initComponent(): void {
    this.whenVisible.subscribe(this.authService.auth$, auth => {
      this.contributions = auth ? this.contributionsService.fromAuth(auth) : undefined;
    });
    this.trails$ = this.myPublicTrailsService.myPublicTrails$.pipe(
      switchMap(ids => this.fetchSourceService.getTrailence$().pipe(
        switchMap(plugin => from(plugin.getTrails(ids.map(pair => pair.publicUuid)))),
        map(trails => List(trails.map(trail => of(trail)))),
      ))
    );
    this.feedbacks$ = this.feedbackService.getMyFeedbacks().pipe(
      switchMap(feedbacks => {
        if (feedbacks.length === 0) return of([]);
        const trailsUuids: string[] = [];
        for (const f of feedbacks) if (!trailsUuids.includes(f.trailUuid)) trailsUuids.push(f.trailUuid);
        return this.fetchSourceService.getTrailence$().pipe(
          switchMap(trailence => combineLatest([from(trailence.getTrails(trailsUuids)), from(trailence.getInfos(trailsUuids)), from(trailence.getMetadataList(trailsUuids))])),
          map(([trails, infos, metadatas]) => {
            const result: {trail: Trail, info: TrailInfo | undefined, metadata: TrackMetadataSnapshot | undefined, comments: Feedback[], rates: Feedback[]}[] = [];
            for (const feedback of feedbacks) {
              const trail = trails.find(t => t.uuid === feedback.trailUuid);
              if (!trail) continue;
              const info = infos.find(i => i.uuid === trail.uuid)?.info;
              const metadata = metadatas.find(m => m.uuid === trail.uuid);
              let f = result.find(t => t.trail.uuid === trail.uuid);
              if (!f) {
                f = {trail, info, metadata, comments: [], rates: []};
                result.push(f);
              }
              if (feedback.comment !== undefined && feedback.comment !== null)
                f.comments.push(feedback);
              if (feedback.rate !== undefined && feedback.rate !== null)
                f.rates.push(feedback);
            }
            return result;
          })
        );
      })
    );
  }

  setTab(tab: any): void {
    this.tab = tab;
    this.changesDetection.detectChanges();
  }

}
