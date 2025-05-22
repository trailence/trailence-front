import { Observable, first, forkJoin, map, of, switchMap } from "rxjs";
import { I18nService } from "../../services/i18n/i18n.service";
import { ObjectUtils } from "../../utils/object-utils";
import { IdGenerator } from 'src/app/utils/component-utils';
import { Arrays } from 'src/app/utils/arrays';

export class MenuItem {

  public icon?: string;
  public i18nLabel?: string | (() => string);
  public label?: string | (() => string);
  public action?: () => void
  public color?: string;
  public textColor?: string;
  public sectionTitle?: boolean;
  public children?: MenuItem[];
  public childrenProvider?: () => Observable<MenuItem[]>;
  public disabled?: boolean | (() => boolean);
  public visible?: boolean | (() => boolean);
  public badge?: string | (() => string | undefined);
  public customContentSelector?: string;

  public setIcon(icon?: string): this {
    this.icon = icon;
    return this;
  }

  public setFixedLabel(label?: string | (() => string)): this {
    this.label = label;
    return this;
  }

  public setI18nLabel(label?: string | (() => string)): this {
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

  public setSectionTitle(title?: boolean): this {
    this.sectionTitle = title;
    return this;
  }

  public label$(i18n: I18nService): Observable<string> {
    if (this.i18nLabel) {
      const key = typeof this.i18nLabel === 'string' ? this.i18nLabel : this.i18nLabel();
      return i18n.texts$.pipe(map(texts => ObjectUtils.extractField(texts, key)));
    }
    if (this.label) {
      return of(typeof this.label === 'string' ? this.label : this.label());
    }
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

  public setCustomContentSelector(selector?: string): this {
    this.customContentSelector = selector;
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
    return !this.action && !this.icon && !this.label && !this.i18nLabel && !this.customContentSelector;
  }

  public isSectionTitle(): boolean {
    return this.sectionTitle ?? false;
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

  private _previousItems: (MenuItem | ComputedMenuItem)[] = [];

  public forceRefresh(): Observable<boolean> {
    return this.compute(this.items.map(i => i.item), true);
  }

  public compute(items?: (MenuItem | ComputedMenuItem)[], forceRefresh: boolean = false): Observable<boolean> {
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
        const existing = previousItems.find(c => c === item || c.item === item);
        if (existing) {
          this.items.push(existing);
          refresh$.push(existing.refresh$());
        } else {
          const newItem = item instanceof ComputedMenuItem ? item : new ComputedMenuItem(item);
          this.items.push(newItem);
          refresh$.push(newItem.refresh$().pipe(map(() => true)));
        }
      }
    }
    return forkJoin(refresh$).pipe(
      map(result => {
        let changed = result.reduce((p, n) => p || n, false);
        changed = this.hideEmptySections() || changed;
        changed = this.hideConsecutiveSeparators() || changed;
        do {
          const item = this.firstVisible();
          if (!item?.separator) break;
          item.visible = false;
          changed = true;
        } while (true);
        do {
          const item = this.lastVisible();
          if (!item?.separator) break;
          item.visible = false;
          changed = true;
        } while (true);
        if (this.isOnlyTitles()) {
          for (const item of this.items) {
            if (item.visible) {
              item.visible = false;
              changed = true;
            }
          }
        }
        return changed;
      })
    );
  }

  firstVisible(): ComputedMenuItem | undefined {
    for (const item of this.items) if (item.visible) return item;
    return undefined;
  }

  lastVisible(): ComputedMenuItem | undefined {
    for (let i = this.items.length - 1; i >= 0; --i) if (this.items[i].visible) return this.items[i];
    return undefined;
  }

  hideConsecutiveSeparators(): boolean {
    let changed = false;
    let previous = true;
    for (const item of this.items) {
      if (!item.visible) continue;
      if (item.separator) {
        if (previous) {
          item.visible = false;
          changed = true;
        } else previous = true;
      } else {
        previous = false;
      }
    }
    return changed;
  }

  hideEmptySections(): boolean {
    let changed = false;
    let currentSectionTitle: ComputedMenuItem | undefined = undefined;
    let currentSectionHasContent = false;
    for (const item of this.items) {
      if (!item.visible) continue;
      if (item.sectionTitle) {
        // new section
        if (currentSectionTitle !== undefined) {
          if (!currentSectionHasContent) {
            currentSectionTitle.visible = false;
            changed = true;
          }
        }
        currentSectionTitle = item;
        currentSectionHasContent = false;
      } else if (!item.separator) {
        currentSectionHasContent = true;
      }
    }
    if (currentSectionTitle !== undefined && !currentSectionHasContent) {
      currentSectionTitle.visible = false;
      changed = true;
    }
    return changed;
  }

  isOnlyTitles(): boolean {
    for (const item of this.items) {
      if (!item.visible) continue;
      if (!!item.item.action || !!item.item.customContentSelector || !!item.children.firstVisible()) return false;
    }
    return true;
  }

}

export class ComputedMenuItem {

  public id = IdGenerator.generateId();
  public separator: boolean = false;
  public clickable: boolean = true;
  public children = new ComputedMenuItems();
  public disabled: boolean = false;
  public textColor?: string;
  public visible: boolean = true;
  public badge?: string;
  public sectionTitle: boolean = false;
  public onlyText = false;
  public onlyIcon = false;

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
    changed = this.setValue(this.sectionTitle, this.item.isSectionTitle(), v => this.sectionTitle = v) || changed;
    changed = this.setValue(this.onlyText, this.item.icon === undefined, v => this.onlyText = v) || changed;
    changed = this.setValue(this.onlyIcon, !!this.item.icon && (!this.item.label || !this.item.i18nLabel), v => this.onlyIcon = v) || changed;
    if (this.item.action || this.separator || (!this.item.children && !this.item.childrenProvider)) {
      changed = this.setValue(this.clickable, !!this.item.action, v => this.clickable = v) || changed;
      return of(changed);
    }
    return this.item.getChildren$().pipe(
      first(),
      switchMap(children => this.children.compute(children, true)),
      map(childrenChanged => {
        changed = changed || childrenChanged;

        const hasChildren = !!this.children.items.find(child => child.visible);
        changed = this.setValue(this.visible, hasChildren, v => this.visible = v) || changed;
        changed = this.setValue(this.clickable, hasChildren, v => this.clickable = v) || changed;
        return changed;
      }),
    );
  }

  private setValue<T>(previous: T, newValue: T, setter: (value: T) => void): boolean {
    if (newValue === previous) return false;
    setter(newValue);
    return true;
  }

}
