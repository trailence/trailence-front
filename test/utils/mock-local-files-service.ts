import { LocalFilesPlugin } from 'src/app/services/local-files/local-files.interface';
import { LocalFilesPluginProvider, LocalFilesService } from 'src/app/services/local-files/local-files.service';
import { BinaryContent } from 'src/app/utils/binary-content';

export function provideMockLocalFilesService() {
  return {
    provide: LocalFilesService,
    useValue: new LocalFilesService(mockLocalFilesPluginProvider())
  };
}

function mockLocalFilesPluginProvider(): LocalFilesPluginProvider {
  return {
    supported: () => true,
    getPlugin: () => new MockPlugin(),
  } as unknown as LocalFilesPluginProvider;
}

function createPromise(): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), 10);
  });
}

class MockPlugin implements LocalFilesPlugin {

  private readonly _root = new MockDir(null, '');

  private getDir(dir: string, create: boolean): Promise<MockDir | undefined> {
    return this._root.getDirectory(dir.split('/'), create);
  }

  public fileExists(call: {dir: string, filename: string}) {
    return this.getDir(call.dir, false).then(d => !!d && d.hasFile(call.filename)).then(r => ({exists: r}));
  };

  public filesExist(call: {dir: string, files: string[]}) {
    return this.getDir(call.dir, false).then(d => d ? d.hasFiles(call.files) : call.files.map(() => false)).then(r => ({exist: r}));
  }

  public async getFilesSize(call: {dir: string, files: string[]}): Promise<{files: {filename: string, size: number}[]}> {
    const d = await this.getDir(call.dir, false);
    if (!d) throw new Error('Unknown directory: ' + call.dir);
    return createPromise().then(() => d.getFileSizes(call.files)).then(r => ({files: r}));
  }

  public async listFiles(call: {dir: string}): Promise<{files: string[]}> {
    const d = await this.getDir(call.dir, false);
    if (!d) return {files: []};
    return createPromise().then(() => ({files: d.listFiles()}));
  }

  public async deleteFile(call: {dir: string, filename: string}): Promise<any> {
    const d = await this.getDir(call.dir, false);
    if (!d) return;
    return createPromise().then(() => d.deleteFiles([call.filename]));
  }

  public async deleteFiles(call: {dir: string, files: string[]}): Promise<any> {
    const d = await this.getDir(call.dir, false);
    if (!d) return;
    return createPromise().then(() => d.deleteFiles(call.files));
  }

  public async deleteAllFiles(call: {dir: string}): Promise<any> {
    const d = await this.getDir(call.dir, false);
    if (!d) return;
    return createPromise().then(() => d.deleteFiles(undefined));
  }

  public async deleteDirectoryAndContent(call: {dir: string}): Promise<any> {
    const d = await this.getDir(call.dir, false);
    if (!d) return true;
    return createPromise().then(() => d.delete());
  }

  public async renameDirectory(call: {previousPath: string, newPath: string}) {
    const d = await this.getDir(call.previousPath, false);
    if (!d) throw new Error('Directory not found');
    d.rename(call.newPath);
  }

  public readBinaryFile(call: {dir: string, filename: string}) {
    return this._root.startReadBinary(call.dir, call.filename);
  }
  public readBinaryFileChunk(call: {id: number}) {
    return this._root.continueReadBinary(call.id);
  }

  public readJsonlFile(call: {dir: string, filename: string}) {
    return this._root.startReadJsonl(call.dir, call.filename);
  }
  public readJsonlFileChunk(call: {id: number}) {
    return this._root.continueReadJsonl(call.id);
  }

  public saveBinaryFile(call: {dir: string, filename: string, size: number}) {
    return this._root.startWriteBinary(call.dir, call.filename, call.size);
  }
  public saveBinaryFileChunk(call: {id: number, data: string}) {
    return this._root.continueWriteBinary(call.id, call.data);
  }

  public saveJsonlFile(call: {dir: string, filename: string, lines: string[], more: boolean}) {
    return this._root.startWriteJsonl(call.dir, call.filename, call.lines, call.more);
  }
  public saveJsonlFileChunk(call: {id: number, lines: string[], more: boolean}) {
    return this._root.continueWriteJsonl(call.id, call.lines, call.more);
  }

}

class MockDir {

  constructor(
    private readonly parent: MockDir | null,
    private name: string,
  ) {}

  private readonly subDirs: MockDir[] = [];
  private files: MockFile[] = [];

  public rename(newName: string) {
    this.name = newName;
  }

  public delete(): Promise<any> {
    if (!this.parent) return Promise.reject('Cannot delete root dir');
    return this.parent.deleteSubDir(this);
  }

  private deleteSubDir(dir: MockDir): Promise<any> {
    const index = this.subDirs.indexOf(dir);
    if (index < 0) return Promise.reject('Directory not found');
    this.subDirs.splice(index, 1);
    return Promise.resolve(true);
  }

