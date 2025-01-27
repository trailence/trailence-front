import { TrailTagDto } from "./dto/trail-tag";

export class TrailTag {

    private readonly _tagUuid: string;
    private readonly _trailUuid: string;
    private readonly _createdAt: number;

    constructor(
        dto: Partial<TrailTagDto>
    ) {
        if (!dto.tagUuid) throw new Error('Missing tagUuid');
        this._tagUuid = dto.tagUuid;
        if (!dto.trailUuid) throw new Error('Missing trailUuid');
        this._trailUuid = dto.trailUuid;
        this._createdAt = dto.createdAt ?? Date.now();
    }

    public get tagUuid(): string { return this._tagUuid; }
    public get trailUuid(): string { return this._trailUuid; }
    public get createdAt(): number { return this._createdAt; }

    public toDto(): TrailTagDto {
        return { tagUuid: this._tagUuid, trailUuid: this._trailUuid, createdAt: this._createdAt };
    }

}
