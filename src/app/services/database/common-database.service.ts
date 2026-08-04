import { Injectable, Injector } from '@angular/core';
import { Db } from './storage/db';
import { DbTable } from './storage/db-table';
import Dexie from 'dexie';
import { AuthService } from '../auth/auth.service';

const DB_PREFIX = 'trailence_data';
const TRAIL_TABLE_NAME = 'trails';
const TRAIL_COLLECTION_TABLE_NAME = 'trail_collections';
const TAG_TABLE_NAME = 'tags';
const TRAIL_TAG_TABLE_NAME = 'trails_tags';
const EXTENSIONS_TABLE_NAME = 'extensions';
const SHARE_TABLE_NAME = 'shares';
const PHOTO_TABLE_NAME = 'photos';
const MY_SELECTION_TABLE_NAME = 'my_selection';
const MY_PUBLICATIONS_TABLE_NAME = 'my_publications';
const TRAIL_LINKS_TABLE_NAME = 'trail_links';
const DEPENDENCIES_TABLE_NAME = 'dependencies';

@Injectable({providedIn: 'root'})
export class CommonDatabaseService {

  private readonly db: Db;
  public readonly collectionTable: DbTable<any>;
  public readonly trailTable: DbTable<any>;
  public readonly tagTable: DbTable<any>;
  public readonly trailTagTable: DbTable<any>;
  public readonly photoTable: DbTable<any>;
  public readonly shareTable: DbTable<any>;
  public readonly mySelectionTable: DbTable<any>;
  public readonly myPublicationsTable: DbTable<any>;
  public readonly publicLinksTable: DbTable<any>;
  public readonly extensionsTable: DbTable<any>;

  public readonly dependenciesTable: DbTable<any>;

  constructor(
    injector: Injector
  ) {
    this.collectionTable = new DbTable<any>(injector, TRAIL_COLLECTION_TABLE_NAME, 'id_owner', 'id_owner');
    this.trailTable = new DbTable<any>(injector, TRAIL_TABLE_NAME, 'id_owner', 'id_owner')
      .addMigration({
        name: 'date added to trail',
        version: 1703,
        migration: (injector, dexie, table, localDir) => forceUpdateFromServerMigration(dexie, 'trail'),
      });
    this.tagTable = new DbTable<any>(injector, TAG_TABLE_NAME, 'id_owner', 'id_owner');
    this.trailTagTable = new DbTable<any>(injector, TRAIL_TAG_TABLE_NAME, 'key', 'key');
    this.photoTable = new DbTable<any>(injector, PHOTO_TABLE_NAME, 'id_owner', 'id_owner');
    this.shareTable = new DbTable<any>(injector, SHARE_TABLE_NAME, 'key', 'key');
    this.mySelectionTable = new DbTable<any>(injector, MY_SELECTION_TABLE_NAME, 'key', 'key');
    this.myPublicationsTable = new DbTable<any>(injector, MY_PUBLICATIONS_TABLE_NAME, 'publicUuid', 'publicUuid')
      .disableBackup();
    this.publicLinksTable = new DbTable<any>(injector, TRAIL_LINKS_TABLE_NAME, 'key', 'key');
    this.extensionsTable = new DbTable<any>(injector, EXTENSIONS_TABLE_NAME, 'extension', 'extension');
    this.dependenciesTable = new DbTable<any>(injector, DEPENDENCIES_TABLE_NAME, 'key', 'key');
    this.db = new Db(injector, DB_PREFIX, true, false, [
      this.collectionTable,
      this.trailTable,
      this.tagTable,
      this.trailTagTable,
      this.photoTable,
      this.shareTable,
      this.mySelectionTable,
      this.myPublicationsTable,
      this.publicLinksTable,
      this.extensionsTable,
      this.dependenciesTable,
    ]);
    this.db.dbReady$.subscribe(ready => {
      const updatedFrom = ready?.updatedFrom;
      if (updatedFrom) this.appUpdated(updatedFrom, injector);
    });
    this.db.start();
  }

  private appUpdated(updatedFrom: number, injector: Injector): void {
    Promise.all([
      import('../../components/updates/release-notes-popup/release-notes-popup.component'),
      import('@ionic/angular/standalone'),
    ]).then(([popupModule, ionic]) => injector.get(ionic.ModalController).create({
      component: popupModule.ReleaseNotesPopup,
      componentProps: { sinceVersion: updatedFrom, type: 'updated' },
      cssClass: 'small-modal',
    }))
    .then(m => m.present());
    injector.get(AuthService).forceRenew();
  }
}

async function forceUpdateFromServerMigration(dexie: Dexie, storeName: string) {
  const key = 'store_' + storeName;
  const previousData = await Db.readInternalData(dexie, key) || {};
  const newData = {...previousData, forceUpdateFromServer: true};
  await Db.setInternalData(dexie, key, newData);
}
