import { Injectable, NgZone } from '@angular/core';
import { DatabaseSubject } from './database-subject';
import { Maps } from 'src/app/utils/maps';

@Injectable({providedIn: 'root'})
export class DatabaseSubjectService {

  constructor(
    ngZone: NgZone
  ) {
    ngZone.runOutsideAngular(() => {
      setInterval(() => this.clean(), 30000);
    });
  }

  private readonly subjects: DatabaseSubject<any>[] = [];

  public register(subject: DatabaseSubject<any>) {
    const index = this.subjects.indexOf(subject);
    if (index < 0) this.subjects.push(subject);
  }

  public unregister(subject: DatabaseSubject<any>): void {
    const index = this.subjects.indexOf(subject);
    if (index >= 0) this.subjects.splice(index, 1);
  }

  private clean(): void {
    const subjects = [...this.subjects];
    let totalCount = 0;
    const countByType = new Map<string | undefined, number>();
    for (const subject of subjects) {
      if (subject.clean()) {
        totalCount++;
        Maps.increment(subject.type, countByType);
      }
    }
    if (totalCount > 0) {
      let msg = 'Items unloaded from memory: ' + totalCount + ' (';
      for (const entry of countByType.entries()) {
        msg += entry[1] + ' ' + (entry[0] ?? '?') + ';';
      }
      msg += ')';
      console.log(msg);
    }
  }

}
