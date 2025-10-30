import * as fs from 'fs';

export class Config {

  private loaded: {[name: string]: {[key:string]: any}} = {};

  constructor(
    private readonly mode: string
  ) {}

  private loadConfig(name: string): {[key:string]: any} {
    if (this.loaded[name]) return this.loaded[name];
    let cfg: {[key:string]: any} = {};
    cfg = this.loadConfigFile('./config/common/' + name + '.json', cfg);
    cfg = this.loadConfigFile('./config/common/secrets/' + name + '.json', cfg);
    cfg = this.loadConfigFile('./config/' + this.mode + '/' + name + '.json', cfg);
    cfg = this.loadConfigFile('./config/' + this.mode + '/secrets/' + name + '.json', cfg);
    this.loaded[name] = cfg;
    return cfg;
  }

  private loadConfigFile(path: string, cfg: {[key:string]: any}): {[key:string]: any} {
    if (!fs.existsSync(path)) return cfg;
    const json = JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' }));
    return {...cfg, ...json};
  }

  public getValue(name: string, key: string): any {
    return this.loadConfig(name)[key];
  }

  public getString(name: string, key: string): string | undefined {
    const value = this.getValue(name, key);
    if (value !== undefined && typeof value !== 'string') throw new Error('Invalid configuration ' + name + '.' + key + ': expected a string');
    return value;
  }

  public getRequiredString(name: string, key: string, defaultValue?: string): string {
    const value = this.getString(name, key);
    if (value === undefined) {
      if (!defaultValue) throw new Error('Missing configuration ' + name + '.' + key);
      return defaultValue;
    }
    return value;
  }

  public getBoolean(name: string, key: string): boolean | undefined {
    const value = this.getValue(name, key);
    if (value !== undefined && typeof value !== 'boolean') throw new Error('Invalid configuration ' + name + '.' + key + ': expected a boolean');
    return value;
  }

  public getRequiredBoolean(name: string, key: string, defaultValue?: boolean): boolean {
    const value = this.getBoolean(name, key);
    if (value === undefined) {
      if (!defaultValue) throw new Error('Missing configuration ' + name + '.' + key);
      return defaultValue;
    }
    return value;
  }

}
