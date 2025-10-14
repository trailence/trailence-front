import { ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Feedback, FeedbackReply, FeedbackService } from 'src/app/services/feedback/feedback.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { RateComponent } from '../rate/rate.component';
import { IonButton, AlertController, IonTextarea } from "@ionic/angular/standalone";
import { AuthService } from 'src/app/services/auth/auth.service';
import { FormsModule } from '@angular/forms';
import { ErrorService } from 'src/app/services/progress/error.service';
import { RelativeDateComponent } from 'src/app/components/relative-date/relative-date.component';
import { ModerationService } from 'src/app/services/moderation/moderation.service';

@Component({
  selector: 'app-feedback',
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.scss',
  imports: [
    IonTextarea,
    IonButton,
    FormsModule,
    RateComponent,
    RelativeDateComponent,
  ]
})
export class FeedbackComponent {

  @Input() feedback?: Feedback;
  @Input() trailUuid?: string;
  @Output() feedbackChange = new EventEmitter<Feedback | null>();

  moderator: boolean;

  replyShown = false;
  replyText = '';
  sending = false;

  @ViewChild('replyTextArea') replyTextArea?: IonTextarea;

  constructor(
    public readonly i18n: I18nService,
    private readonly service: FeedbackService,
    authService: AuthService,
    private readonly alertController: AlertController,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly errorService: ErrorService,
    private readonly moderationService: ModerationService,
  ) {
    this.moderator = !!authService.auth?.admin || (authService.auth?.roles ?? []).includes('moderator');
  }

  reply(): void {
    this.replyShown = true;
    this.replyText = '';
    this.sending = false;
    this.changeDetector.detectChanges();
    this.focusReply(0);
  }

  focusReply(trial: number): void {
    if (!this.replyTextArea) {
      setTimeout(() => this.focusReply(trial + 1), trial * 100);
      return;
    }
    this.replyTextArea.getInputElement()
    .then(e => e.scrollIntoView({behavior: 'smooth', block: 'center'}))
    .then(() => this.replyTextArea?.setFocus());
  }

  cancelReply(): void {
    this.replyShown = false;
    this.changeDetector.detectChanges();
  }

  replyTextChanged(): void {
    this.changeDetector.detectChanges();
  }

  sendReply(): void {
    if (!this.feedback) return;
    this.sending = true;
    this.changeDetector.detectChanges();
    this.service.sendReply(this.feedback.uuid, this.replyText).subscribe({
      next: reply => {
        this.sending = false;
        this.replyShown = false;
        this.feedback!.replies.push(reply);
        this.feedbackChange.emit(this.feedback);
        this.changeDetector.detectChanges();
      },
      error: e => {
        this.sending = false;
        this.errorService.addNetworkError(e, 'pages.trail.sections.comments.reply_send_error', []);
        this.changeDetector.detectChanges();
      }
    });
  }

  delete(): void {
    if (this.feedback && this.trailUuid) {
      this.alertController.create({
        header: this.i18n.texts.pages.trail.sections.comments.delete_comment_confirmation.title,
        message: this.i18n.texts.pages.trail.sections.comments.delete_comment_confirmation.message,
        buttons: [
          { text: this.i18n.texts.buttons.confirm, role: 'confirm' },
          { text: this.i18n.texts.buttons.cancel, role: 'cancel' },
        ]
      }).then(m => {
        m.onDidDismiss().then(result => {
          if (result.role === 'confirm') {
            this.service.deleteComment(this.feedback!.uuid, this.trailUuid!).subscribe(() => this.feedbackChange.emit(null));
          }
        });
        m.present();
      });
    }
  }

  deleteReply(replyUuid: string): void {
    if (this.feedback && this.trailUuid) {
      this.alertController.create({
        header: this.i18n.texts.pages.trail.sections.comments.delete_reply_confirmation.title,
        message: this.i18n.texts.pages.trail.sections.comments.delete_reply_confirmation.message,
        buttons: [
          { text: this.i18n.texts.buttons.confirm, role: 'confirm' },
          { text: this.i18n.texts.buttons.cancel, role: 'cancel' },
        ]
      }).then(m => {
        m.onDidDismiss().then(result => {
          if (result.role === 'confirm') {
            this.service.deleteReply(replyUuid).subscribe(() => {
              const index = this.feedback!.replies.findIndex(r => r.uuid === replyUuid);
              if (index >= 0) {
                this.feedback!.replies.splice(index, 1);
                this.feedbackChange.emit(this.feedback);
                this.changeDetector.detectChanges();
              }
            });
          }
        });
        m.present();
      });
    }
  }

  feedbackReviewed(): void {
    if (!this.feedback) return;
    this.moderationService.validateFeedback(this.feedback).subscribe(f => {
      this.feedback = f;
      this.feedbackChange.emit(f);
    });
  }

  replyReviewed(reply: FeedbackReply): void {
    this.moderationService.validateFeedbackReply(reply).subscribe(r => {
      this.feedbackChange.emit(this.feedback);
    });
  }

}
