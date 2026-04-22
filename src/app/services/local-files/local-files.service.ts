import { EventEmitter, Injectable, Injector } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { BinaryContent } from 'src/app/utils/binary-content';
import LocalFiles from './local-files';
import { AuthService } from '../auth/auth.service';
import { Console } from 'src/app/utils/console';
import Dexie, { Table } from 'dexie';
import { BehaviorSubject, debounceTime, filter, first, from, map, Observable, of, Subscription, switchMap, tap, throwIfEmpty } from 'rxjs';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';
import { ProgressService } from '../progress/progress.service';
import { I18nService } from '../i18n/i18n.service';

type waitingOperation = {name: string, operation: () => Promise<any>, resolve: (result: any) => void, reject: (reason: any) => void};

@Injectable({providedIn: 'root'})
export class LocalFilesService {

  private readonly support: boolean;

  constructor(
    readonly platform: Platform,
  ) {
    this.support = this.platform.is('capacitor');
  }

  public supported(): boolean {
    return this.support;
  }

  private readonly _waiting = new Map<string, waitingOperation[]>();

  private operation<T>(dir: string, filename: string, name: string, operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const op: waitingOperation = {name, operation, resolve, reject};
      const path = dir + '/' + filename;
      let waiting = this._waiting.get(path);
      if (waiting === undefined) {
        waiting = [];
        this._waiting.set(path, waiting);
        this.executeOperation(path, op, waiting);
      } else {
        Console.info('Operation ' + name + ' on local file ' + path + ' waiting for previous to finish');
        waiting.push(op);
      }
    });
  }

  private multipleOperation<T>(dir: string, files: string[], name: string, operation: () => Promise<T>, previousTryAgain?: waitingOperation): Promise<T> {
    if (files.length === 1) return this.operation(dir, files[0], name, operation);
    const paths = files.map(filename => dir + '/' + filename);
    if (paths.every(path => !this._waiting.has(path))) {
      // can start now
      Console.info('Starting multiple file operation ' + name + ' on ' + dir, files);
      paths.forEach(path => this._waiting.set(path, []));
      const next = () => {
        for (const path of paths) {
          const waiting = this._waiting.get(path);
          if (waiting === undefined) continue; // should not happen
          if (waiting.length === 0) {
            this._waiting.delete(path);
          } else {
            setTimeout(() => this.nextOperation(path), 0);
          }
        }
      };
      return operation()
      .then(result => {
        Console.info('Multiple file operation ' + name + ' on ' + dir + ' done.');
        next();
        return result;
      })
      .catch(error => {
        Console.error('Multiple file operation ' + name + ' on ' + dir + ' failed', error);
        next();
        throw error;
      });
    }
    // some files have operation
    Console.info('Multiple operation ' + name + ' waiting on ' + dir, files);
    return new Promise<T>((resolve, reject) => {
      if (paths.every(path => !this._waiting.has(path))) {
        this.multipleOperation(dir, files, name, () => operation().then(resolve).catch(reject));
        return;
      }
      const tryAgain: waitingOperation = {
        name,
        operation: () => this.multipleOperation(dir, files, name, operation, tryAgain),
        resolve,
        reject
      };
      for (const path of paths) {
        let waiting = this._waiting.get(path);
        if (waiting === undefined) continue;
        const index = previousTryAgain ? waiting.indexOf(previousTryAgain) : -1;
        if (index >= 0) waiting.splice(index, 1);
        waiting.push(tryAgain);
      }
    });
  }

  private executeOperation(path: string, op: waitingOperation, waiting: waitingOperation[]): void {
    const next = () => {
      if (waiting.length === 0)
        this._waiting.delete(path);
      else
        setTimeout(() => this.nextOperation(path), 0);
    };
    Console.info('Starting local file operation on ' + path + ': ' + op.name);
    op.operation()
    .then(result => {
      Console.info('Local file operation done on ' + path + ': ' + op.name);
      next();
      op.resolve(result);
    })
    .catch(error => {
      Console.error('Local file operation failed on ' + path + ': ' + op.name, error);
      next();
      op.reject(error);
    });
  }

  private nextOperation(path: string): void {
    let waiting = this._waiting.get(path);
    if (waiting === undefined) {
      Console.warn('Next operation without operation?', path);
      return;
    }
    if (waiting.length === 0) {
      Console.warn('Next operation with empty list?', path);
      this._waiting.delete(path);
      return;
    }
    const next = waiting.splice(0, 1)[0];
    this.executeOperation(path, next, waiting);
  }


  public fileExists(dir: string, filename: string): Promise<boolean> {
    return this.operation(dir, filename, 'fileExists', () => LocalFiles.fileExists({dir, filename}).then(r => r.exists));
  }

  public filesExist(dir: string, files: string[]): Promise<boolean[]> {
    return this.multipleOperation(dir, files, 'fileExist', () => LocalFiles.filesExist({dir, files}).then(r => r.exist));
  }

  public filesSize(dir: string, files: string[]): Promise<{filename: string, size: number}[]> {
    if (files.length === 0) return Promise.resolve([]);
    return this.multipleOperation(dir, files, 'filesSize', () => LocalFiles.getFilesSize({dir, files}).then(r => r.files));
  }

  public deleteFile(dir: string, filename: string): Promise<any> {
    return this.operation(dir, filename, 'delete', () => LocalFiles.deleteFile({dir, filename}));
  }

  public deleteFiles(dir: string, files: string[]): Promise<any> {
    if (files.length === 0) return Promise.resolve();
    return this.multipleOperation(dir, files, 'delete', () => LocalFiles.deleteFiles({dir, files}));
  }

  public saveBinaryFile(dir: string, filename: string, data: BinaryContent): Promise<boolean> {
    return this.operation(dir, filename, 'saveBinary', () =>
      LocalFiles.saveBinaryFile({dir, filename, size: data.getSize()})
      .then(init => data.toUint8Array().then(content =>this.saveBinaryChunk(init.id, init.maxChunkSize, content, 0)))
      .then(() => true)
    );
  }

  private saveBinaryChunk(id: number, maxChunkSize: number, content: Uint8Array, offset: number): Promise<any> {
    const end = Math.min(offset + maxChunkSize, content.byteLength);
    const data = btoa(content.slice(offset, end).reduce((data, byte) => {
      return data + String.fromCharCode(byte); // NOSONAR
    }, ''));
    return LocalFiles.saveBinaryFileChunk({id, data})
    .then(r => {
      if (end === content.byteLength) return r;
      return this.saveBinaryChunk(id, maxChunkSize, content, end);
    });
  }

  public readBlob(dir: string, filename: string, contentType?: string): Promise<Blob> {
    return this.operation(dir, filename, 'readBlob', () =>
      LocalFiles.readBinaryFile({dir, filename})
      .then(init => {
        if (init.chunks === 0) return new Blob([], {type: contentType});
        if (init.chunks === 1) return BinaryContent.b64toBlob(init.data, contentType);
        return this.readBlobChunk(init.id!, init.chunks, 2, init.data, contentType);
      })
    );
  }

  private readBlobChunk(id: number, nbChunks: number, chunkIndex: number, b64: string, contentType?: string): Promise<Blob> {
    return LocalFiles.readBinaryFileChunk({id})
    .then(r => {
      const b = b64 + r.data;
      if (chunkIndex === nbChunks) return BinaryContent.b64toBlob(b, contentType);
      return this.readBlobChunk(id, nbChunks, chunkIndex + 1, b, contentType);
    });
  }

  public saveJsonl(dir: string, filename: string, linesGenerator: (from: number, limit: number) => Promise<{lines: string[], hasMore: boolean}>, chunkSize: number = 250): Promise<any> {
    return this.operation(dir, filename, 'saveJsonl', () =>
      linesGenerator(0, chunkSize)
      .then(generated =>
        LocalFiles.saveJsonlFile({dir, filename, lines: generated.lines, more: generated.hasMore})
        .then(r => {
          if (r.id) return this.saveJsonlChunk(r.id, linesGenerator, chunkSize, chunkSize);
          return undefined;
        })
      )
    );
  }

  private saveJsonlChunk(id: number, linesGenerator: (from: number, limit: number) => Promise<{lines: string[], hasMore: boolean}>, from: number, chunkSize: number = 250): Promise<any> {
    return linesGenerator(from, chunkSize)
    .then(generated =>
      LocalFiles.saveJsonlFileChunk({id, lines: generated.lines, more: generated.hasMore})
      .then(() => {
        if (generated.hasMore) return this.saveJsonlChunk(id, linesGenerator, from + chunkSize, chunkSize);
        return undefined;
      })
    );
  }

  public readJsonl(dir: string, filename: string, linesConsumer: (lines: string[]) => Promise<any>): Promise<any> {
    return this.operation(dir, filename, 'readJsonl', () =>
      LocalFiles.readJsonlFile({dir, filename})
      .then(r => linesConsumer(r.lines).then(() => {
        if (!r.id) return r.lines.length > 0 ? linesConsumer([]) : undefined;
        return this.readJsonlChunk(r.id, linesConsumer);
      }))
    );
  }

  private readJsonlChunk(id: number, linesConsumer: (lines: string[]) => Promise<any>): Promise<any> {
    return LocalFiles.readJsonlFileChunk({id})
    .then(r => linesConsumer(r.lines).then(() => {
      if (r.end) return linesConsumer([]);
      return this.readJsonlChunk(id, linesConsumer);
    }));
  }

}
