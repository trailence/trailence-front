import { Observable, map, of } from "rxjs";
import { I18nService } from "../services/i18n/i18n.service";
import { ObjectUtils } from "./object-utils";

export class MenuItem {

    public icon?: string;
    public i18nLabel?: string;
    public label?: string;
    public action?: () => void

    constructor() {}

    public setIcon(icon: string): this {
        this.icon = icon;
        return this;
    }

    public setFixedLabel(label: string): this {
        this.label = label;
        return this;
    }

    public setI18nLabel(label: string): this {
        this.i18nLabel = label;
        return this;
    }

    public setAction(action: () => void): this {
        this.action = action;
        return this;
    }

    public label$(i18n: I18nService): Observable<string> {
        if (this.i18nLabel) return i18n.texts$.pipe(map(texts => ObjectUtils.extractField(texts, this.i18nLabel!)));
        if (this.label) return of(this.label);
        return of('');
    }

}