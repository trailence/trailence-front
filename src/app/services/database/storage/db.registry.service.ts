import { Injectable } from '@angular/core';

export interface RegisteredDb {
  isByUser: boolean;
  close$: () => Promise<any>;
}

@Injectable({providedIn: 'root'})
export class DbRegistryService {

  private readonly databases = new Map<string, RegisteredDb>();

  public register(name: string, db: RegisteredDb): void {
    this.databases.set(name, db);
  }

  public closeAllUserSpecific$(): Promise<any> {
    const promises: Promise<any>[] = [];
    for (const db of this.databases.values()) {
      if (db.isByUser) promises.push(db.close$());
    }
    return Promise.all(promises);
  }
}
