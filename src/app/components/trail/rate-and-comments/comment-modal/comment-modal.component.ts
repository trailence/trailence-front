import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonLabel, IonToolbar, IonTitle, IonContent, IonFooter, IonButtons, IonButton, IonIcon, IonTextarea, ModalController, IonSpinner } from "@ionic/angular/standalone";
import { FeedbackService } from 'src/app/services/feedback/feedback.service';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ErrorService } from 'src/app/services/progress/error.service';

@Component({
  templateUrl: './comment-modal.component.html',
  styleUrl: './comment-modal.component.scss',
  imports: [IonSpinner,
    IonIcon, IonButton, IonButtons, IonFooter, IonContent, IonTitle, IonToolbar, IonLabel, IonHeader, IonTextarea,
    CommonModule, FormsModule,
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
