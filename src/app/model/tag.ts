import { BehaviorSubject, Observable } from "rxjs";
import { Owned } from "./owned";
import { TagDto } from "./dto/tag";
import { OwnedDto } from "./dto/owned";

export class Tag extends Owned {

    private _name$: BehaviorSubject<string>;
    private _collectionUuid: string;
    private _parentUuid$: BehaviorSubject<string | null>;

    constructor(
        dto: Partial<TagDto>,
    ) {
        super(dto);
        this._name$ = new BehaviorSubject<string>(dto.name ?? '');
        if (!dto.collectionUuid) throw new Error('Missing collectionUuid');
        this._collectionUuid = dto.collectionUuid;
        this._parentUuid$ = new BehaviorSubject<string | null>(dto.parentUuid ?? null);
    }

    public get name(): string { return this._name$.value; }
    public get name$(): Observable<String> { return this._name$; }
    public set name(value: string) { if (value !== this._name$.value) this._name$.next(value); }

    public get collectionUuid(): string { return this._collectionUuid; }

    public get parentUuid(): string | null { return this._parentUuid$.value; }
    public get parentUuid$(): Observable<string | null> { return this._parentUuid$; }
    public set parentUuid(value: string | null) { if (value !== this._parentUuid$.value) this._parentUuid$.next(value); }

    public override toDto(): TagDto {
        return {
            ...super.toDto(),
            name: this._name$.value,
            collectionUuid: this._collectionUuid,
            parentUuid: this._parentUuid$.value || undefined,
        };
    }

}
