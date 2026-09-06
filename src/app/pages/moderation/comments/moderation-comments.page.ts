import { ChangeDetectorRef, Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { HeaderComponent } from '@trailence/components/header/header.component';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { FeedbackToReview, ModerationService } from '@trailence/services/moderation/moderation.service';
import { Console } from '@trailence/utils/console';
import { IonSpinner, IonButton, IonIcon } from "@ionic/angular";
import { RouterLink } from '@angular/router';
import { FeedbackComponent } from '@trailence/components/trail/rate-and-comments/feedback/feedback.component';

@Component({
  selector: 'app-comments-moderation',
  templateUrl: './moderation-comments.page.html',
  styleUrl: './moderation-comments.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IonIcon, IonButton, IonSpinner,
    HeaderComponent, RouterLink, FeedbackComponent
  ]
})
export class ModerationCommentsPage implements OnInit {

  loading = false;
  toReview?: FeedbackToReview[];

  constructor(
    public readonly i18n: I18nService,
    private readonly moderationService: ModerationService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.toReview = undefined;
    this.moderationService.getFeedbacksToReview().subscribe({
      next: list => {
        this.loading = false;
        for (const trail of list) {
          trail.feedbacks.sort((f1, f2) => f2.date - f1.date);
          for (const f of trail.feedbacks) {
            f.replies.sort((r1, r2) => r2.date - r1.date);
          }
        }
        this.toReview = list;
        this.changeDetector.detectChanges();
      },
      error: e => {
        this.loading = false;
        Console.error('Error loading comments to review', e);
        this.changeDetector.detectChanges();
      },
    });
  }

}
