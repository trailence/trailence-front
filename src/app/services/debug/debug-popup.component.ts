import { Component, OnInit } from '@angular/core';
import { DebugService } from './debug.service';
import { ModalController } from '@ionic/angular/standalone';

@Component({
  templateUrl: './debug-popup.component.html',
  styleUrl: './debug-popup.component.scss',
  imports: []
})
export class DebugPopup implements OnInit {

  constructor(
    private readonly debugService: DebugService,
    private readonly modalController: ModalController,
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  private _refreshing = false;
  refresh(): void {
    const element = document.getElementById('debug-logs-textarea') as HTMLTextAreaElement | null;
    if (!element) {
      setTimeout(() => this.refresh(), 100);
      return;
    }
    if (this._refreshing) return;
    this._refreshing = true;
    this.debugService.getAllLogs().then(logs => {
      console.log('logs received', logs.length);
      element.value = logs;
      setTimeout(() => {
        element.scrollTop = element.scrollHeight;
        this._refreshing = false;
      }, 100);
    });
  }

  close(): void {
    this.modalController.dismiss();
  }

}
