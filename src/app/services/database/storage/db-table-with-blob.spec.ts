import { TestBed } from '@angular/core/testing';
import { provideMockLocalFilesService } from 'test/utils/mock-local-files-service';
import { Db } from './db';
import { DbTableWithBlob } from './db-table-with-blob';
import { Injector } from '@angular/core';
import { BehaviorSubject, filter, firstValueFrom } from 'rxjs';
import a from 'jasmine';
import Dexie from 'dexie';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { I18nService } from '../../i18n/i18n.service';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { provideAuthService } from 'test/utils/mock-auth-service';
import { AuthService } from '../../auth/auth.service';
import { AuthResponse } from '../../auth/auth-response';
import { DbTestsUtils } from './db-tests-utils';

interface MyDto {
  key: string;
  meta: string;
  blob: Blob;
}

function runTests(withFiles: boolean) {

  describe('DbTableWithBlob ' + (withFiles ? 'using LocalFiles' : 'using Blob inside DB'), () => {
    let injector: Injector;

    beforeEach(() => {
      const providers = [];
      if (withFiles) {
        providers.push(provideMockLocalFilesService(), provideHttpClient(withInterceptorsFromDi()), provideAuthService('test@trailence.org'));
      }
      TestBed.configureTestingModule({ imports: [], providers});
      injector = TestBed.inject(Injector);
    });

    const expectDto = async (expected: MyDto | undefined, found: MyDto | undefined, ctx: string) => {
      if (expected === undefined) {
        expect(found).withContext(ctx + ' should be undefined').toBeUndefined();
      } else {
        expect(found).withContext(ctx + ' should be defined').toBeDefined();
        expect(found!.key).withContext(ctx + ' (key)').toBe(expected.key);
        expect(found!.meta).withContext(ctx + ' (meta)').toBe(expected.meta);
        DbTestsUtils.expectBlob(expected.blob, found!.blob, ctx + ' (blob)');
      }
    }

    it('CRUD on fresh DB', async () => {
      await DbTestsUtils.deleteDatabase('test_db_with_blob');
      const table = new DbTableWithBlob<MyDto>(injector, 'test_with_blob', 'key', 'key', 'blob', undefined);
      const db = new Db(injector, 'test_db_with_blob', false, false, [table]);
      db.start();
      await firstValueFrom(db.dbReady$.pipe(filter(ready => !!ready)));
      // empty
      expect(await firstValueFrom(table.getByKey$('key1'))).toBeUndefined();

      const expected = new Map<string, MyDto>();
      // add key1
      let dto = {key: 'key1', meta: 'meta1', blob: new Blob(DbTestsUtils.randomData())};
      expected.set('key1', dto)
      await firstValueFrom(table.addOne$(dto));
      await expectDto(expected.get('key1'), await firstValueFrom(table.getByKey$('key1')), 'addOne/getOne: key1');
      await DbTestsUtils.expectBlob(dto.blob, await firstValueFrom(table.getBlobByKey$('key1')), 'getBlobByKey key1');
      expect(await firstValueFrom(table.blobExists$('key1'))).toBeTrue();

      // add key2 to key10
      let dtos: MyDto[] = [];
      for (let i = 2; i <= 10; ++i) {
        dto = {key: 'key'+i, meta: 'meta'+i, blob: new Blob(DbTestsUtils.randomData())};
        dtos.push(dto);
        expected.set('key'+i, dto);
      }
      await firstValueFrom(table.addMany$(dtos));
      dtos = await firstValueFrom(table.getByKeys$(Array.from(expected.keys())));
      for (let i = 1; i <= 10; ++i) {
        const dto = dtos.find(d => d.key === 'key'+i);
        await expectDto(expected.get('key'+i), dto, 'addMany/getMany: key' + i);
        await DbTestsUtils.expectBlob(expected.get('key'+i)!.blob, await firstValueFrom(table.getBlobByKey$('key'+i)), 'getBlobByKey key'+i);
        expect(await firstValueFrom(table.blobExists$('key'+i))).toBeTrue();
      }

      // update meta of key3
      dto = expected.get('key3')!;
      dto.meta = 'meta3updated';
      await firstValueFrom(table.setOne$(dto));
      await expectDto(dto, await firstValueFrom(table.getByKey$('key3')), 'setOne/getOne: key3');
      await DbTestsUtils.expectBlob(dto.blob, await firstValueFrom(table.getBlobByKey$('key3')), 'getBlobByKey key3');
      expect(await firstValueFrom(table.blobExists$('key3'))).toBeTrue();

      // update meta of key6 to key9
      dtos = [];
      for (let i = 6; i <= 9; ++i) {
        dto = expected.get('key'+i)!
        dto.meta = 'meta'+i+'updated';
        dtos.push(dto);
      }
      await firstValueFrom(table.setMany$(dtos));
      dtos = await firstValueFrom(table.getByKeys$(Array.from(expected.keys())));
      for (let i = 1; i <= 10; ++i) {
        const dto = dtos.find(d => d.key === 'key'+i);
        await expectDto(expected.get('key'+i), dto, 'setMany/getMany: key' + i);
        await DbTestsUtils.expectBlob(expected.get('key'+i)!.blob, await firstValueFrom(table.getBlobByKey$('key'+i)), 'getBlobByKey key'+i);
        expect(await firstValueFrom(table.blobExists$('key'+i))).toBeTrue();
      }

      // update meta and blob for key5
      dto = expected.get('key5')!;
      dto.meta = 'update5withBlob';
      dto.blob = new Blob(DbTestsUtils.randomData());
      await firstValueFrom(table.setOne$(dto));
      await expectDto(dto, await firstValueFrom(table.getByKey$('key5')), 'setOne/getOne: key5');
      await DbTestsUtils.expectBlob(dto.blob, await firstValueFrom(table.getBlobByKey$('key5')), 'getBlobByKey key5');
      expect(await firstValueFrom(table.blobExists$('key5'))).toBeTrue();

      // update meta and blob for key1, key4 and key9, and add key11
      dtos = [
        {key:'key1', meta:'m1wb', blob: new Blob(DbTestsUtils.randomData())},
        {key:'key4', meta:'m4wb', blob: new Blob(DbTestsUtils.randomData())},
        {key:'key9', meta:'m9wb', blob: new Blob(DbTestsUtils.randomData())},
        {key:'key11', meta:'m11wb', blob: new Blob(DbTestsUtils.randomData())},
      ];
      expected.set('key1', dtos[0]);
      expected.set('key4', dtos[1]);
      expected.set('key9', dtos[2]);
      expected.set('key11', dtos[3]);
      await firstValueFrom(table.setMany$(dtos));
      dtos = await firstValueFrom(table.getAll$());
      expect(dtos).toHaveSize(expected.size);
      for (let i = 1; i <= 11; ++i) {
        const dto = dtos.find(d => d.key === 'key'+i);
        await expectDto(expected.get('key'+i), dto, 'setMany/getMany: key' + i);
        await DbTestsUtils.expectBlob(expected.get('key'+i)!.blob, await firstValueFrom(table.getBlobByKey$('key'+i)), 'getBlobByKey key'+i);
        expect(await firstValueFrom(table.blobExists$('key'+i))).toBeTrue();
      }

      // get unknown key
      expect(await firstValueFrom(table.getByKey$('key20'))).toBeUndefined();
      dtos = await firstValueFrom(table.getByKeys$(['key5', 'key20', 'key6', 'another']));
      expect(dtos.map(d => d.key)).toEqual(['key5', 'key6']);
      await expectAsync(firstValueFrom(table.getBlobByKey$('key20'))).toBeRejected();
      expect(await firstValueFrom(table.blobExists$('key20'))).toBeFalse();

      // delete key2
      await firstValueFrom(table.deleteOne$('key2'));
      expected.delete('key2');
      dtos = await firstValueFrom(table.getAll$());
      for (const key of expected.keys()) {
        const dto = dtos.find(d => d.key === key);
        await expectDto(expected.get(key), dto, key + ' after key2 deleted');
        await DbTestsUtils.expectBlob(expected.get(key)!.blob, await firstValueFrom(table.getBlobByKey$(key)), 'getBlobByKey '+key);
        expect(await firstValueFrom(table.blobExists$(key))).toBeTrue();
      }
      await expectAsync(firstValueFrom(table.getBlobByKey$('key2'))).toBeRejected();
      expect(await firstValueFrom(table.blobExists$('key2'))).toBeFalse();

      // delete key4,6,8
      await firstValueFrom(table.deleteMany$(['key4', 'key6', 'key8']));
      expected.delete('key4');
      expected.delete('key6');
      expected.delete('key8');
      dtos = await firstValueFrom(table.getAll$());
      for (const key of expected.keys()) {
        const dto = dtos.find(d => d.key === key);
        await expectDto(expected.get(key), dto, key + ' after key4,6,8 deleted');
        await DbTestsUtils.expectBlob(expected.get(key)!.blob, await firstValueFrom(table.getBlobByKey$(key)), 'getBlobByKey '+key);
        expect(await firstValueFrom(table.blobExists$(key))).toBeTrue();
      }
      await expectAsync(firstValueFrom(table.getBlobByKey$('key4'))).toBeRejected();
      await expectAsync(firstValueFrom(table.getBlobByKey$('key6'))).toBeRejected();
      await expectAsync(firstValueFrom(table.getBlobByKey$('key8'))).toBeRejected();
      expect(await firstValueFrom(table.blobExists$('key4'))).toBeFalse();
      expect(await firstValueFrom(table.blobExists$('key6'))).toBeFalse();
      expect(await firstValueFrom(table.blobExists$('key8'))).toBeFalse();
      expect(dtos).toHaveSize(expected.size);

      // TODO test listContentWithSize
    });

    it('Load from existing database', async () => {
      if (withFiles) {
        await firstValueFrom(TestBed.inject(I18nService).texts$.pipe(filterDefined()));
      }

      await DbTestsUtils.deleteDatabase('test_db_with_blob');
      const dexie = new Dexie('test_db_with_blob');
      dexie.version(1).stores({
        test_with_blob: 'key'
      });
      const dtos = [
        {key: 'key1', meta: 'meta1', blob: new Blob(DbTestsUtils.randomData())},
        {key: 'key2', meta: 'meta2', blob: new Blob(DbTestsUtils.randomData())},
        {key: 'key3', meta: 'meta3', blob: new Blob(DbTestsUtils.randomData())},
      ];
      await dexie.table('test_with_blob').bulkAdd(dtos);
      dexie.close();

      const table = new DbTableWithBlob<MyDto>(injector, 'test_with_blob', 'key', 'key', 'blob', undefined);
      const db = new Db(injector, 'test_db_with_blob', false, false, [table]);
      db.start();
      await firstValueFrom(db.dbReady$.pipe(filter(ready => !!ready)));

      const found = await firstValueFrom(table.getAll$());
      expect(found).toHaveSize(3);
      for (const dto of dtos) {
        const dtoFound = found.find(d => d.key === dto.key);
        expectDto(dto, dtoFound, 'dto ' + dto.key);
      }
    });

    if (withFiles) {
      it('Restore database', async () => {
        await DbTestsUtils.deleteDatabase('test_db_with_blob_restore_test@trailence.org');
        const table = new DbTableWithBlob<MyDto>(injector, 'test_with_blob', 'key', 'key', 'blob', undefined);
        const db = new Db(injector, 'test_db_with_blob_restore', true, false, [table]);
        db.start();
        // empty
        expect(await firstValueFrom(table.getByKey$('key1'))).toBeUndefined();
        // fill it
        let dtos: MyDto[] = [];
        for (let i = 1; i <= 10; ++i) {
          const dto = {key: 'key'+i, meta: 'meta'+i, blob: new Blob(DbTestsUtils.randomData())};
          dtos.push(dto);
        }
        await firstValueFrom(table.addMany$(dtos));
        const dtosRead = await firstValueFrom(table.getByKeys$(dtos.map(d => d.key)));
        for (let i = 1; i <= 10; ++i) {
          const dto = dtos.find(d => d.key === 'key'+i);
          const dtoRead = dtosRead.find(d => d.key === 'key'+i);
          await expectDto(dto, dtoRead, 'key' + i);
        }

        // close (change user)
        const auth$ = injector.get(AuthService).userChanged$ as BehaviorSubject<AuthResponse | undefined>;
        const authResponse = auth$.value;
        auth$.next(undefined);
        await firstValueFrom(db.dbClosed$.pipe(filter(closed => closed)));

        // delete db
        await DbTestsUtils.deleteDatabase('test_db_with_blob_restore_test@trailence.org');

        // reopen
        auth$.next(authResponse);

        // should be restored
        const restored = await firstValueFrom(table.getAll$());
        expect(restored).toHaveSize(10);
        for (let i = 1; i <= 10; ++i) {
          const dto = dtos.find(d => d.key === 'key'+i);
          const dtoRead = restored.find(d => d.key === 'key'+i);
          await expectDto(dto, dtoRead, 'key' + i);
        }
      });
    }

  });
}

runTests(false);
runTests(true);
