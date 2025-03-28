import { Component, Input } from '@angular/core';
import { ContactMessageDto } from 'src/app/admin/model/contact-message';
import { IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton, ModalController } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { MessagesService } from 'src/app/admin/services/messages.service';

@Component({
  templateUrl: './message-popup.component.html',
  styleUrl: './message-popup.component.scss',
  imports: [
    IonHeader, IonToolbar, IonTitle, IonLabel, IonContent, IonFooter, IonButtons, IonButton
  ]
})
export class MessagePopupComponent {

  @Input() message!: ContactMessageDto;

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    private readonly messagesService: MessagesService,
  ) {}

  close(): void {
    this.modalController.dismiss('cancel');
  }

  markAsUnread(): void {
    this.messagesService.markAsRead([this.message], false).subscribe(() => this.close());
  }

  deleteMessage(): void {
    this.messagesService.deleteMessages([this.message]).subscribe(() => this.close());
  }

}