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
    this.buf = new Buf(this.bufSize);
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
    this.buf = new Buf(this.bufSize);
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

  public async resolveElements(elementsByKey: {index: number; subIds: number[]}[]): Promise<Map<number, Map<number, T>>> {
    const promises: Promise<any>[] = [];
    const output = new Map<number, Map<number, T>>();
    let count = 0;
    const start = Date.now();
    const fileOperations = new PromiseParallel(4);
    const indexProcess = new PromiseParallel(20);
    const nb = elementsByKey.length;
    let resolved = 0;
    for (let i = 0; i < nb; ++i) {
      promises.push(indexProcess.push(() => {
        const entry = elementsByKey.pop()!;
        return this.resolveElementsFromFile(entry.index, entry.subIds, fileOperations)
          .then(map => {
            output.set(entry.index, map);
            resolved += map.size;
            if ((++count % 1000) === 0) console.log(' +', count, 'indexes processed', resolved, 'resolved after', durationToString(Date.now() - start));
          });
      }));
    }
    await Promise.all(promises);
    console.log(' => ', resolved, 'elements resolved from', nb, 'indexes in', durationToString(Date.now() - start));
    return output;
  }

  private readonly learnt = new Map<number, number[]>();

  private readonly bufferSize: number;
  private readonly learnEvery: number;
  private readonly dichotomySize: number;

  private async resolveElementsFromFile(indexKey: number, subIds: number[], fileOperations: PromiseLimiter): Promise<Map<number, T>> {
    let pfd = fs.promises.open(this.dir + '/' + indexKey, 'r');
    let fileLearning = this.learnt.get(indexKey);
    if (!fileLearning) {
      fileLearning = [];
      this.learnt.set(indexKey, fileLearning);
    }
    let offset = this.getNextOffset(0 - this.bufferSize, fileLearning, subIds[0]);
    const buffer = Buffer.allocUnsafe(this.bufferSize);
    const output = new Map<number, T>();
    let fd = await pfd;
    do {
      const read = await fileOperations.push(() => readFully(fd, buffer, 0, this.bufferSize, offset));
      if ((read % this.entrySize) !== 0) throw new Error('Invalid index ' + indexKey + ' ? ' + read + ' bytes read at ' + offset);
      await this.resolveBuffer(buffer, 0, read, subIds, output, fileLearning, offset);
      if (read < this.bufferSize) break;
      if (subIds.length === 0) break;
      const nextOffset = this.getNextOffset(offset, fileLearning, subIds[0]);
      if (nextOffset < offset + this.bufferSize) throw new Error('Unexpected next offset');
      offset = nextOffset;
    } while (true);
    if (subIds.length > 0) throw new Error('Elements not found in index ' + indexKey + ': ' + subIds.length + ': ' + subIds);
    fd.close();
    return output;
  }

  public async close() {
    // nothing
  }

  private async resolveBuffer(buffer: Buffer, from: number, to: number, sorted: number[], output: Map<number, T>, fileLearning: number[] | undefined, offset: number) {
    await new Promise((resolve,reject) => setTimeout(() => this._resolveBuffer(buffer, from, to, sorted, output, fileLearning, offset).catch(reject).then(resolve), 0));
  }

  private async _resolveBuffer(buffer: Buffer, from: number, to: number, sorted: number[], output: Map<number, T>, fileLearning: number[] | undefined, offset: number) {
    const lastId = buffer.readUInt32LE(to - this.entrySize);
    if (fileLearning) {
      const bufferIndex = offset / this.bufferSize;
      if (bufferIndex > 0 && (bufferIndex % this.learnEvery) === 0) {
        const i = (bufferIndex / this.learnEvery) - 1;
        if (i === fileLearning.length) fileLearning.push(lastId);
      }
    }
    if (sorted[0] > lastId) return;
    if (sorted[0] === lastId) {
      this.resolveElement(buffer, to - this.entrySize, lastId, output);
      sorted.shift();
      return;
    }
    const lastIndex = sorted.indexOf(lastId); // TODO improve ?
    if (lastIndex >= 0) {
      this.resolveElement(buffer, to - this.entrySize, lastId, output);
      sorted.splice(lastIndex, 1);
    }
    if (to - from > this.dichotomySize) {
      await this.resolveBuffer(buffer, from, from + this.dichotomySize, sorted, output, undefined, offset);
      if (sorted.length === 0 || sorted[0] > lastId) return;
      from += this.dichotomySize;
      if (to - from > this.dichotomySize) {
        await this.resolveBuffer(buffer, from, to - this.dichotomySize, sorted, output, undefined, offset);
        if (sorted.length === 0 || sorted[0] > lastId) return;
        from = to - this.dichotomySize;
      }
    }
    for (let i = from; i < to - this.entrySize; i += this.entrySize) {
      const id = buffer.readUInt32LE(i);
      if (sorted[0] === id) {
        this.resolveElement(buffer, i, id, output);
        sorted.shift();
        if (sorted.length === 0) return;
        if (sorted[0] > lastId) return;
      }
    }
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
