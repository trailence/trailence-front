import { Observable, map, of } from "rxjs";
import { I18nService } from "../services/i18n/i18n.service";
import { ObjectUtils } from "./object-utils";

export class MenuItem {

  public icon?: string;
  public i18nLabel?: string;
  public label?: string;
  public action?: () => void
  public color?: string;
  public children?: MenuItem[];
  public childrenProvider?: () => Observable<MenuItem[]>;

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

  public setColor(color?: string): this {
    this.color = color;
    return this;
  }

  public label$(i18n: I18nService): Observable<string> {
    if (this.i18nLabel) return i18n.texts$.pipe(map(texts => ObjectUtils.extractField(texts, this.i18nLabel!)));
    if (this.label) return of(this.label);
    return of('');
  }

  public setChildren(items: MenuItem[]): this {
    this.children = items;
    return this;
  }

  public setChildrenProvider(provider: () => Observable<MenuItem[]>): this {
    this.childrenProvider = provider;
    return this;
  }

  public getChildren$(): Observable<MenuItem[]> {
    if (this.children) {
      if (this.childrenProvider) {
        return this.childrenProvider().pipe(
          map(list => [...list, ...this.children!])
        );
      }
      return of(this.children);
    }
    if (this.childrenProvider) {
      return this.childrenProvider();
    }
    return of([]);
  }

}
