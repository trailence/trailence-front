import { Observable, first, forkJoin, map, of, switchMap } from "rxjs";
import { I18nService } from "../../services/i18n/i18n.service";
import { ObjectUtils } from "../../utils/object-utils";
import { IdGenerator } from 'src/app/utils/component-utils';

export type Attribute<T> = T | undefined | (() => T | undefined);

export interface BadgeConfig {
  text: Attribute<string>;
  color: Attribute<string>;
  fill: Attribute<boolean>;
}

export interface BadgesConfig {
  topLeft: Attribute<BadgeConfig>;
  topRight: Attribute<BadgeConfig>;
  bottomLeft: Attribute<BadgeConfig>;
  bottomRight: Attribute<BadgeConfig>;
}

export interface Badge {
  text: string;
  color: string;
  fill: boolean;
}

export interface Badges {
  topLeft?: Badge;
  topRight?: Badge;
  bottomLeft?: Badge;
  bottomRight?: Badge;
}

export class MenuItem {

  public icon: Attribute<string>;
  public i18nLabel: Attribute<string>;
  public label: Attribute<string>;
  public backgroundColor: Attribute<string>;
  public textColor: Attribute<string>;
  public textSize: Attribute<string>;
  public disabled: Attribute<boolean>;
  public visible: Attribute<boolean>;
  public badges: Attribute<BadgesConfig>;
  public cssClass: Attribute<string>;
  public sectionTitle?: boolean;
  public children?: MenuItem[];
  public childrenProvider?: () => Observable<MenuItem[]>;
  public customContentSelector?: string;
  public selected: Attribute<boolean>;
  public action?: () => void;

  public setIcon(icon: Attribute<string>): this {
    this.icon = icon;
    return this;
  }

  public setFixedLabel(label: Attribute<string>): this {
    this.label = label;
    return this;
  }

  public setI18nLabel(label: Attribute<string>): this {
    this.i18nLabel = label;
    return this;
  }

  public setAction(action?: () => void): this {
    this.action = action;
    return this;
  }

  public setBackgroundColor(color: Attribute<string>): this {
    this.backgroundColor = color;
    return this;
  }

  public setTextColor(color: Attribute<string>): this {
    this.textColor = color;
    return this;
  }

