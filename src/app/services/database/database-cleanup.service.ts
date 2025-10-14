import { Injectable, Injector, NgZone } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { TrailService } from './trail.service';
import { combineLatest, filter, first, Observable, of, switchMap } from 'rxjs';
import { TagService } from './tag.service';
import { TrackService } from './track.service';
import { DatabaseService } from './database.service';
import { NetworkService } from '../network/network.service';
import { Console } from 'src/app/utils/console';
import { AuthResponse } from '../auth/auth-response';

@Injectable({
  providedIn: 'root'
})
export class DatabaseCleanupService {

  constructor(private readonly injector: Injector) {
    injector.get(NgZone).runOutsideAngular(() => {
      setTimeout(() => {
        injector.get(AuthService).auth$.subscribe(auth => this.checkCleaning(auth));
      }, 5000);
    });
  }

  private timeout: any = undefined;
  private email: string | undefined = undefined;
  private checkCleaning(auth: AuthResponse | null): void {
    if (!auth || auth.email !== this.email) {
      if (this.timeout) clearTimeout(this.timeout);
      this.timeout = undefined;
      this.email = undefined;
    }
    if (auth) {
      this.email = auth.email;
      const lastCleanStr = localStorage.getItem('trailence.db-cleaning.last-time.' + this.email);
      const lastCleanTime = lastCleanStr ? Number.parseInt(lastCleanStr) : undefined;
      const nextCleanTime = lastCleanTime && !Number.isNaN(lastCleanTime) ? lastCleanTime + 24 * 60 * 60 * 1000 : Date.now() + 60000;
      if (this.timeout) clearTimeout(this.timeout);
      const nextTimeout = Math.max(nextCleanTime - Date.now(), 60000);
      Console.info('Next database cleaning at', new Date(Date.now() + nextTimeout));
      this.timeout = setTimeout(() => {
        this.doCleaning(this.email!).subscribe((done) => {
          if (this.email === auth.email && done) {
            Console.info('Database cleaned, next cleaning in 24 hours');
            localStorage.setItem('trailence.db-cleaning.last-time.' + this.email, '' + Date.now());
          }
        });
      }, nextTimeout);
    }
  }

  private doCleaning(email: string): Observable<boolean> {
    const dbService = this.injector.get(DatabaseService);
    const db = dbService.db?.db;
    if (!db) return of(false);
    return combineLatest([dbService.hasLocalChanges, dbService.lastSync, dbService.syncStatus, this.injector.get(NetworkService).server$]).pipe(
      filter(([localChanges, lastSync, syncing, connected]) => !localChanges && !!lastSync && Date.now() - lastSync < 15 * 60 * 1000 && !syncing && connected),
      first(),
      switchMap(() => {
        if (db !== dbService.db?.db || email !== dbService.email) return of(false);
        Console.info('Cleaning database...');
        return this.injector.get(TrailService).cleanDatabase(db, email).pipe(
          switchMap(() => {
            if (db !== dbService.db?.db || email !== dbService.email) return of(false);
            return this.injector.get(TagService).cleanDatabase(db, email);
          }),
          switchMap(() => {
            if (db !== dbService.db?.db || email !== dbService.email) return of(false);
            return this.injector.get(TrackService).cleanDatabase(db, email);
          }),
        );
      })
    );
  }

}
