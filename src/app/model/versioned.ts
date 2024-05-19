import { Updatable } from './updatable';

export class Versioned extends Updatable {

  public id: string;
  public version: number;

  constructor(
    fields?: Partial<Versioned>,
  ) {
    super(fields);
    this.id = fields?.id ?? '';
    this.version = fields?.version ?? 0;
  }

}