  private getSubDir(subName: string, create: boolean): MockDir | undefined {
    const d = this.subDirs.find(sd => sd.name === subName);
    if (!create || d) return d;
    const nd = new MockDir(this, subName);
    this.subDirs.push(nd);
    return nd;
  }

  public getFile(filename: string, create: boolean): MockFile | undefined {
    const ef = this.files.find(f => f.name === filename);
    if (!create || ef) return ef;
    const nf = new MockFile(filename);
    this.files.push(nf);
    return nf;
  }

  public getDirectory(path: string[], create: boolean): Promise<MockDir | undefined> {
    let d: MockDir | undefined = this as MockDir;
    for (const n of path) {
      if (n.trim().length === 0) continue;
      d = d.getSubDir(n, create);
      if (!d) break;
    }
    return createPromise().then(() => d);
  }

  public hasFile(filename: string): Promise<boolean> {
    return createPromise().then(() => this.getFile(filename, false)).then(f => !!f);
  }

  public hasFiles(files: string[]): Promise<boolean[]> {
    return createPromise().then(() => files.map(filename => !!this.getFile(filename, false)));
  }

  public getFileSizes(files: string[]): {filename: string, size: number}[] {
    return files.map(filename => {
      const f = this.getFile(filename, false);
      if (!f) return {filename, size: 0};
      return {filename, size: f.getSize()};
    });
  }

  public listFiles(): string[] {
    return this.files.map(f => f.name);
  }

  public deleteFiles(files: string[] | undefined): void {
    if (files === undefined) this.files = [];
    else this.files = this.files.filter(f => !files.includes(f.name));
  }

  private readonly _writeBinary = new Map<number, MockFile>();
  private _writeBinaryCounter = 0;

  public async startWriteBinary(dir: string, filename: string, size: number): Promise<{id: number, maxChunkSize: number} | {}> {
    const d = await this.getDirectory(dir.split('/'), true);
    const f = d!.getFile(filename, true)!;
    f.startWriteBinary(size);
    if (size === 0) return createPromise().then(() => ({}));
    const id = ++this._writeBinaryCounter;
    this._writeBinary.set(id, f);
    return createPromise().then(() => ({id, maxChunkSize: 10000}));
  }

  public async continueWriteBinary(id: number, data: string): Promise<{result: string}> {
    const f = this._writeBinary.get(id);
    if (!f) throw new Error('Invalid binary id: ' + id);
    return createPromise().then(() => {
      const done = f.continueWriteBinary(data);
      if (done) {
        this._writeBinary.delete(id);
        return {result: 'done'};
      }
      return {result: 'continue'};
    });
  }

  private readonly _readBinary = new Map<number, {file: MockFile, offset: number}>();
  private _readBinaryCounter = 0;

  public async startReadBinary(dir: string, filename: string): Promise<{data: string | undefined, chunks: number, id: number | undefined}> {
    const d = await this.getDirectory(dir.split('/'), false);
    if (!d) throw new Error('File not found: ' + dir + '/' + filename);
    const f = d.getFile(filename, false);
    if (!f) throw new Error('File not found: ' + dir + '/' + filename);
    const chunk = f.startReadBinary();
    if (chunk.chunks < 2) return createPromise().then(() => ({data: chunk.data, chunks: chunk.chunks, id: undefined}));
    const id = ++this._readBinaryCounter;
    this._readBinary.set(id, {file: f, offset: 1});
    return createPromise().then(() => ({...chunk, id}));
  }

  public async continueReadBinary(id: number): Promise<{data: string}> {
    const f = this._readBinary.get(id);
    if (!f) throw new Error('Invalid id: ' + id);
    const result = f.file.continueReadBinary(f.offset);
    if (result.done) this._readBinary.delete(id);
    return createPromise().then(() => ({data: result.data}));
  }

  private readonly _writeJsonl = new Map<number, MockFile>();
  private _writeJsonlCounter = 0;

  public async startWriteJsonl(dir: string, filename: string, lines: string[], more: boolean): Promise<{id: number | undefined}> {
    const d = await this.getDirectory(dir.split('/'), true);
    const f = d!.getFile(filename, true)!;
    f.startWriteJsonl(lines, more);
    if (!more) return createPromise().then(() => ({id: undefined}));
    const id = ++this._writeJsonlCounter;
    this._writeJsonl.set(id, f);
    return createPromise().then(() => ({id}));
  }

  public async continueWriteJsonl(id: number, lines: string[], more: boolean): Promise<{result: string}> {
    const f = this._writeJsonl.get(id);
    if (!f) throw new Error('Invalid jsonl id: ' + id);
    return createPromise().then(() => {
      f.continueWriteJsonl(lines, more);
      if (!more) this._writeJsonl.delete(id);
      return {result: more ? 'continue' : 'done'};
    });
  }

