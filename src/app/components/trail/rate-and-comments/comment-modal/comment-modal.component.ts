import { NgClass } from '@angular/common';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonLabel, IonToolbar, IonTitle, IonContent, IonFooter, IonButtons, IonButton, IonIcon, IonTextarea, ModalController, IonSpinner } from "@ionic/angular";
import { AuthService } from '@trailence/services/auth/auth.service';
import { FeedbackService } from '@trailence/services/feedback/feedback.service';
import { I18nService } from '@trailence/services/i18n/i18n.service';
import { ErrorService } from '@trailence/services/progress/error.service';

@Component({
  templateUrl: './comment-modal.component.html',
  styleUrl: './comment-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonSpinner, IonIcon, IonButton, IonButtons, IonFooter, IonContent, IonTitle, IonToolbar, IonLabel, IonHeader, IonTextarea,
    FormsModule,
    NgClass,
  ]
})
export class CommentModal {

  @Input() trailUuid!: string;
  @Input() rate?: number;
  comment = '';

  sending = false;

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly service: FeedbackService,
    private readonly errorService: ErrorService,
    private readonly authService: AuthService,
  ) {}

  setRate(rate: number): void {
    this.rate = rate;
  }

  validate(): boolean {
    return this.rate !== undefined || this.comment.trim().length > 5;
  }

  ok(): void {
    this.service.sendFeedback(this.trailUuid, this.rate, this.comment).subscribe({
      complete: () => {
        this.modalController.dismiss(undefined, 'send');
        if (this.rate !== undefined) {
          this.authService.auth!.nbRates ??= 0;
          this.authService.auth!.nbRates++;
        }
        if (this.comment.trim().length > 0) {
          this.authService.auth!.nbComments ??= 0;
          this.authService.auth!.nbComments++;
        }
      },
      error: e => {
        this.sending = false;
        this.errorService.addNetworkError(e, 'pages.trail.sections.comments.rate.modal.send_error', []);
      }
    });
  }

  cancel(): void {
    this.modalController.dismiss(undefined, 'cancel');
  }

}
