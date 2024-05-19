import { Subscription } from 'rxjs';
import { Subscriptions } from '../utils/subscription-utils';
import { Track } from './track';
import { Versioned } from './versioned';

export class Trail extends Versioned {

  private _name: string;
  private _description: string;

  private _originalTrack: Track;
  private _track: Track;

  private _subscriptions = new Map<Track, Subscription>();

  constructor(
    fields?: Partial<Trail>
  ) {
    super(fields);
    this._name = fields?.name ?? '';
    this._description = fields?.description ?? '';
    this._originalTrack = fields?.originalTrack ?? new Track();
    this._track = fields?.track ?? this.originalTrack;
  }

  public get name(): string { return this._name; }
  public get description(): string { return this._description; }

  public get originalTrack(): Track { return this._originalTrack; }
  public get track(): Track { return this._track; }

  public set name(name: string) {
    if (name !== this._name) {
      this._name = name;
      this.updated = true;
    }
  }

  public set description(description: string) {
    if (description !== this._description) {
      this._description = description;
      this.updated = true;
    }
  }

}
