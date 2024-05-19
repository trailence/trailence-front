import { Trail } from '../trail';

export class TrailDto {

  public id: string;
  public version: number;
  public updated: boolean;
  public name: string;
  public description: string;

  public originalTrackId: string;
  public trackId: string;

  constructor(
    fields?: Partial<TrailDto>
  ) {
    this.id = fields?.id ?? '';
    this.version = fields?.version ?? 0;
    this.updated = fields?.updated ?? false;
    this.name = fields?.name ?? '';
    this.description = fields?.description ?? '';
    this.originalTrackId = fields?.originalTrackId ?? '';
    this.trackId = fields?.trackId ?? '';
  }

  public static of(trail: Trail): TrailDto {
    return new TrailDto({
      id: trail.id,
      version: trail.version,
      updated: trail.updated,
      name: trail.name,
      description: trail.description,
      originalTrackId: trail.originalTrack.id,
      trackId: trail.track.id,
    });
  }

  public toTrail(): Trail {
    const trail = new Trail({
      id: this.id,
      version: this.version,
      updated: this.updated,
      name: this.name,
      description: this.description,
    });
    return trail;
  }

}
