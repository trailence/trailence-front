import { Track } from 'src/app/model/track';
import { Trail } from 'src/app/model/trail';
import { TrailService } from 'src/app/services/database/trail.service';
import { Console } from 'src/app/utils/console';

export class PublicationChecklist {

  constructor(
    public readonly trailUuid: string,
    public readonly trailOwner: string,
    items: {[key: string]: boolean}
  ) {
    this.items = {};
    for (const key of PublicationChecklistItems) {
      this.items[key] = items[key] ?? false;
    }
  }

  public items: {[key: string]: boolean};

  public get nbChecked(): number {
    return Object.values(this.items).reduce((p,n) => p + (n ? 1 : 0), 0);
  }

  public get nbItems(): number {
    return Object.values(this.items).length;
  }

  public get nbUnchecked(): number {
    return this.nbItems - this.nbChecked;
  }

  public save(): void {
    localStorage.setItem(LOCALSTORAGE_PREFIX + this.trailUuid + '.' + this.trailOwner, JSON.stringify(this.items));
  }

  public delete(): void {
    localStorage.removeItem(LOCALSTORAGE_PREFIX + this.trailUuid + '.' + this.trailOwner);
  }

  public static load(trail: Trail, track: Track, trailService: TrailService): PublicationChecklist {
    const s = localStorage.getItem(LOCALSTORAGE_PREFIX + trail.uuid + '.' + trail.owner);
    let p: PublicationChecklist;
    if (s) {
      try {
        const json = JSON.parse(s);
        p = new PublicationChecklist(trail.uuid, trail.owner, json);
      } catch (e) {
        Console.warn('Cannot parse checklist for trail', trail.uuid, trail.owner, e);
        p = new PublicationChecklist(trail.uuid, trail.owner, {});
      }
    } else {
      p = new PublicationChecklist(trail.uuid, trail.owner, {});
    }
    if (!trail.date && track.startDate) {
      trail.date = track.startDate;
      trailService.doUpdate(trail, t => t.date = track.startDate!);
    }
    if (trail.date) p.items['date'] = true;
    if (trail.location.length > 2) p.items['location'] = true;
    return p;
  }

}

const LOCALSTORAGE_PREFIX = 'trailence.pub_checklist.';
export const PublicationChecklistItems: string[] = [
  'iam_author',
  'name', 'description',
  'date', 'location', 'activity',
  'track',
  'waypoints',
  'photos'
];
