import { SHARED_OWNER_PREFIX, TrailCollectionDto, TrailCollectionType } from "./dto/trail-collection";
import { Owned } from "./owned";

export class TrailCollection extends Owned {

    public name: string;
    public type: TrailCollectionType;
    public sharedWith?: string[];
    public sharedBy?: string;

    constructor(
        dto: Partial<TrailCollectionDto>
    ) {
        super(dto);
        this.name = dto.name ?? '';
        if (!dto.type) throw new Error('Missing type');
        this.type = dto.type;
        this.sharedWith = dto.sharedWith ?? undefined;
        this.sharedBy = dto.sharedBy ?? undefined;
    }

    public override toDto(): TrailCollectionDto {
        return {
            ...super.toDto(),
            name: this.name,
            type: this.type,
            sharedWith: this.sharedWith,
            sharedBy: this.sharedBy,
        };
    }

    public getContentOwner(): string {
      if (this.type === TrailCollectionType.SHARED) return SHARED_OWNER_PREFIX + this.uuid;
      return this.owner;
    }

}
