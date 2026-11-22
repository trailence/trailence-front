import { Component, Injector, Input } from '@angular/core';
import { environment } from '@env/environment';
import { Trail } from '@trailence/model/trail';
import { AuthService } from '@trailence/services/auth/auth.service';
import { FeedbackService, MyFeedback } from '@trailence/services/feedback/feedback.service';
import { I18nPipe } from '@trailence/services/i18n/i18n-string';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { NetworkService } from '@trailence/services/network/network.service';
import { AbstractComponent } from '@trailence/utils/component-utils';
import { combineLatest, EMPTY, filter, switchMap } from 'rxjs';
import { IonButton } from '@ionic/angular';
import { FetchSourceService } from '@trailence/services/fetch-source/fetch-source.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-trail-followed-feedback',
  templateUrl: './followed-feedback.component.html',
  styleUrl: './followed-feedback.component.scss',
  imports: [
    IonButton,
    I18nPipe,
  ]
})
export class FollowedFeedbackComponent extends AbstractComponent {
  @Input() trail!: Trail;

  myFeedback?: MyFeedback;
  canLeaveFeedback = false;

  constructor(
    injector: Injector,
    public readonly i18n: I18nService,
    private readonly authService: AuthService,
    private readonly network: NetworkService,
    private readonly feedbackService: FeedbackService,
    private readonly fetchSourceService: FetchSourceService,
  ) {
    super(injector);
  }

  protected override getComponentState() {
    return {trail: this.trail};
  }

  protected override onComponentStateChanged(): void {
    this.myFeedback = undefined;
    this.canLeaveFeedback = false;
    const url = this.trail.followedUrl;
    if (!url?.startsWith(environment.baseUrl + '/trail/trailence/')) return;
    const followed = url.substring(environment.baseUrl.length + 17);
    this.byStateAndVisible.subscribe(
      combineLatest([this.authService.userChanged$, this.network.server$]).pipe(
        switchMap(([auth, connected]) => {
          if (!auth || auth.isAnonymous || !connected) return EMPTY;
          return this.feedbackService.getMyFeedback(followed);
        }),
      ),
      feedback => {
        this.myFeedback = feedback;
        this.changesDetection.detectChanges();
      }
    );
    this.byStateAndVisible.subscribe(
      this.authService.userChanged$.pipe(
        filter(auth => !!auth && auth.email === this.trail.owner && !auth.isAnonymous),
        switchMap(() => this.fetchSourceService.getTrailence$()),
        switchMap(trailence => trailence.ready$.pipe(
          filter(Boolean),
          switchMap(() => trailence.fetchTrailInfoByUrl(url))
        )),
      ),
      info => {
        this.canLeaveFeedback = !!info && !info.itsMine;
        this.changesDetection.detectChanges();
      }
    );
  }

  rateThisTrail(): void {
    void this.injector.get(Router).navigate([this.trail.followedUrl!.substring(environment.baseUrl.length)], {fragment: 'rate'});
  }

}
