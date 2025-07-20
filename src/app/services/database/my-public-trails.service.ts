import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { NetworkService } from '../network/network.service';
import { BehaviorSubject, concat, debounceTime, filter, from, map, Observable, of, switchMap, timer } from 'rxjs';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';
import { HttpService } from '../http/http.service';
import { environment } from 'src/environments/environment';
import { DatabaseService, MY_PUBLICATIONS_TABLE_NAME, VersionedDb } from './database.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';

export interface MyPublicTrail {
  publicUuid: string;
  privateUuid: string;
}

@Injectable({providedIn: 'root'})
export class MyPublicTrailsService {

  public readonly myPublicTrails$ = new BehaviorSubject<MyPublicTrail[]>([]);

  constructor(
    databaseService: DatabaseService,
    authService: AuthService,
    networkService: NetworkService,
    http: HttpService,
  ) {
    authService.auth$.pipe(
      switchMap(auth => {
        if (!auth || auth.isAnonymous) return of([]);
        return databaseService.db$.pipe(
          filterDefined(),
          switchMap(db =>
            concat(
              this.loadFromDb(db),
              networkService.server$.pipe(
                debounceTime(100),
                filter(connected => connected),
                debounceTimeExtended(1000, 60000),
                switchMap(() => timer(100, 30 * 60 * 1000)),
                switchMap(() => http.get<MyPublicTrail[]>(environment.apiBaseUrl + '/public/trails/v1/mine').pipe(
                  map(newList => {
                    this.saveToDb(db, newList);
                    return newList;
                  })
                ))
              )
            )
          )
        );
      })
    ).subscribe(list => this.myPublicTrails$.next(list));
  }

  private loadFromDb(db: VersionedDb): Observable<MyPublicTrail[]> {
    const table = db.db.table<MyPublicTrail>(MY_PUBLICATIONS_TABLE_NAME);
    return from(table.toArray());
  }

  private saveToDb(db: VersionedDb, newList: MyPublicTrail[]): void {
    const table = db.db.table<MyPublicTrail>(MY_PUBLICATIONS_TABLE_NAME);
    table.clear().then(() => table.bulkPut(newList));
  }

}
