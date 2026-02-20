import { Injectable, Injector } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { Console, ConsoleLevel } from 'src/app/utils/console';
import Trailence from '../trailence.service';

@Injectable({providedIn: 'root'})
export class DebugService {

  constructor(
    private readonly injector: Injector,
  ) {}

  openPopup(): void {
    import('./debug-popup.component')
    .then(c => this.injector.get(ModalController).create({
      component: c.DebugPopup
    }))
    .then(m => m.present());
  }

  getAllLogs(): Promise<string> {
    let logs = Console.getHistoryLines();
    let previousDate: number | undefined;
    return new Promise<string>((resolve) => {
      Trailence.getLogs(msg => {
        for (const line of msg.lines) {
          let s = line;
          let level: ConsoleLevel = ConsoleLevel.INFO;
          let date: number | undefined = previousDate;
          let i = s.indexOf(' ');
          if (i > 0) {
            i = s.indexOf(' ', i + 1);
            if (i > 0) {
              try {
                date = new Date(s.substring(0, i).trim()).getTime();
                s = s.substring(i + 1).trim();
              } catch (e) {}
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
          logs.push({log: line, date: date || 0, level});
          previousDate = date;
        }
        if (msg.end) {
          logs.sort((l1, l2) => l1.date - l2.date);
          resolve(logs.map(l => l.log).join('\n'));
        }
      });
    });
  }

}