  private readonly _readJsonl = new Map<number, {file: MockFile, offset: number}>();
  private _readJsonlCounter = 0;

  public async startReadJsonl(dir: string, filename: string): Promise<{lines: string[], id: number | undefined}> {
    const d = await this.getDirectory(dir.split('/'), false);
    if (!d) throw new Error('File not found: ' + dir + '/' + filename);
    const f = d.getFile(filename, false);
    if (!f) throw new Error('File not found: ' + dir + '/' + filename);
    const result = f.startReadJsonl();
    if (result.more) {
      const id = ++this._readJsonlCounter;
      this._readJsonl.set(id, {file: f, offset: result.lines.length});
      return {lines: result.lines, id};
    }
    return {lines: result.lines, id: undefined};
  }

  public async continueReadJsonl(id: number): Promise<{lines: string[], end: boolean}> {
    const f = this._readJsonl.get(id);
    if (!f) throw new Error('Invalid id: ' + id);
    const result = f.file.continueReadJsonl(f.offset);
    if (result.more) {
      f.offset += result.lines.length;
      return createPromise().then(() => ({lines: result.lines, end: false}));
    }
    this._readJsonl.delete(id);
    return createPromise().then(() => ({lines: result.lines, end: true}));
  }

}

class MockFile {
  constructor(
    public readonly name: string,
  ) {}

  public getSize(): number {
    if (this._binary) return this.binarySize() || 0;
    return this.jsonlSize() || 0;
  }

  private _binary?: Uint8Array[];
  private _binarySize?: number;

  public startWriteBinary(size: number): void {
    this._binarySize = size;
    this._binary = [];
    this._jsonl = undefined;
    this._jsonlDone = undefined;
  }

  public continueWriteBinary(data: string): boolean {
    const s = this.binarySize();
    if (s === undefined) throw new Error('Unexpected continueWriteBinary: not started');
    if (s === this._binarySize) throw new Error('Unexpected continueWriteBinary: already done');
    const byteCharacters = atob(data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    this._binary!.push(byteArray);
    const ns = this.binarySize()!;
    if (ns > this._binarySize!) throw new Error('binary exceeded initial size: ' + ns + ' > ' + this._binarySize);
    if (ns === this._binarySize!) return true;
    return false;
  }

  private binarySize(): number | undefined {
    if (this._binary === undefined) return undefined;
    let total = 0;
    for (const a of this._binary) total += a.byteLength;
    return total;
  }

  public startReadBinary(): {data: string | undefined, chunks: number} {
    if (!this._binary) throw new Error('Not a binary file');
    const s = this.binarySize();
    if (s !== this._binarySize) throw new Error('Binary file was not complete: ' + s + ' < ' + this._binarySize);
    if (s === 0) return {data: undefined, chunks: 0};
    return {data: BinaryContent.uint8ArrayToBase64(this._binary[0]), chunks: this._binary.length};
  }

  public continueReadBinary(chunk: number): {done: boolean, data: string} {
    if (!this._binary) throw new Error('Not a binary file');
    if (chunk >= this._binary.length) throw new Error('Unexpected chunk to read');
    const data = BinaryContent.uint8ArrayToBase64(this._binary[chunk]);
    return {data, done: chunk === this._binary.length - 1};
  }

  private _jsonl?: string[];
  private _jsonlDone?: boolean;

  public startWriteJsonl(lines: string[], more: boolean) {
    this._jsonl = [...lines];
    this._jsonlDone = !more;
    this._binary = undefined;
    this._binarySize = undefined;
  }

  public continueWriteJsonl(lines: string[], more: boolean) {
    if (!this._jsonl) throw new Error('Not a jsonl');
    if (this._jsonlDone) throw new Error('Jsonl already done');
    this._jsonl.push(...lines);
    this._jsonlDone = !more;
  }

  public startReadJsonl(): {lines: string[], more: boolean} {
    if (!this._jsonl) throw new Error('Not a jsonl');
    if (!this._jsonlDone) throw new Error('Jsonl write not completed');
    if (this._jsonl.length <= 5) return {lines: [...this._jsonl], more: false};
    return {lines: this._jsonl.slice(0, 5), more: true};
  }

  public continueReadJsonl(offset: number): {lines: string[], more: boolean} {
    if (!this._jsonl) throw new Error('Not a jsonl');
    if (!this._jsonlDone) throw new Error('Jsonl write not completed');
    if (offset >= this._jsonl.length) throw new Error('Invalid jsonl offset: ' + offset + ' > ' + (this._jsonl.length - 1));
    if (offset + 5 >= this._jsonl.length) return {lines: this._jsonl.slice(offset), more: false};
    return {lines: this._jsonl.slice(offset, offset + 5), more: true};
  }

  private jsonlSize(): number | undefined {
    if (!this._jsonl) return undefined;
    let total = 0;
    for (const line of this._jsonl) total += line.length + 1;
    return total;
  }
}
