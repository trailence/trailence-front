import { Injectable, Injector } from '@angular/core';
import { ModalController } from '@ionic/angular';
import Trailence from '../trailence.service';
import { ConsoleLevel, getLogHistory, LogLine } from '@trailence/utils/console';

@Injectable({providedIn: 'root'})
export class DebugService {

  constructor(
    private readonly injector: Injector,
  ) {}

  openPopup(): void {
    void import('./debug-popup.component')
    .then(c => this.injector.get(ModalController).create({
      component: c.DebugPopup,
      cssClass: 'full-screen'
    }))
    .then(m => m.present());
  }

  getAllLogs(): Promise<LogLine[]> {
    let logs = getLogHistory();
    return new Promise<LogLine[]>((resolve) => {
      Trailence.getLogs(msg => {
        let previousDate = 0;
        for (const line of msg.lines) {
          const log = DebugService.parseLogCat(line, previousDate);
          logs.push(log);
          previousDate = log.context.date;
        }
        if (msg.end) {
          logs.sort((l1, l2) => l1.context.date - l2.context.date);
          resolve(logs);
        }
      });
    });
  }

  private static parseLogCat(line: string, previousDate: number): LogLine {
    let s = line;
    let level = ConsoleLevel.INFO;
    let date = previousDate;
    let logger = '';
    let i = s.indexOf(' ');
    if (i > 0) {
      i = s.indexOf(' ', i + 1);
      if (i > 0) {
        try {
          date = new Date(s.substring(0, i).trim()).getTime();
          s = s.substring(i + 1).trim();
        } catch (e) { /* ignore */ }
      }
    }
    i = s.indexOf('/');
    if (i === 1) {
      switch (s.charAt(0)) {
        case 'E': level = ConsoleLevel.ERROR; break;
        case 'W': level = ConsoleLevel.WARN; break;
        case 'I': level = ConsoleLevel.INFO; break;
        case 'D': level = ConsoleLevel.DEBUG; break;
        default: i = -1;
      }
      if (i > 0) s = s.substring(i + 1);
    }
    i = s.indexOf(': ');
    if (i > 0) {
      logger = s.substring(0, i);
      s = s.substring(i + 2);
    }
    return {log: s, context: {date, level, logger}};
  }

}