  public setCssClass(css: Attribute<string>): this {
    this.cssClass = css;
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

  public setDisabled(disabled: Attribute<boolean>): this {
    this.disabled = disabled;
    return this;
  }

  public setSelected(selected: Attribute<boolean>): this {
    this.selected = selected;
    return this;
  }

  public setVisible(visible: Attribute<boolean>): this {
    this.visible = visible;
    return this;
  }

  public addVisibleCondition(visible: Attribute<boolean>): this {
    const previous = this.visible;
    if (previous === undefined) return this.setVisible(visible);
    return this.setVisible(() => {
      const v = typeof visible === 'function' ? visible() : visible;
      if (!v) return false;
      return typeof previous === 'function' ? previous(): previous;
    });
  }

  public setBadges(badges: Attribute<BadgesConfig>): this {
    this.badges = badges;
    return this;
  }

  public setBadgeTopRight(badge: Attribute<BadgeConfig>): this {
    this.badges ??= {topRight: undefined, topLeft: undefined, bottomRight: undefined, bottomLeft: undefined};
    (this.badges as BadgesConfig).topRight = badge;
    return this;
  }

  public setBadgeTopLeft(badge: Attribute<BadgeConfig>): this {
    this.badges ??= {topRight: undefined, topLeft: undefined, bottomRight: undefined, bottomLeft: undefined};
    (this.badges as BadgesConfig).topLeft = badge;
    return this;
  }

  public setBadgeBottomRight(badge: Attribute<BadgeConfig>): this {
    this.badges ??= {topRight: undefined, topLeft: undefined, bottomRight: undefined, bottomLeft: undefined};
    (this.badges as BadgesConfig).bottomRight = badge;
    return this;
  }

  public setBadgeBottomLeft(badge: Attribute<BadgeConfig>): this {
    this.badges ??= {topRight: undefined, topLeft: undefined, bottomRight: undefined, bottomLeft: undefined};
    (this.badges as BadgesConfig).bottomLeft = badge;
    return this;
  }

  public setCustomContentSelector(selector?: string): this {
    this.customContentSelector = selector;
    return this;
  }

  public setTextSize(size: Attribute<string>): this {
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
    return this.disabled === undefined ? false : (typeof this.disabled === 'function' ? !!this.disabled() : this.disabled);
  }

  public isSelected(): boolean {
    return this.selected === undefined ? false : (typeof this.selected === 'function' ? !!this.selected() : this.selected);
  }

  public isVisible(): boolean {
    return this.visible === undefined ? true : (typeof this.visible === 'function' ? !!this.visible() : this.visible);
  }

  public getBadges(): Badges {
    const badges: Badges = { topLeft: undefined, topRight: undefined, bottomLeft: undefined, bottomRight: undefined };
    const config = this.badges === undefined ? undefined : typeof this.badges === 'function' ? this.badges() : this.badges;
    if (config === undefined) return badges;
    badges.topLeft = this.resolveBadge(config.topLeft);
    badges.topRight = this.resolveBadge(config.topRight);
    badges.bottomLeft = this.resolveBadge(config.bottomLeft);
    badges.bottomRight = this.resolveBadge(config.bottomRight);
    return badges;
  }

  private resolveBadge(badge: Attribute<BadgeConfig>): Badge | undefined {
    const config = badge === undefined ? undefined : typeof badge === 'function' ? badge() : badge;
    if (config === undefined) return undefined;
    const result: Badge = {
      text: (typeof config.text === 'function' ? config.text() : config.text) ?? '',
      color: (typeof config.color === 'function' ? config.color() : config.color) ?? '',
      fill: (typeof config.fill === 'function' ? config.fill() : config.fill) ?? false,
    };
    if (result.text === '') return undefined;
    return result;
  }

  public getTextSize(): string | undefined {
    if (typeof this.textSize === 'function') return this.textSize();
    return this.textSize;
  }

  public getCssClass(): string | undefined {
    if (typeof this.cssClass === 'function') return this.cssClass();
    return this.cssClass;
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
        this.hideFirstSeparators();
        this.hideLastSeparators();
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

  private hideFirstSeparators() {
    do {
      const item = this.firstVisible();
      if (!item?.separator) break;
      item.visible = false;
    } while (true);
  }

  private firstVisible(): ComputedMenuItem | undefined {
    for (const item of this._allItems) if (item.visible) return item;
    return undefined;
  }

  private hideLastSeparators() {
    do {
      const item = this.lastVisible();
      if (!item?.separator) break;
      item.visible = false;
    } while (true);
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
    this._moreComputed.visible = this._moreItem!.children.filter(item => !item.isSeparator() && item.isVisible()).length > 0;
    if (this._moreComputed.visible) this._allItems.push(this._moreComputed);
  }

}

export class ComputedMenuItem {

  public id = IdGenerator.generateId();
  public readonly separator: boolean;
  public clickable: boolean = true;
  public children = new ComputedMenuItems(this.i18n);
  public disabled: boolean = false;
  public visible: boolean = true;
  public icon?: string;
  public text$?: Observable<string>;
  public textColor?: string;
  public textSize: string | undefined | (() => string | undefined);
  public backgroundColor?: string;
  public badges: Badges = { topLeft: undefined, topRight: undefined, bottomLeft: undefined, bottomRight: undefined };
  public sectionTitle: boolean = false;
  public selected: boolean = false;
  public onlyText = false;
  public onlyIcon = false;
  public cssClass: string = '';

  private i18nKey?: string;
  private fixedLabel?: string;

  constructor(
    public item: MenuItem,
    private readonly i18n: I18nService,
  ) {
    this.separator = item.isSeparator();
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

  public refresh(): boolean { // NOSONAR
    let changed = false;
    changed = this.setValue(this.i18nKey, this.item.i18nLabel ? typeof this.item.i18nLabel === 'string' ? this.item.i18nLabel : this.item.i18nLabel() : undefined, v => this.i18nKey = v) || changed;
    changed = this.setValue(this.fixedLabel, this.i18nKey ? undefined : this.item.label ? typeof this.item.label === 'string' ? this.item.label : this.item.label() : undefined, v => this.fixedLabel = v) || changed;
    if (this.i18nKey) this.text$ = this.i18n.texts$.pipe(map(texts => ObjectUtils.extractField(texts, this.i18nKey ?? 'x')));
    else if (this.fixedLabel) this.text$ = of(this.fixedLabel);
    else this.text$ = undefined;
    changed = this.setValue(this.disabled, this.item.isDisabled(), v => this.disabled = v) || changed;
    changed = this.setValue(this.selected, this.item.isSelected(), v => this.selected = v) || changed;
    changed = this.setValue(this.icon, this.item.getIcon(), v => this.icon = v) || changed;
    changed = this.setValue(this.textColor, this.disabled ? 'disabled' : this.item.getTextColor(), v => this.textColor = v) || changed;
    changed = this.setValue(this.backgroundColor, this.disabled ? undefined : this.item.getBackgroundColor(), v => this.backgroundColor = v) || changed;
    changed = this.setValue(this.sectionTitle, this.item.isSectionTitle(), v => this.sectionTitle = v) || changed;
    changed = this.setValue(this.onlyText, this.icon === undefined, v => this.onlyText = v) || changed;
    changed = this.setValue(this.onlyIcon, !!this.icon && !this.item.label && !this.item.i18nLabel, v => this.onlyIcon = v) || changed;
    changed = this.setValue(this.textSize, this.item.getTextSize(), v => this.textSize = v) || changed;
    changed = this.setValue(this.cssClass, this.item.getCssClass(), v => this.cssClass = v ?? '') || changed;
    let newBadges = this.item.getBadges();
    changed = this.setBadge(this.badges.topLeft, newBadges.topLeft, v => this.badges.topLeft = v) || changed;
    changed = this.setBadge(this.badges.topRight, newBadges.topRight, v => this.badges.topRight = v) || changed;
    changed = this.setBadge(this.badges.bottomLeft, newBadges.bottomLeft, v => this.badges.bottomLeft = v) || changed;
    changed = this.setBadge(this.badges.bottomRight, newBadges.bottomRight, v => this.badges.bottomRight = v) || changed;
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

  private setBadge(current: Badge | undefined, newValue: Badge | undefined, setter: (v: Badge | undefined) => void): boolean {
    if (current === newValue) return false;
    if (current === undefined || newValue === undefined) {
      setter(newValue);
      return true;
    }
    if (current.text === newValue.text && current.color === newValue.color && current.fill === newValue.fill) return false;
    setter(newValue);
    return true;
  }

}
