import { Component, ViewChild } from '@angular/core';
import { MessagesService } from '../../services/messages.service';
import { TableColumn, TableSettings } from '../../components/table/table-settings';
import { PageRequest } from '../../components/paginator/page-request';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TableComponent } from '../../components/table/table.component';
import { ContactMessageDto } from '../../model/contact-message';
import { IonButton, ModalController } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { ErrorService } from 'src/app/services/progress/error.service';
import { Console } from 'src/app/utils/console';

@Component({
  templateUrl: './messages.page.html',
  styleUrl: './messages.page.scss',
  imports: [
    CommonModule,
    TableComponent,
    IonButton,
  ]
})
export class AdminMessagesPage {

  @ViewChild(TableComponent) table?: TableComponent;

  constructor(
    public readonly i18n: I18nService,
    private readonly messagesService: MessagesService,
    private readonly errorService: ErrorService,
    private readonly modalController: ModalController,
  ) {}

  styleProvider = (message: ContactMessageDto) => ({
    'font-weight': message.read ? 'normal' : 'bold'
  });

  tableSettings = new TableSettings(
    [
      new TableColumn('admin.messages.date').withSortableField('sentAt', date => this.i18n.timestampToDateTimeString(date)).styleFromRowData(this.styleProvider),
      new TableColumn('admin.messages.from').withSortableField('email').styleFromRowData(this.styleProvider),
      new TableColumn('admin.messages.type').withSortableField('type', type => this.i18n.texts.pages.contact.types[type]).styleFromRowData(this.styleProvider),
      new TableColumn('admin.messages.message').withField('message', msg => msg.length < 200 ? msg : msg.substring(0, 200) + '...'),
    ],
    (request: PageRequest) => this.messagesService.getMessages(request),
    'admin.messages.error'
  ).withSelectable(() => true);

  async openMessage(message: ContactMessageDto) {
    const module = await import('./message-popup/message-popup.component')
    const modal = await this.modalController.create({
      component: module.MessagePopupComponent,
      componentProps: {
        message
      }
    });
    await modal.present();
    if (!message.read) this.messagesService.markAsRead([message], true).subscribe();
    await modal.onDidDismiss();
    this.table?.refreshData();
  }

  selection: ContactMessageDto[] = [];

  nbSelectedWithRead(read: boolean): number {
    return this.selection.filter(m => m.read === read).length;
  }

  markAsRead(read: boolean): void {
    this.messagesService.markAsRead(this.selection, read).subscribe({
      complete: () => {
        this.table?.refreshData();
      },
      error: e => {
        Console.error(e);
        this.errorService.addNetworkError(e, 'admin.messages.error', []);
      }
    });
  }

  deleteMessages(): void {
    this.messagesService.deleteMessages(this.selection).subscribe({
      complete: () => {
        this.table?.refreshData();
      },
      error: e => {
        Console.error(e);
        this.errorService.addNetworkError(e, 'admin.messages.error', []);
      }
    });
  }

}
