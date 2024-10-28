import { Injectable, Injector, NgZone } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { TrailService } from './trail.service';
import { combineLatest, filter, first, Observable, of, switchMap } from 'rxjs';
import { TagService } from './tag.service';
import { TrackService } from './track.service';
import { DatabaseService } from './database.service';
import { NetworkService } from '../network/network.service';
import { Console } from 'src/app/utils/console';

@Injectable({
  providedIn: 'root'
})
export class DatabaseCleanupService {

  constructor(private readonly injector: Injector) {
    let timeout: any = undefined;
    let email: string | undefined = undefined;
    injector.get(NgZone).runOutsideAngular(() => {
      injector.get(AuthService).auth$.subscribe(
        auth => {
          if (!auth || auth.email !== email) {
            if (timeout) clearTimeout(timeout);
            timeout = undefined;
            email = undefined;
          }
          if (auth) {
            email = auth.email;
            const lastCleanStr = localStorage.getItem('trailence.db-cleaning.last-time.' + email);
            const lastCleanTime = lastCleanStr ? parseInt(lastCleanStr) : undefined;
            const nextCleanTime = lastCleanTime && !isNaN(lastCleanTime) ? lastCleanTime + 24 * 60 * 60 * 1000 : Date.now() + 60000;
            if (timeout) clearTimeout(timeout);
            const nextTimeout = Math.max(nextCleanTime - Date.now(), 60000);
            Console.info('Next database cleaning at', new Date(Date.now() + nextTimeout));
            timeout = setTimeout(() => {
              this.doCleaning(email!).subscribe((done) => {
                if (email === auth.email && done) {
                  Console.info('Database cleaned, next cleaning in 24 hours');
                  localStorage.setItem('trailence.db-cleaning.last-time.' + email, '' + Date.now());
                }
              });
            }, nextTimeout);
          }
        }
      );
    });
  }

  private doCleaning(email: string): Observable<boolean> {
    const dbService = this.injector.get(DatabaseService);
    const db = dbService.db;
    if (!db) return of(false);
    return combineLatest([dbService.hasLocalChanges, dbService.lastSync, dbService.syncStatus, this.injector.get(NetworkService).server$]).pipe(
      filter(([localChanges, lastSync, syncing, connected]) => !localChanges && !!lastSync && Date.now() - lastSync < 15 * 60 * 1000 && !syncing && connected),
      first(),
      switchMap(() => {
        if (db !== dbService.db || email !== dbService.email) return of(false);
        Console.info('Cleaning database...');
        return this.injector.get(TrailService).cleanDatabase(db, email).pipe(
          switchMap(() => {
            if (db !== dbService.db || email !== dbService.email) return of(false);
            return this.injector.get(TagService).cleanDatabase(db, email);
          }),
          switchMap(() => {
            if (db !== dbService.db || email !== dbService.email) return of(false);
            return this.injector.get(TrackService).cleanDatabase(db, email);
          }),
        );
      })
    );
  }

}
