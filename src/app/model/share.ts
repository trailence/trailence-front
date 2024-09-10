import { ShareDto, ShareElementType } from './dto/share';

export class Share {

  constructor(
    public id: string,
    public name: string,
    public from: string,
    public to: string,
    public type: ShareElementType,
    public createdAt: number,
    public elements: string[],
    public trails: string[],
    public toLanguage: string | null | undefined,
    public includePhotos: boolean,
  ) {}

  public toDto(): ShareDto {
    return {
      id: this.id,
      name: this.name,
      from: this.from,
      to: this.to,
      type: this.type,
      createdAt: this.createdAt,
      elements: this.elements,
      trails: this.trails,
      toLanguage: this.toLanguage,
      includePhotos: this.includePhotos,
    };
  }

  public static fromDto(dto: ShareDto): Share {
    return new Share(
      dto.id, dto.name, dto.from, dto.to, dto.type, dto.createdAt, dto.elements || [], dto.trails || [], dto.toLanguage, dto.includePhotos ?? false
    );
  }
}
