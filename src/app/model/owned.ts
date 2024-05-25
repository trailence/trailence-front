import { OwnedDto } from "./dto/owned";
import { Versioned } from "./versioned";

export class Owned extends Versioned {
    private _owner: string;

    constructor(
        dto: Partial<OwnedDto>
    ) {
        super(dto);
        if (!dto.owner) throw new Error('Missing owner');
        this._owner = dto.owner;
    }

    public get owner() { return this._owner; }

    public override toDto(): OwnedDto {
        return {
            ...super.toDto(),
            owner: this.owner,
        }
    }

}