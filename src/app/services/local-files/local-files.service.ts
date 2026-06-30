import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular/standalone';
import { BinaryContent } from 'src/app/utils/binary-content';
import LocalFiles from './local-files';
import { Console } from 'src/app/utils/console';
import { JSONL_CHUNK_MAX_SIZE, JsonLEvent, LocalFilesPlugin } from './local-files.interface';

type waitingOperation = {name: string, operation: () => Promise<any>, resolve: (result: any) => void, reject: (reason: any) => void};

@Injectable({providedIn: 'root'})
export class LocalFilesPluginProvider {
  constructor(
    platform: Platform,
  ) {
    this._support = platform.is('capacitor');
  }

  private readonly _support: boolean;

  public supported(): boolean {
    return this._support;
  }

  public getPlugin(): LocalFilesPlugin {
    return LocalFiles;
  }
}

@Injectable({providedIn: 'root'})
export class LocalFilesService {

  private readonly support: boolean;
  private readonly plugin: LocalFilesPlugin;

  constructor(
    readonly pluginProvider: LocalFilesPluginProvider,
  ) {
    this.support = this.pluginProvider.supported();
    this.plugin = this.pluginProvider.getPlugin();
  }

  public supported(): boolean {
    return this.support;
  }

  private readonly _waiting = new Map<string, waitingOperation[]>();

  private sanitizeDir(dir: string): string {
    return dir.replaceAll(/[\*\?]/g, '##'); // NOSONAR
  }

  private sanitizeFilename(filename: string): string {
    return filename.replaceAll(/[\/\\\*\?]/g, '##'); // NOSONAR
  }

  private operation<T>(dir: string, filename: string, name: string, operation: () => Promise<T>): Promise<T> {
    dir = this.sanitizeDir(dir);
    filename = this.sanitizeFilename(filename);
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
    dir = this.sanitizeDir(dir);
    if (files.length === 1) return this.operation(dir, files[0], name, operation);
    files = files.map(filename =>this.sanitizeFilename(filename));
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
    dir = this.sanitizeDir(dir);
    filename = this.sanitizeFilename(filename);
    return this.operation(dir, filename, 'fileExists', () => this.plugin.fileExists({dir, filename}).then(r => r.exists));
  }

  public filesExist(dir: string, files: string[]): Promise<boolean[]> {
    dir = this.sanitizeDir(dir);
    files = files.map(filename =>this.sanitizeFilename(filename));
    return this.multipleOperation(dir, files, 'fileExist', () => this.plugin.filesExist({dir, files}).then(r => r.exist));
  }

  public filesSize(dir: string, files: string[]): Promise<{filename: string, size: number}[]> {
    dir = this.sanitizeDir(dir);
    files = files.map(filename =>this.sanitizeFilename(filename));
    if (files.length === 0) return Promise.resolve([]);
    return this.multipleOperation(dir, files, 'filesSize', () => this.plugin.getFilesSize({dir, files}).then(r => r.files));
  }

  public listFiles(dir: string): Promise<string[]> {
    dir = this.sanitizeDir(dir);
    return this.plugin.listFiles({dir}).then(r => r.files);
  }

  public deleteFile(dir: string, filename: string): Promise<any> {
    dir = this.sanitizeDir(dir);
    filename = this.sanitizeFilename(filename);
    return this.operation(dir, filename, 'delete', () => this.plugin.deleteFile({dir, filename}));
  }

  public deleteFiles(dir: string, files: string[]): Promise<any> {
    dir = this.sanitizeDir(dir);
    files = files.map(filename =>this.sanitizeFilename(filename));
    if (files.length === 0) return Promise.resolve();
    return this.multipleOperation(dir, files, 'delete', () => this.plugin.deleteFiles({dir, files}));
  }

  public deleteAllFiles(dir: string): Promise<any> {
    dir = this.sanitizeDir(dir);
    return this.plugin.deleteAllFiles({dir});
  }

  public deleteDirectoryAndContent(dir: string): Promise<any> {
    dir = this.sanitizeDir(dir);
    const retry: (trial:number) => Promise<any> = (trial: number) => this.plugin.deleteDirectoryAndContent({dir}).catch(_ => {
      if (trial < 10) return retry(trial + 1);
      return false;
    });
    return retry(0);
  }

  public renameDirectory(dir: string, newDir: string): Promise<any> {
    dir = this.sanitizeDir(dir);
    newDir = this.sanitizeDir(newDir);
    if (dir === newDir) return Promise.resolve();
    return this.plugin.renameDirectory({previousPath: dir, newPath: newDir});
  }

  public saveBinaryFile(dir: string, filename: string, data: BinaryContent): Promise<boolean> {
    dir = this.sanitizeDir(dir);
    filename = this.sanitizeFilename(filename);
    return this.operation(dir, filename, 'saveBinary', () =>
      this.plugin.saveBinaryFile({dir, filename, size: data.getSize()})
      .then(init => (init as any)['id'] ? data.toUint8Array().then(content =>this.saveBinaryChunk((init as any).id, (init as any).maxChunkSize, content, 0)) : {})
      .then(() => true)
    );
  }

  private saveBinaryChunk(id: number, maxChunkSize: number, content: Uint8Array, offset: number): Promise<any> {
    const end = Math.min(offset + maxChunkSize, content.length);
    const data = btoa(content.slice(offset, end).reduce((data, byte) => {
      return data + String.fromCharCode(byte); // NOSONAR
    }, ''));
    return this.plugin.saveBinaryFileChunk({id, data})
    .then(r => {
      if (end === content.length) return r;
      return this.saveBinaryChunk(id, maxChunkSize, content, end);
    });
  }

