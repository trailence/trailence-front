import fs from 'node:fs';
import { FileHandle } from 'node:fs/promises';
import { MemoryLimiter } from '../util/memory-limiter';
import { Buf, durationToString } from '../util/util';
import { PromiseLimiter, PromiseParallel } from '../util/promise-limiter';
import { readFully } from '../util/fs-util';

export abstract class IndexFileWriter {

  constructor(
    private readonly fd: Promise<FileHandle>,
    entrySize: number,
    nbEntriesBuffer: number,
    private readonly memoryLimiter: MemoryLimiter,
  ) {
    this.bufSize = entrySize * nbEntriesBuffer;
    this.buf = Buf.of(this.bufSize);
    this.write = Promise.resolve();
  }

  protected bufSize: number;
  protected buf: Buf;
  private write: Promise<any>;

  protected async entryAdded() {
    if (this.buf.offset === this.bufSize) await this.flush();
  }

  private async flush() {
    const buf = this.buf;
    this.buf = Buf.of(this.bufSize);
    this.write = this.write.then(() => this.fd.then(fd => fd.write(buf.buffer, 0, buf.offset)));
    await this.memoryLimiter.add(this.write, this.bufSize);
  }

  public async close() {
    if (this.buf.offset > 0) this.write = this.write.then(() => this.fd.then(fd => fd.write(this.buf.buffer, 0, this.buf.offset)));
    await this.write;
    await this.fd.then(fd => fd.close());
  }

}


export abstract class IndexFileReader<T> {
  constructor(
    private readonly dir: string,
    private readonly entrySize: number,
    nbEntriesBuffer: number,
    learnEveryBuffer: number,
    dichotomyNbEntries: number,
  ) {
    this.bufferSize = entrySize * nbEntriesBuffer;
    this.learnEvery = learnEveryBuffer;
    this.dichotomySize = dichotomyNbEntries * this.entrySize;
  }

  public async resolveElements(elementsByKey: {index: number; subIds: number[]}[], allowUnresolved: boolean, shutingDown: {get: () => boolean}): Promise<Map<number, Map<number, T>>> {
    const promises: Promise<any>[] = [];
    const output = new Map<number, Map<number, T>>();
    let count = 0;
    const start = Date.now();
    const fileOperations = new PromiseParallel(4);
    const indexProcess = new PromiseParallel(128);
    const nb = elementsByKey.length;
    let resolved = 0;
    let lastLog = start;
    const resolve: ((entry: {index: number; subIds: number[]}) => Promise<any>) = entry =>
      this.resolveElementsFromFile(entry.index, entry.subIds, allowUnresolved, fileOperations, shutingDown)
      .then(map => {
        output.set(entry.index, map);
        resolved += map.size;
        entry.subIds = []; // GC
        const now = Date.now();
        count++;
        if ((now - lastLog) >= 60000) {
          console.log(' +', count, 'indexes processed', resolved, 'resolved after', durationToString(now - start));
          lastLog = now;
        }
      });
    let lastIndex = elementsByKey.length - 1;
    let firstIndex = 0;
    while (lastIndex >= firstIndex) {
      for (let i = 0; i < 3 && lastIndex >= firstIndex; ++i) {
        const e1 = elementsByKey[lastIndex--];
        promises.push(indexProcess.push(() => resolve(e1)));
      }
      if (lastIndex >= firstIndex) {
        const e2 = elementsByKey[firstIndex++];
        promises.push(indexProcess.push(() => resolve(e2)));
      }
    }
    await Promise.all(promises);
    console.log(' => ', resolved, 'elements resolved from', nb, 'indexes in', durationToString(Date.now() - start));
    return output;
  }

  private readonly learnt = new Map<number, number[]>();

  private readonly bufferSize: number;
  private readonly learnEvery: number;
  private readonly dichotomySize: number;

  private async resolveElementsFromFile(indexKey: number, subIds: number[], allowUnresolved: boolean, fileOperations: PromiseLimiter, shutingDown: {get: () => boolean}): Promise<Map<number, T>> {
    const output = new Map<number, T>();
    if (shutingDown.get()) return output;
    let pfd = fs.promises.open(this.dir + '/' + indexKey, 'r');
    let fileLearning = this.learnt.get(indexKey);
    if (!fileLearning) {
      fileLearning = [];
      this.learnt.set(indexKey, fileLearning);
    }
    const initialNb = subIds.length;
    let sortedIndex = 0;
    let offset = this.getNextOffset(0 - this.bufferSize, fileLearning, subIds[sortedIndex]);
    const buffer = Buffer.allocUnsafe(this.bufferSize);
    let fd = await pfd;
    do {
      const read = await fileOperations.push(() => readFully(fd, buffer, 0, this.bufferSize, offset));
      if ((read % this.entrySize) !== 0) throw new Error('Invalid index ' + indexKey + ' ? ' + read + ' bytes read at ' + offset);
      if (read === 0) break;
      sortedIndex = await this.resolveBuffer(buffer, 0, read, subIds, sortedIndex, allowUnresolved, output, fileLearning, offset);
      if (read < this.bufferSize) break;
      if (sortedIndex >= subIds.length) break;
      const nextOffset = this.getNextOffset(offset, fileLearning, subIds[sortedIndex]);
      if (nextOffset < offset + this.bufferSize) throw new Error('Unexpected next offset');
      offset = nextOffset;
    } while (!shutingDown.get());
    fd.close();
    if (sortedIndex < subIds.length && !allowUnresolved && !shutingDown.get())
      throw new Error('Elements not found in index ' + indexKey + ': ' + sortedIndex + '/' + subIds.length + ', ' + subIds.slice(sortedIndex) + '; offset = ' + offset + '; found = ' + output.size + '/' + initialNb);
    return output;
  }

