import { Observable, first, forkJoin, map, of } from "rxjs";
import { I18nService } from "../../services/i18n/i18n.service";
import { ObjectUtils } from "../../utils/object-utils";
import { IdGenerator } from 'src/app/utils/component-utils';
import { Arrays } from 'src/app/utils/arrays';

export class MenuItem {

  public icon?: string;
  public i18nLabel?: string;
  public label?: string;
  public action?: () => void
  public color?: string;
  public textColor?: string;
  public children?: MenuItem[];
  public childrenProvider?: () => Observable<MenuItem[]>;
  public disabled?: boolean | (() => boolean);
  public visible?: boolean | (() => boolean);
  public badge?: string | (() => string | undefined);

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

  public setTextColor(color?: string): this {
    this.textColor = color;
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

  public setDisabled(disabled?: boolean | (() => boolean)): this {
    this.disabled = disabled;
    return this;
  }

  public setVisible(visible?: boolean | (() => boolean)): this {
    this.visible = visible;
    return this;
  }

  public setBadge(badge?: string | (() => string | undefined)): this {
    this.badge = badge;
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

  public isSeparator(): boolean {
    return !this.action && !this.icon && !this.label && !this.i18nLabel;
  }

  public isDisabled(): boolean {
    return this.disabled === undefined ? false : (typeof this.disabled === 'function' ? this.disabled() : this.disabled);
  }

  public isVisible(): boolean {
    return this.visible === undefined ? true : (typeof this.visible === 'function' ? this.visible() : this.visible);
  }

  public getBadge(): string | undefined {
    if (this.badge === undefined) return undefined;
    const value = typeof this.badge === 'function' ? this.badge() : this.badge;
    if (value === undefined || value.length === 0) return undefined;
    return value;
  }

}

export class ComputedMenuItems {

  public items: ComputedMenuItem[] = [];

  private _previousItems: MenuItem[] = [];

  public compute(items?: MenuItem[], forceRefresh: boolean = false): Observable<boolean> {
    const newItems = items ?? [];
    let refresh$: Observable<boolean>[];
    if (!forceRefresh && Arrays.sameContent(this._previousItems, newItems)) {
      refresh$ = this.items.map(i => i.refresh$());
    } else {
      this._previousItems = newItems;
      refresh$ = [];

      const previousItems = [...this.items];
      if (this.items.length > 0)
        this.items.splice(0, this.items.length);
      for (const item of newItems) {
        const existing = previousItems.find(c => c.item === item);
        if (existing) {
          this.items.push(existing);
          refresh$.push(existing.refresh$());
        } else {
          const newItem = new ComputedMenuItem(item);
          this.items.push(newItem);
          refresh$.push(newItem.refresh$().pipe(map(() => true)));
        }
      }
    }
    return forkJoin(refresh$).pipe(map(result => result.reduce((p, n) => p || n, false)));
  }

}

export class ComputedMenuItem {

  public id = IdGenerator.generateId();
  public separator: boolean = false;
  public clickable: boolean = true;
  public children: MenuItem[] = [];
  public disabled: boolean = false;
  public textColor?: string;
  public visible: boolean = true;
  public badge?: string;

  constructor(
    public item: MenuItem,
  ) {
  }

  public refresh$(): Observable<boolean> {
    let changed = false;
    changed = this.setValue(this.separator, this.item.isSeparator(), v => this.separator = v) || changed;
    changed = this.setValue(this.disabled, this.item.isDisabled(), v => this.disabled = v) || changed;
    changed = this.setValue(this.visible, this.item.isVisible(), v => this.visible = v) || changed;
    changed = this.setValue(this.textColor, this.disabled ? 'medium' : this.item.textColor, v => this.textColor = v) || changed;
    changed = this.setValue(this.badge, this.item.getBadge(), v => this.badge = v) || changed;
    return this.item.getChildren$().pipe(
      first(),
      map(children => {
        if (!Arrays.sameContent(this.children, children)) {
          this.children = children;
          changed = true;
        }
        changed = this.setValue(this.clickable, !!this.item.action || !!this.children, v => this.clickable = v) || changed;
        return changed;
      }),
    );
  }

  private setValue<T>(previous: T, newValue: T, setter: (value: T) => void): boolean {
    if (newValue === previous) return false;
    setter(newValue);
    return true;
  }

  public static identify(index: number, item: ComputedMenuItem): any {
    return item.id;
  }

}
