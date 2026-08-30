import { distinct } from './utils';

export class TestSet {
  constructor(
    public readonly name: string,
    public readonly commands: TestCommand[],
  ) {}

  public get success(): boolean { return this.commands.every(c => c.success); }
  public get time(): number { return Math.max(...this.commands.map(c => c.time)); }
}

export class TestCommand {
  constructor(
    public readonly cmdInstance: string,
    public readonly browser: string,
    public readonly browserSize: string,
    specs: SpecFile[],
  ) {
    this.dirnames = distinct(specs.map(s => s.dir)).sort((d1, d2) => d1.localeCompare(d2));
    this.command = browser + ' ' + browserSize + ':' + this.dirnames.join(',');
    this.dirs = this.dirnames.map(dir => new SpecDir(dir, specs.filter(s => s.dir === dir).sort((f1,f2) => f1.file.localeCompare(f2.file))));
  }

  public readonly dirnames: string[];
  public readonly command: string;
  public readonly dirs: SpecDir[];
  public screenShotFile?: string;

  public get success(): boolean { return this.dirs.every(d => d.success); }
  public get time(): number { return this.dirs.reduce((p,n)=>p+n.time, 0); }
}

export class SpecDir {
  constructor(
    public readonly name: string,
    public readonly files: SpecFile[],
  ) {}

  public get success(): boolean { return this.files.every(f => f.success); }
  public get time(): number { return this.files.reduce((p,n)=>p+n.time, 0); }
}

export class SpecFile {
  constructor(
    public readonly dir: string,
    public readonly file: string,
    public readonly suiteName: string,
    public readonly tests: Test[],
  ) {}

  public get success(): boolean { return this.tests.every(t => t.success); }
  public get time(): number { return this.tests.reduce((p,n)=>p + (n.time ?? 0), 0) };
}

export interface Test {
  name: string;
  success: boolean;
  time?: number;
  error?: string[];
}