  public async close() {
    // nothing
  }

  private async resolveBuffer(buffer: Buffer, from: number, to: number, sorted: number[], sortedIndex: number, allowUnresolved: boolean, output: Map<number, T>, fileLearning: number[] | undefined, offset: number): Promise<number> {
    return await new Promise<number>((resolve,reject) => setTimeout(() => this._resolveBuffer(buffer, from, to, sorted, sortedIndex, allowUnresolved, output, fileLearning, offset).then(resolve).catch(reject), 0));
  }

  private async _resolveBuffer(buffer: Buffer, from: number, to: number, sorted: number[], sortedIndex: number, allowUnresolved: boolean, output: Map<number, T>, fileLearning: number[] | undefined, offset: number): Promise<number> {
    const lastId = buffer.readUInt32LE(to - this.entrySize);
    if (fileLearning) {
      const bufferIndex = offset / this.bufferSize;
      if (bufferIndex > 0 && (bufferIndex % this.learnEvery) === 0) {
        const i = (bufferIndex / this.learnEvery) - 1;
        if (i === fileLearning.length) fileLearning.push(lastId);
      }
    }
    if (sorted[sortedIndex] > lastId) return sortedIndex;
    if (sorted[sortedIndex] === lastId) {
      this.resolveElement(buffer, to - this.entrySize, lastId, output);
      return sortedIndex + 1;
    }
    const lastIndex = sorted.indexOf(lastId); // TODO improve ?
    if (lastIndex > sortedIndex) {
      this.resolveElement(buffer, to - this.entrySize, lastId, output);
      sorted.splice(lastIndex, 1);
    }
    to -= this.entrySize;
    if (to - from > this.dichotomySize) {
      sortedIndex = await this.resolveBuffer(buffer, from, from + this.dichotomySize, sorted, sortedIndex, allowUnresolved, output, undefined, offset);
      if (sortedIndex >= sorted.length || sorted[sortedIndex] > lastId) return sortedIndex;
      from += this.dichotomySize;
      if (to - from > this.dichotomySize) {
        sortedIndex = await this.resolveBuffer(buffer, from, to - this.dichotomySize, sorted, sortedIndex, allowUnresolved, output, undefined, offset);
        if (sortedIndex >= sorted.length || sorted[sortedIndex] > lastId) return sortedIndex;
        from = to - this.dichotomySize;
      }
    }
    if (!allowUnresolved) {
      for (let i = from; i < to; i += this.entrySize) {
        const id = buffer.readUInt32LE(i);
        if (sorted[sortedIndex] === id) {
          this.resolveElement(buffer, i, id, output);
          sortedIndex++;
          if (sortedIndex >= sorted.length || sorted[sortedIndex] > lastId) break;
        }
      }
    } else {
      let maxId: number | undefined = undefined;
      for (let i = from; i < to; i += this.entrySize) {
        const id = buffer.readUInt32LE(i);
        const index = sorted.indexOf(id, sortedIndex);
        if (index >= 0) {
          this.resolveElement(buffer, i, id, output);
          sortedIndex = index + 1;
          if (sortedIndex >= sorted.length || sorted[sortedIndex] > lastId) break;
        }
        maxId = id;
      }
      if (maxId !== undefined) {
        while (sortedIndex < sorted.length && sorted[sortedIndex] < maxId) sortedIndex++;
      }
    }
    return sortedIndex;
  }

  private resolveElement(buffer: Buffer, pos: number, id: number, output: Map<number, T>) {
    output.set(id, this.readElement(buffer, pos));
  }

  protected abstract readElement(buffer: Buffer, pos: number): T;

  private getNextOffset(current: number, fileLearning: number[], nextId: number): number {
    // fileLearning[i] => offset LEARN_EVERY * BUFFER_SIZE * (i + 1)
    let next = current + this.bufferSize;
    if (fileLearning.length === 0) return next;
    const minLearnt = Math.floor(next / (this.bufferSize * this.learnEvery)) - 1;
    if (minLearnt < 0) return next;
    let nextPossible = 0;
    for (let i = minLearnt; i < fileLearning.length; ++i) {
      if (nextId <= fileLearning[i]) break;
      nextPossible = (i + 1) * this.bufferSize * this.learnEvery;
    }
    if (nextPossible > next) return nextPossible;
    return next;
  }

}
