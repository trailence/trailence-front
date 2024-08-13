import { Injectable, Injector } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { TrailService } from './trail.service';
import { combineLatest, filter, first, Observable, of, switchMap } from 'rxjs';
import { TagService } from './tag.service';
import { TrackService } from './track.service';
import { DatabaseService } from './database.service';
import { NetworkService } from '../network/network.service';

@Injectable({
  providedIn: 'root'
})
export class DatabaseCleanupService {

  constructor(private injector: Injector) {
    let timeout: any = undefined;
    let email: string | undefined = undefined;
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
          timeout = setTimeout(() => {
            this.doCleaning(email!).subscribe(() => {
              if (email === auth.email) {
                console.log('Database cleaned, next cleaning in 24 hours');
                localStorage.setItem('trailence.db-cleaning.last-time.' + email, '' + Date.now());
              }
            });
          }, Math.max(nextCleanTime - Date.now(), 60000));
        }
      }
    );
  }

  private doCleaning(email: string): Observable<any> {
    const dbService = this.injector.get(DatabaseService);
    return combineLatest([dbService.hasLocalChanges, dbService.lastSync, dbService.syncStatus, this.injector.get(NetworkService).server$]).pipe(
      filter(([localChanges, lastSync, syncing, connected]) => !localChanges && !!lastSync && Date.now() - lastSync < 15 * 60 * 1000 && !syncing && connected),
      first(),
      switchMap(() => {
        console.log('Cleaning database...');
        return this.injector.get(TrailService).cleanDatabase(email).pipe(
          switchMap(() => {
            if (this.injector.get(AuthService).email !== email) return of(false);
            return this.injector.get(TagService).cleanDatabase(email);
          }),
          switchMap(() => {
            if (this.injector.get(AuthService).email !== email) return of(false);
            return this.injector.get(TrackService).cleanDatabase(email);
          }),
        );
      })
    );
  }

}
