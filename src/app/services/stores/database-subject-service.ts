import { Injectable, NgZone } from '@angular/core';
import { DatabaseSubject } from './database-subject';
import { Maps } from 'src/app/utils/maps';
import { Console } from 'src/app/utils/console';

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

  public create<T>(
    type: string,
    loadItem: () => Promise<T | null>,
    unloadItem: ((item: T) => void) | undefined = undefined,
    initialValue: T | null | undefined = undefined,
  ): DatabaseSubject<T> {
    return new DatabaseSubject<T>(s => this.register(s), s => this.unregister(s), type, loadItem, unloadItem, initialValue);
  }

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
      Console.info(msg);
    }
  }

}
