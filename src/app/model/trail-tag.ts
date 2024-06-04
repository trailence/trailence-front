import { TrailTagDto } from "./dto/trail-tag";

export class TrailTag {

    private _tagUuid: string;
    private _trailUuid: string;

    constructor(
        dto: Partial<TrailTagDto>
    ) {
        if (!dto.tagUuid) throw new Error('Missing tagUuid');
        this._tagUuid = dto.tagUuid;
        if (!dto.trailUuid) throw new Error('Missing trailUuid');
        this._trailUuid = dto.trailUuid;
    }

    public get tagUuid(): string { return this._tagUuid; }
    public get trailUuid(): string { return this._trailUuid; }

    public toDto(): TrailTagDto {
        return { tagUuid: this._tagUuid, trailUuid: this._trailUuid };
    }

}