  public readBlob(dir: string, filename: string, contentType?: string): Promise<Blob> {
    dir = this.sanitizeDir(dir);
    filename = this.sanitizeFilename(filename);
    return this.operation(dir, filename, 'readBlob', () =>
      this.plugin.readBinaryFile({dir, filename})
      .then(init => {
        if (init.chunks === 0) return new Blob([], {type: contentType});
        if (init.chunks === 1) return BinaryContent.b64toBlob(init.data!, contentType);
        return this.readBlobChunk(init.id!, init.chunks, 2, init.data!, contentType);
      })
    );
  }

  private readBlobChunk(id: number, nbChunks: number, chunkIndex: number, b64: string, contentType?: string): Promise<Blob> {
    return this.plugin.readBinaryFileChunk({id})
    .then(r => {
      const b = b64 + r.data;
      if (chunkIndex === nbChunks) return BinaryContent.b64toBlob(b, contentType);
      return this.readBlobChunk(id, nbChunks, chunkIndex + 1, b, contentType);
    });
  }

  public saveJsonl(dir: string, filename: string, linesGenerator: (from: number, limit: number) => Promise<{lines: string[], hasMore: boolean}>, chunkSize: number = 250): Promise<any> {
    dir = this.sanitizeDir(dir);
    filename = this.sanitizeFilename(filename);
    return this.operation(dir, filename, 'saveJsonl', () =>
      linesGenerator(0, chunkSize)
      .then(generated => {
        if (generated.lines.length === 0) {
          return this.plugin.saveJsonlFile({dir, filename, events: [], more: false});
        }
        const chunks = this.splitJsonLinesToEvents(generated.lines);
        return this.plugin.saveJsonlFile({dir, filename, events: chunks[0], more: generated.hasMore || chunks.length > 1})
        .then(r => {
          if (r.id) return this.continueJsonl(r.id, chunks, 1, generated.hasMore, linesGenerator, chunkSize, chunkSize);
          return undefined;
        });
      })
    );
  }

  private splitJsonLinesToEvents(lines: string[]): JsonLEvent[][] {
    const chunks: JsonLEvent[][] = [];
    let chunk: JsonLEvent[] = [];
    let chunkSize = 0;
    for (const line of lines) {
      const len = line.length;
      if (chunkSize + len <= JSONL_CHUNK_MAX_SIZE) {
        chunk.push({d: line}, {nl: true});
        chunkSize += len + 20;
        continue;
      }
      let i = 0;
      do {
        let max = JSONL_CHUNK_MAX_SIZE - chunkSize;
        if (max < 1024) {
          chunks.push(chunk);
          chunk = [];
          chunkSize = 0;
          max = JSONL_CHUNK_MAX_SIZE;
        }
        if (len - i <= max) {
          chunk.push({d: line.substring(i, len)}, {nl: true});
          chunkSize += len - i + 20;
          break;
        }
        chunk.push({d: line.substring(i, i + max)});
        chunkSize += max;
        i += max;
      } while (true);
    }
    if (chunkSize > 0) chunks.push(chunk);
    return chunks;
  }

  private continueJsonl(id: number, eventsChunks: JsonLEvent[][], eventsChunkIndex: number, hasMoreLines: boolean, linesGenerator: (from: number, limit: number) => Promise<{lines: string[], hasMore: boolean}>, from: number, chunkSize: number = 250): Promise<any> {
    if (eventsChunkIndex < eventsChunks.length)
      return this.plugin.saveJsonlFileChunk({id, events: eventsChunks[eventsChunkIndex], more: hasMoreLines || eventsChunkIndex < eventsChunks.length - 1})
      .then(() => this.continueJsonl(id, eventsChunks, eventsChunkIndex + 1, hasMoreLines, linesGenerator, from, chunkSize));
    if (!hasMoreLines) return Promise.resolve(undefined);
    return linesGenerator(from, chunkSize)
    .then(generated => {
      if (generated.lines.length === 0) {
          return this.plugin.saveJsonlFileChunk({id, events: [], more: false});
        }
        const chunks = this.splitJsonLinesToEvents(generated.lines);
        return this.continueJsonl(id, chunks, 0, generated.hasMore, linesGenerator, from + chunkSize, chunkSize);
    });
  }

  public readJsonl(dir: string, filename: string, linesConsumer: (lines: string[]) => Promise<any>): Promise<any> {
    dir = this.sanitizeDir(dir);
    filename = this.sanitizeFilename(filename);
    const reader = new JsonlReader(linesConsumer);
    return this.operation(dir, filename, 'readJsonl', () =>
      this.plugin.readJsonlFile({dir, filename})
      .then(r => reader.consumeEvents(r.events).then(() => {
        if (!r.id) return reader.end();
        return this.continueReadJsonl(r.id, reader);
      }))
    );
  }

  private continueReadJsonl(id: number, reader: JsonlReader): Promise<any> {
    return this.plugin.readJsonlFileChunk({id})
    .then(r => {
      reader.consumeEvents(r.events);
      if (r.end) return reader.end();
      else return this.continueReadJsonl(id, reader);
    });
  }

}

class JsonlReader {
  constructor(
    private readonly linesConsumer: (lines: string[]) => Promise<any>
  ) {}

  private currentLine = '';

  consumeEvents(events: JsonLEvent[]): Promise<any> {
    const lines: string[] = [];
    for (const event of events) {
      if ((event as any)['nl']) {
        if (this.currentLine.length > 0) {
          lines.push(this.currentLine);
          this.currentLine = '';
        }
      } else {
        this.currentLine += (event as any).d;
      }
    }
    if (lines.length === 0) return Promise.resolve(undefined);
    return this.linesConsumer(lines);
  }

  end(): Promise<any> {
    return (this.currentLine.length > 0 ? this.linesConsumer([this.currentLine]) : Promise.resolve())
      .then(() => this.linesConsumer([]));
  }
}
