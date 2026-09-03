import { distinct } from './utils';

export interface TestNode {
  readonly success: boolean;
  readonly testsTime: number;
  readonly hasMissingTime: boolean;
}

export class TestSet implements TestNode {
  constructor(
    public readonly name: string,
    public readonly commands: TestCommand[],
  ) {}

  public get success(): boolean { return this.commands.every(c => c.success); }
  public get testsTime(): number { return Math.max(...this.commands.map(c => c.testsTime)); }
  public get hasMissingTime(): boolean { return this.commands.some(c => c.hasMissingTime); }
  public get cmdTime(): number { return Math.max(...this.commands.map(c => c.cmdTime ?? 0)); }
}

export class TestCommand implements TestNode {
  constructor(
    public readonly cmdInstance: string,
    public readonly browser: string,
    public readonly browserSize: string,
    specs: SpecFile[],
    public readonly cmdTime: number | undefined,
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
  public get testsTime(): number { return this.dirs.reduce((p,n)=>p+n.testsTime, 0); }
  public get hasMissingTime(): boolean { return this.dirs.some(d => d.hasMissingTime); }
}

export class SpecDir implements TestNode {
  constructor(
    public readonly name: string,
    public readonly files: SpecFile[],
  ) {}

  public get success(): boolean { return this.files.every(f => f.success); }
  public get testsTime(): number { return this.files.reduce((p,n)=>p+n.testsTime, 0); }
  public get hasMissingTime(): boolean { return this.files.some(f => f.hasMissingTime); }
}

export class SpecFile implements TestNode {
  constructor(
    public readonly dir: string,
    public readonly file: string,
    public readonly suiteName: string,
    public readonly tests: Test[],
  ) {}

  public get success(): boolean { return this.tests.every(t => t.success); }
  public get testsTime(): number { return this.tests.reduce((p,n)=>p + (n.time ?? 0), 0) };
  public get hasMissingTime(): boolean { return this.tests.some(t => t.time === undefined); }
}

export interface Test {
  name: string;
  success: boolean;
  time?: number;
  error?: string[];
}
