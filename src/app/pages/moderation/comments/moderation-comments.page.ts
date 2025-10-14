import { ChangeDetectorRef, Component } from '@angular/core';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FeedbackToReview, ModerationService } from 'src/app/services/moderation/moderation.service';
import { Console } from 'src/app/utils/console';
import { IonSpinner, IonButton, IonIcon } from "@ionic/angular/standalone";
import { RouterLink } from '@angular/router';
import { FeedbackComponent } from 'src/app/components/trail/rate-and-comments/feedback/feedback.component';

@Component({
  selector: 'app-comments-moderation',
  templateUrl: './moderation-comments.page.html',
  styleUrl: './moderation-comments.page.scss',
  imports: [IonIcon, IonButton, IonSpinner,
    HeaderComponent, RouterLink, FeedbackComponent
  ]
})
export class ModerationCommentsPage {

  loading = false;
  toReview?: FeedbackToReview[];

  constructor(
    public readonly i18n: I18nService,
    private readonly moderationService: ModerationService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

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
