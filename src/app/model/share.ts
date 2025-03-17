import { Arrays } from '../utils/arrays';
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
      elements: [...this.elements],
      trails: [...this.trails],
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
      dto.elements ? [...dto.elements] : [],
      dto.trails ? [...dto.trails] : [],
      dto.mailLanguage,
    );
  }

  public isEqual(other: Share): boolean {
    return this.uuid === other.uuid &&
      this.owner === other.owner &&
      this.version === other.version &&
      this.createdAt === other.createdAt &&
      this.updatedAt === other.updatedAt &&
      Arrays.sameContent(this.recipients, other.recipients) &&
      this.type === other.type &&
      this.name === other.name &&
      this.includePhotos === other.includePhotos &&
      Arrays.sameContent(this.elements, other.elements) &&
      Arrays.sameContent(this.trails, other.trails) &&
      this.mailLanguage === other.mailLanguage;
  }
}
