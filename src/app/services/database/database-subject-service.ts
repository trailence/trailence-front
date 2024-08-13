import { Injectable, NgZone } from '@angular/core';
import { DatabaseSubject } from './database-subject';

@Injectable({providedIn: 'root'})
export class DatabaseSubjectService {

  constructor(
    ngZone: NgZone
  ) {
    ngZone.runOutsideAngular(() => {
      setInterval(() => this.clean(), 30000);
    });
  }

  private subjects: DatabaseSubject<any>[] = [];

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
    let count = 0;
    for (const subject of subjects) if (subject.clean()) count++;
    if (count > 0) console.log('Items unloaded from memory: ' + count);
  }

}
