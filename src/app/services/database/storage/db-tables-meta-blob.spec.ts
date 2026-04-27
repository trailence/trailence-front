import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAuthService } from 'test/utils/mock-auth-service';
import { provideMockLocalFilesService } from 'test/utils/mock-local-files-service';
import { DbTestsUtils } from './db-tests-utils';
import { BlobDto, DbTablesMetaBlob } from './db-tables-meta-blob';
import { Db } from './db';
import { BehaviorSubject, filter, firstValueFrom } from 'rxjs';
import { I18nService } from '../../i18n/i18n.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import Dexie from 'dexie';
import { AuthService } from '../../auth/auth.service';
import { AuthResponse } from '../../auth/auth-response';

interface MyDto {
  key: string;
  meta: string;
}

function runTests(withFiles: boolean) {
  describe('DbTablesMetaBlob ' + (withFiles ? 'using LocalFiles' : 'using Blob inside DB'), () => {
    let injector: Injector;

    beforeEach(() => {
      const providers = [];
      if (withFiles) {
        providers.push(provideMockLocalFilesService(), provideHttpClient(withInterceptorsFromDi()), provideAuthService('test@trailence.org'));
      }
      TestBed.configureTestingModule({ imports: [], providers});

      injector = TestBed.inject(Injector);
    });

    it('CRUD on fresh database', async () => {
      await DbTestsUtils.deleteDatabase('test_db_meta_blob');
      const table = new DbTablesMetaBlob<MyDto>(injector, 'test', 'meta', 'blob', 'key', 'key');
      const db = new Db(injector, 'test_db_meta_blob', false, table.getTables());
      db.start();

      // empty
      expect((await firstValueFrom(table.metadata.getAll$())).length).toBe(0);

      const expectedDtos = new Map<string, {key: string, meta: string}>();
      const expectedBlobs = new Map<string, {key: string, blob: Blob}>();

      // add key1 to key3
      let dtos = [
        {key: 'key1', meta: 'meta1'},
        {key: 'key2', meta: 'meta2'},
        {key: 'key3', meta: 'meta3'},
      ];
      let blobs = [
        {key: 'key1', blob: new Blob(DbTestsUtils.randomData())},
        {key: 'key2', blob: new Blob(DbTestsUtils.randomData())},
        {key: 'key3', blob: new Blob(DbTestsUtils.randomData())},
      ];
      await firstValueFrom(table.setMany$(dtos, blobs));

      // getBlob$
      for (let i = 1; i <= 3; ++i) {
        expectedDtos.set('key'+i, dtos[i-1]);
        expectedBlobs.set('key'+i, blobs[i-1]);
        const blobFound = await firstValueFrom(table.getBlob$('key' + i));
        const expectedBlob = blobs.find(b => b.key === 'key' + i)!.blob;
        await DbTestsUtils.expectBlob(expectedBlob, blobFound, 'getBlob$ key' + i);
      }
      expect(await firstValueFrom(table.getBlob$('unknown'))).toBeUndefined();

      // add key4 to key10
      dtos = [];
      blobs = [];
      for (let i = 4; i <= 10; ++i) {
        const dto = {key: 'key'+i, meta: 'meta'+i};
        dtos.push(dto);
        const blob = {key: 'key'+i, blob: new Blob(DbTestsUtils.randomData())};
        blobs.push(blob);
        expectedDtos.set('key'+i, dto);
        expectedBlobs.set('key'+i, blob);
      }
      await firstValueFrom(table.setMany$(dtos, blobs));

      dtos = await firstValueFrom(table.metadata.getAll$());
      for (let i = 1; i <= 10; ++i) {
        const expectedDto = expectedDtos.get('key'+i)!;
        const dtoFound = dtos.find(d => d.key === expectedDto.key);
        expect(dtoFound?.key).toBe(expectedDto.key);
        expect(dtoFound?.meta).toBe(expectedDto.meta);
        const blobFound = await firstValueFrom(table.getBlob$('key' + i));
        await DbTestsUtils.expectBlob(expectedBlobs.get('key'+i)!.blob, blobFound, 'getBlob$ key' + i);
      }
      expect(dtos.length).toBe(10);

      // deleteMany
      await firstValueFrom(table.deleteMany$(['key3', 'key7', 'key9', 'key10']));
      expectedDtos.delete('key3');
      expectedDtos.delete('key7');
      expectedDtos.delete('key9');
      expectedDtos.delete('key10');
      expectedBlobs.delete('key3');
      expectedBlobs.delete('key7');
      expectedBlobs.delete('key9');
      expectedBlobs.delete('key10');

      dtos = await firstValueFrom(table.metadata.getAll$());
      for (const key of expectedDtos.keys()) {
        const expectedDto = expectedDtos.get(key)!;
        const dtoFound = dtos.find(d => d.key === expectedDto.key);
        expect(dtoFound?.key).toBe(expectedDto.key);
        expect(dtoFound?.meta).toBe(expectedDto.meta);
        const blobFound = await firstValueFrom(table.getBlob$(key));
        await DbTestsUtils.expectBlob(expectedBlobs.get(key)!.blob, blobFound, 'getBlob$ ' + key);
      }
      expect(dtos.length).toBe(6);
      expect(await firstValueFrom(table.getBlob$('key3'))).toBeUndefined();
      expect(await firstValueFrom(table.getBlob$('key7'))).toBeUndefined();
      expect(await firstValueFrom(table.getBlob$('key9'))).toBeUndefined();
      expect(await firstValueFrom(table.getBlob$('key10'))).toBeUndefined();

      // deleteAll
      await firstValueFrom(table.deleteAll$());
      expect((await firstValueFrom(table.metadata.getAll$())).length).toBe(0);
      for (let i = 1; i <= 10; ++i) {
        expect(await firstValueFrom(table.getBlob$('key' + i))).toBeUndefined();
      }
    });

    it('Load from existing database', async () => {
      if (withFiles) {
        await firstValueFrom(TestBed.inject(I18nService).texts$.pipe(filterDefined()));
      }

      const expectedDtos = new Map<string, {key: string, meta: string}>();
      const expectedBlobs = new Map<string, {key: string, blob: Blob}>();

      await DbTestsUtils.deleteDatabase('test_db_meta_blob');
      const dexie = new Dexie('test_db_meta_blob');
      dexie.version(1).stores({
        test_meta: 'key',
        test_blob: 'key',
      });
      let dtos: MyDto[] = [
        {key: 'key1', meta: 'meta1'},
        {key: 'key2', meta: 'meta2'},
        {key: 'key3', meta: 'meta3'},
      ];
      await dexie.table('test_meta').bulkAdd(dtos);
      let blobs: BlobDto[] = [
        {key: 'key1', blob: new Blob(DbTestsUtils.randomData())},
        {key: 'key2', blob: new Blob(DbTestsUtils.randomData())},
        {key: 'key3', blob: new Blob(DbTestsUtils.randomData())},
      ];
      await dexie.table('test_blob').bulkAdd(blobs);
      dexie.close();

      for (let i = 1; i <= 3; ++i) {
        expectedDtos.set('key'+i, dtos[i-1]);
        expectedBlobs.set('key'+i, blobs[i-1]);
      }

      const table = new DbTablesMetaBlob<MyDto>(injector, 'test', 'meta', 'blob', 'key', 'key');
      const db = new Db(injector, 'test_db_meta_blob', false, table.getTables());
      db.start();

      dtos = await firstValueFrom(table.metadata.getAll$());
      for (const key of expectedDtos.keys()) {
        const expectedDto = expectedDtos.get(key)!;
        const dtoFound = dtos.find(d => d.key === expectedDto.key);
        expect(dtoFound?.key).toBe(expectedDto.key);
        expect(dtoFound?.meta).toBe(expectedDto.meta);
        const blobFound = await firstValueFrom(table.getBlob$(key));
        await DbTestsUtils.expectBlob(expectedBlobs.get(key)!.blob, blobFound, 'getBlob$ ' + key);
      }
      expect(dtos.length).toBe(3);
    });


    if (withFiles) {
      it('Restore database', async () => {
        await DbTestsUtils.deleteDatabase('test_db_meta_blob_restore_test@trailence.org');
        const table = new DbTablesMetaBlob<MyDto>(injector, 'test', 'meta', 'blob', 'key', 'key');
        const db = new Db(injector, 'test_db_meta_blob_restore', true, table.getTables());
        db.start();
        // empty
        expect((await firstValueFrom(table.metadata.getAll$())).length).toBe(0);
        // fill it
        let dtos: MyDto[] = [];
        let blobs: BlobDto[] = [];
        for (let i = 1; i <= 10; ++i) {
          dtos.push({key: 'key'+i, meta: 'meta'+i});
          blobs.push({key: 'key'+i, blob: new Blob(DbTestsUtils.randomData())});
        }
        await firstValueFrom(table.setMany$(dtos, blobs));

        // close (change user)
        const auth$ = injector.get(AuthService).userChanged$ as BehaviorSubject<AuthResponse | undefined>;
        const authResponse = auth$.value;
        auth$.next(undefined);
        await firstValueFrom(db.dbClosed$.pipe(filter(closed => closed)));

        // delete db
        await DbTestsUtils.deleteDatabase('test_db_meta_blob_restore_test@trailence.org');

        // reopen
        auth$.next(authResponse);

        // should be restored
        const restored = await firstValueFrom(table.metadata.getAll$());
        expect(restored.length).toBe(10);
        for (let i = 1; i <= 10; ++i) {
          const dto = dtos.find(d => d.key === 'key'+i)!;
          const dtoRead = restored.find(d => d.key === 'key'+i);
          expect(dtoRead?.key).toBe(dto.key);
          expect(dtoRead?.meta).toBe(dto.meta);
          const blobFound = await firstValueFrom(table.getBlob$('key'+i));
          const expectedBlob = blobs[i-1];
          await DbTestsUtils.expectBlob(expectedBlob.blob, blobFound, 'getBlob$ key' + i);
        }
      });
    }

  });
}

runTests(false);
runTests(true);
