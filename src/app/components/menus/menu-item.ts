import { Observable, first, forkJoin, map, of, switchMap } from "rxjs";
import { I18nService } from "../../services/i18n/i18n.service";
import { ObjectUtils } from "../../utils/object-utils";
import { IdGenerator } from 'src/app/utils/component-utils';

export class MenuItem {

  public icon?: string | (() => string | undefined);
  public i18nLabel?: string | (() => string);
  public label?: string | (() => string);
  public action?: () => void
  public backgroundColor?: string | (() => string | undefined);
  public textColor?: string | (() => string | undefined);
  public textSize: string | undefined | (() => string | undefined);
  public sectionTitle?: boolean;
  public children?: MenuItem[];
  public childrenProvider?: () => Observable<MenuItem[]>;
  public disabled?: boolean | (() => boolean);
  public visible?: boolean | (() => boolean);
  public badge?: string | (() => string | undefined);
  public customContentSelector?: string;

  public setIcon(icon?: string | (() => string | undefined)): this {
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

  public setAction(action?: () => void): this {
    this.action = action;
    return this;
  }

  public setBackgroundColor(color?: string | (() => string | undefined)): this {
    this.backgroundColor = color;
    return this;
  }

  public setTextColor(color?: string | (() => string | undefined)): this {
    this.textColor = color;
    return this;
  }

  public setSectionTitle(title?: boolean): this {
    this.sectionTitle = title;
    return this;
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

  public setTextSize(size: string | undefined | (() => string | undefined)): this {
    this.textSize = size;
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

  public getIcon(): string | undefined {
    if (typeof this.icon === 'function') return this.icon();
    return this.icon;
  }

  public getTextColor(): string | undefined {
    if (typeof this.textColor === 'function') return this.textColor();
    return this.textColor;
  }

  public getBackgroundColor(): string | undefined {
    if (typeof this.backgroundColor === 'function') return this.backgroundColor();
    return this.backgroundColor;
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

  public getTextSize(): string | undefined {
    if (typeof this.textSize === 'function') return this.textSize();
    return this.textSize;
  }

}

export class ComputedMenuItems {

  constructor(
    private readonly i18n: I18nService,
  ) {}

  public items: ComputedMenuItem[] = [];

  private _allItems: ComputedMenuItem[] = [];
  private _visibility = new Map<ComputedMenuItem, boolean>();
  private _maxItems?: number;
  private _moreItem?: MenuItem;
  private _moreComputed?: ComputedMenuItem;

  public setMoreMenu(
    maxItems: number | undefined = undefined,
    icon: string | undefined = 'more-menu',
    label: string | undefined = 'tools.more',
  ): void {
    this._maxItems = maxItems;
    this._moreItem = this._maxItems ? new MenuItem().setIcon(icon).setI18nLabel(label).setChildren([]) : undefined;
  }

  public refresh(): Observable<boolean> {
    return this.compute(this._allItems);
  }

  public compute(items?: (MenuItem | ComputedMenuItem)[]): Observable<boolean> {
    const newItems = items ?? [];
    let changed = false;

    // refresh list
    const newAllItems: ComputedMenuItem[] = [];
    for (const item of newItems) {
      if (item === this._moreComputed) continue;
      const existing = this._allItems.find(c => c === item || c.item === item);
      if (existing) {
        newAllItems.push(existing);
      } else {
        const newItem = item instanceof ComputedMenuItem ? item : new ComputedMenuItem(item, this.i18n);
        newAllItems.push(newItem);
        changed = true;
      }
    }
    this._allItems = newAllItems;

    // refresh visibility
    return forkJoin(this._allItems.map(i => i.refreshVisible$())).pipe(
      switchMap(itemsChanged => {
        changed = changed || itemsChanged.reduce((p, n) => p || n, false);
        this.hideEmptySections();
        this.hideConsecutiveSeparators();
        do {
          const item = this.firstVisible();
          if (!item?.separator) break;
          item.visible = false;
        } while (true);
        do {
          const item = this.lastVisible();
          if (!item?.separator) break;
          item.visible = false;
        } while (true);
        if (this.isOnlyTitles()) {
          for (const item of this._allItems) {
            if (item.visible) {
              item.visible = false;
            }
          }
        }
        this.computeMaxItems();

        // compute result of visibility, removing the hidden ones
        const visibleItems: ComputedMenuItem[] = [];
        const newVisibility = new Map<ComputedMenuItem, boolean>();
        for (const item of this._allItems) {
          const previousVisible = !!this._visibility.get(item);
          if (previousVisible !== item.visible) changed = true;
          newVisibility.set(item, item.visible);
          if (item.visible) visibleItems.push(item);
        }
        this._visibility = newVisibility;
        this.items.splice(0, this.items.length, ...visibleItems);

        // finally refresh only visible items
        for (const item of this.items) changed = item.refresh() || changed;

        if (!this._moreComputed?.visible)
          return of(changed);
        return this._moreComputed.children.compute(this._moreComputed.item.children).pipe(map(() => changed));
      }),
    );
  }

  private firstVisible(): ComputedMenuItem | undefined {
    for (const item of this._allItems) if (item.visible) return item;
    return undefined;
  }

  private lastVisible(): ComputedMenuItem | undefined {
    for (let i = this._allItems.length - 1; i >= 0; --i) if (this._allItems[i].visible) return this._allItems[i];
    return undefined;
  }

  private hideConsecutiveSeparators(): void {
    let previous = true;
    for (const item of this._allItems) {
      if (!item.visible) continue;
      if (item.separator) {
        if (previous) {
          item.visible = false;
        } else previous = true;
      } else {
        previous = false;
      }
    }
  }

  private hideEmptySections(): void {
    let currentSectionTitle: ComputedMenuItem | undefined = undefined;
    let currentSectionHasContent = false;
    for (const item of this._allItems) {
      if (!item.visible) continue;
      if (item.sectionTitle) {
        // new section
        if (currentSectionTitle !== undefined) {
          if (!currentSectionHasContent) {
            currentSectionTitle.visible = false;
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
    }
  }

  private isOnlyTitles(): boolean {
    for (const item of this._allItems) {
      if (!item.visible) continue;
      if (!!item.item.action || !!item.item.customContentSelector || !!item.children.firstVisible()) return false;
    }
    return true;
  }

  private computeMaxItems(): void {
    if (this._maxItems === undefined) return;
    this._moreItem!.children = [];
    let itemIndex = 0;
    for (const item of this._allItems) {
      if (!item.separator && item.visible) {
        itemIndex++;
      }
      if (itemIndex > this._maxItems) {
        item.visible = false;
        if (this._moreItem!.children.length > 0 || !item.separator) {
          this._moreItem!.children.push(item.item);
        }
      }
    }
    if (!this._moreComputed || this._moreComputed.item !== this._moreItem)
      this._moreComputed = new ComputedMenuItem(this._moreItem!, this.i18n);
    this._moreComputed.visible = this._moreItem!.children.length > 0;
    if (this._moreComputed.visible) this._allItems.push(this._moreComputed);
  }

}

export class ComputedMenuItem {

  public id = IdGenerator.generateId();
  public separator: boolean = false;
  public clickable: boolean = true;
  public children = new ComputedMenuItems(this.i18n);
  public disabled: boolean = false;
  public visible: boolean = true;
  public icon?: string;
  public text$?: Observable<string>;
  public textColor?: string;
  public textSize: string | undefined | (() => string | undefined);
  public backgroundColor?: string;
  public badge?: string;
  public sectionTitle: boolean = false;
  public onlyText = false;
  public onlyIcon = false;

  private i18nKey?: string;
  private fixedLabel?: string;

  constructor(
    public item: MenuItem,
    private readonly i18n: I18nService,
  ) {
  }

  public refreshVisible$(): Observable<boolean> {
    this.visible = this.item.isVisible();
    if (!this.visible) return of(false);
    // visibility depends on presence of children
    if (this.item.children === undefined && this.item.childrenProvider === undefined) {
      return of(false);
    }
    return this.item.getChildren$().pipe(
      first(),
      switchMap(children => this.children.compute(children)),
      map(childrenChanged => {
        let changed = childrenChanged;
        const hasChildren = !!this.children.items.find(child => child.visible);
        if (!hasChildren) {
          this.visible = false;
          return false;
        }
        changed = this.setValue(this.clickable, hasChildren, v => this.clickable = v) || changed;
        return changed;
      }),
    );
  }

  public refresh(): boolean {
    let changed = false;
    changed = this.setValue(this.i18nKey, this.item.i18nLabel ? typeof this.item.i18nLabel === 'string' ? this.item.i18nLabel : this.item.i18nLabel() : undefined, v => this.i18nKey = v) || changed;
    changed = this.setValue(this.fixedLabel, this.i18nKey ? undefined : this.item.label ? typeof this.item.label === 'string' ? this.item.label : this.item.label() : undefined, v => this.fixedLabel = v) || changed;
    if (this.i18nKey) this.text$ = this.i18n.texts$.pipe(map(texts => ObjectUtils.extractField(texts, this.i18nKey ?? 'x')));
    else if (this.fixedLabel) this.text$ = of(this.fixedLabel);
    else this.text$ = undefined;
    changed = this.setValue(this.separator, this.item.isSeparator(), v => this.separator = v) || changed;
    changed = this.setValue(this.disabled, this.item.isDisabled(), v => this.disabled = v) || changed;
    changed = this.setValue(this.icon, this.item.getIcon(), v => this.icon = v) || changed;
    changed = this.setValue(this.textColor, this.disabled ? 'medium' : this.item.getTextColor(), v => this.textColor = v) || changed;
    changed = this.setValue(this.backgroundColor, this.disabled ? undefined : this.item.getBackgroundColor(), v => this.backgroundColor = v) || changed;
    changed = this.setValue(this.badge, this.item.getBadge(), v => this.badge = v) || changed;
    changed = this.setValue(this.sectionTitle, this.item.isSectionTitle(), v => this.sectionTitle = v) || changed;
    changed = this.setValue(this.onlyText, this.icon === undefined, v => this.onlyText = v) || changed;
    changed = this.setValue(this.onlyIcon, !!this.icon && (!this.item.label || !this.item.i18nLabel), v => this.onlyIcon = v) || changed;
    changed = this.setValue(this.textSize, this.item.getTextSize(), v => this.textSize = v) || changed;
    if (this.item.action || this.separator || (!this.item.children && !this.item.childrenProvider)) {
      changed = this.setValue(this.clickable, !!this.item.action, v => this.clickable = v) || changed;
    }
    return changed;
  }

  private setValue<T>(previous: T, newValue: T, setter: (value: T) => void): boolean {
    if (newValue === previous) return false;
    setter(newValue);
    return true;
  }

}
