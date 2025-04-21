import { TrailCollectionDto, TrailCollectionType } from "./dto/trail-collection";
import { Owned } from "./owned";

export class TrailCollection extends Owned {

    public name: string;
    public type: TrailCollectionType;

    constructor(
        dto: Partial<TrailCollectionDto>
    ) {
        super(dto);
        this.name = dto.name ?? '';
        if (!dto.type) throw new Error('Missing type');
        this.type = dto.type;
    }

    public override toDto(): TrailCollectionDto {
        return {
            ...super.toDto(),
            name: this.name,
            type: this.type,
        };
    }

}
