import { TrailDto } from './dto/trail';
import { Owned } from './owned';

export class Trail extends Owned {

  public name: string;
  public description: string;

  public originalTrackUuid: string;
  public currentTrackUuid: string;
  public collectionUuid: string;

  constructor(
    dto: Partial<TrailDto>
  ) {
    super(dto);
    this.name = dto.name ?? '';
    this.description = dto.description ?? '';
    if (!dto.originalTrackUuid) throw new Error('Missing originalTrackUuid');
    this.originalTrackUuid = dto.originalTrackUuid;
    if (!dto.currentTrackUuid) throw new Error('Missing currentTrackUuid');
    this.currentTrackUuid = dto.currentTrackUuid;
    if (!dto.collectionUuid) throw new Error('Missing collectionUuid');
    this.collectionUuid = dto.collectionUuid;
  }

  public override toDto(): TrailDto {
    return {
      ...super.toDto(),
      name: this.name,
      description: this.description,
      originalTrackUuid: this.originalTrackUuid,
      currentTrackUuid: this.currentTrackUuid,
      collectionUuid: this.collectionUuid,
    };
  }

}
