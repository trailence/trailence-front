import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { Feedback, FeedbackService } from 'src/app/services/feedback/feedback.service';
import { TrailInfo } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { RateComponent } from './rate/rate.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';
import { ProgressBarComponent } from '../../progress-bar/progress-bar.component';
import { IonButton, ModalController, IonSpinner, IonIcon } from "@ionic/angular/standalone";
import { AuthService } from 'src/app/services/auth/auth.service';
import { FeedbackComponent } from './feedback/feedback.component';
import { combineLatest, EMPTY, Subscription, switchMap, tap } from 'rxjs';
import { NetworkService } from 'src/app/services/network/network.service';

@Component({
  selector: 'app-rate-and-comments',
  templateUrl: './rate-and-comments.component.html',
  styleUrl: './rate-and-comments.component.scss',
  imports: [IonIcon, IonSpinner,
    IonButton,
    CommonModule,
    RateComponent,
    I18nPipe,
    ProgressBarComponent,
    FeedbackComponent,
  ]
})
export class RateAndCommentsComponent implements OnChanges, OnDestroy {

  @Input() trail?: Trail;

  info?: TrailInfo;
  feedbacks?: Feedback[];
  myRate: number | null | undefined = undefined;
  lastPage = true;
  loadingComments = false;
  filterRate?: number;
  authenticated = false;
  connected = false;

  private myRateSubscription?: Subscription;

  constructor(
    public readonly i18n: I18nService,
    private readonly fetchService: FetchSourceService,
    private readonly feedbackService: FeedbackService,
    private readonly modalController: ModalController,
    private readonly authService: AuthService,
    private readonly networkService: NetworkService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['trail']) {
      this.myRate = undefined;
      this.myRateSubscription?.unsubscribe();
      this.myRateSubscription = undefined;
      if (this.trail) {
        this.myRateSubscription =
          combineLatest([this.authService.auth$, this.networkService.server$]).pipe(
            switchMap(([auth, connected]) => {
              this.authenticated = !!auth && !auth.isAnonymous;
              this.connected = connected;
              if (this.authenticated && this.connected && this.trail)
                return this.feedbackService.getMyFeedback(this.trail.uuid);
              return EMPTY;
            })
          ).subscribe(mine => {
            this.myRate = mine.rate ?? null;
            this.changeDetector.detectChanges();
          });
        this.refreshInfo();
        this.resetComments();
      }
    }
  }

  ngOnDestroy(): void {
    this.myRateSubscription?.unsubscribe();
  }

  private refreshInfo(): void {
    if (this.trail) {
      this.fetchService.getTrailInfo$(this.trail.owner, this.trail.uuid).subscribe(info => {
        this.info = info ?? undefined;
        this.changeDetector.detectChanges();
      });
    }
  }

  private resetComments(): void {
    if (this.trail?.owner === 'trailence') {
      this.filterRate = undefined;
      this.loadingComments = true;
      this.feedbackService.getFeedbacks(this.trail.uuid, 0, []).subscribe(list => {
        this.feedbacks = list;
        this.lastPage = list.length < 25;
        this.loadingComments = false;
        this.changeDetector.detectChanges();
      });
    }
  }

  feedbackChanged(before: Feedback, after: Feedback | null): void {
    if (after === null) {
      const index = this.feedbacks?.indexOf(before) ?? -1;
      if (index < 0) return;
      this.feedbacks!.splice(index, 1);
      this.changeDetector.detectChanges();
    }
  }

  setFilterRate(filter?: number): void {
    if (this.filterRate === filter || !this.trail) return;
    this.filterRate = filter;
    this.loadingComments = true;
    this.feedbackService.getFeedbacks(this.trail.uuid, 0, [], filter).subscribe(list => {
      this.feedbacks = list;
      this.lastPage = list.length < 25;
      this.loadingComments = false;
      this.changeDetector.detectChanges();
    });
  }

  loadMoreComments(): void {
    const lastDate = this.feedbacks ? this.feedbacks[this.feedbacks.length - 1].date : 0;
    const exclude = this.feedbacks ? this.feedbacks.filter(f => f.date === lastDate).map(f => f.uuid) : [];
    this.lastPage = true;
    this.loadingComments = true;
    this.changeDetector.detectChanges();
    this.feedbackService.getFeedbacks(this.trail!.uuid, lastDate, exclude, this.filterRate).subscribe(list => {
      this.feedbacks = [...(this.feedbacks ?? []), ...list];
      this.lastPage = list.length < 25;
      this.loadingComments = false;
      this.changeDetector.detectChanges();
    });
  }

  async openCommentModal() {
    if (!this.trail) return;
    const module = await import('./comment-modal/comment-modal.component');
    const modal = await this.modalController.create({
      component: module.CommentModal,
      componentProps: {
        trailUuid: this.trail.uuid,
        rate: this.myRate ?? undefined,
      }
    });
    await modal.present();
    const result = await modal.onDidDismiss();
    if (result.role !== 'cancel') {
      this.refreshInfo();
      this.resetComments();
    }
  }

}
