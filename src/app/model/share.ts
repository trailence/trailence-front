import { ShareDto, ShareElementType } from './dto/share';

export class Share {

  constructor(
    public uuid: string,
    public owner: string,
    public version: number,
    public createdAt: number,
    public updatedAt: number,
    public recipients: string[],
    public type: ShareElementType,
    public name: string,
    public includePhotos: boolean,
    public elements: string[],
    public trails: string[],
    public mailLanguage: string | null | undefined,
  ) {}

  public toDto(): ShareDto {
    return {
      uuid: this.uuid,
      owner: this.owner,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      recipients: [...this.recipients],
      type: this.type,
      name: this.name,
      includePhotos: this.includePhotos,
      elements: this.elements,
      trails: this.trails,
      mailLanguage: this.mailLanguage,
    };
  }

  public static fromDto(dto: ShareDto): Share {
    return new Share(
      dto.uuid,
      dto.owner,
      dto.version,
      dto.createdAt,
      dto.updatedAt,
      [...dto.recipients],
      dto.type,
      dto.name,
      dto.includePhotos ?? false,
      dto.elements || [],
      dto.trails || [],
      dto.mailLanguage,
    );
  }
}
