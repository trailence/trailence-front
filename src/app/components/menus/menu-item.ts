import { Observable, combineLatest, map, of, switchMap } from "rxjs";

export type MenuConfigAttribute<T> = T | Observable<T>;

export abstract class MenuElement<ComputedState> {
  abstract state: Observable<ComputedState>;
  getState(computed: ComputedMenuElement<ComputedState>): ComputedState {
    return computed.state;
  }
}

export class MenuSection extends MenuElement<{content: ComputedMenuElement<any>[]}> {
  constructor(
    config: MenuSectionConfig,
  ) {
    super();
    this.icon = fromConfig(config.icon);
    this.label = fromConfig(config.label);
    this.subLabels = fromConfigArray(config.subLabels);
    this.backgroundColor = fromConfig(config.backgroundColor);
    this.textColor = fromConfig(config.textColor);
    this.textSize = fromConfig(config.textSize);
    this.cssClass = fromConfig(config.cssClass);
    this.showAsToolbarMin = config.showAsToolbarMin ?? 0;
    this.showAsToolbarMax = config.showAsToolbarMax ?? 0;

    this.state = fromConfig(config.content).pipe(
      switchMap(content => computeMenuElements(content)),
      map(content => ({content})),
    );
  }

  icon: Observable<string | undefined>;
  label: Observable<string | undefined>;
  subLabels: Observable<string[]>;
  backgroundColor: Observable<string | undefined>;
  textColor: Observable<string | undefined>;
  textSize: Observable<string | undefined>;
  cssClass: Observable<string | undefined>;

  state: Observable<{content: ComputedMenuElement<any>[]}>;

  showAsToolbarMin: number;
  showAsToolbarMax: number;

}

export interface MenuSectionConfig {
  icon?: MenuConfigAttribute<string | undefined>; // NOSONAR
  label?: MenuConfigAttribute<string | undefined>; // NOSONAR
  subLabels?: MenuConfigAttribute<string | string[] | undefined>; // NOSONAR
  backgroundColor?: MenuConfigAttribute<string | undefined>; // NOSONAR
  textColor?: MenuConfigAttribute<string | undefined>; // NOSONAR
  textSize?: MenuConfigAttribute<string | undefined>; // NOSONAR
  cssClass?: MenuConfigAttribute<string | undefined>; // NOSONAR
  showAsToolbarMin?: number;
  showAsToolbarMax?: number;
  content: MenuConfigAttribute<MenuElement<any>[]>;
}

export class MenuSeparator extends MenuElement<undefined> {
  state = of(undefined);
}

export class MenuItem extends MenuElement<{visible: boolean, children: ComputedMenuElement<any>[] | undefined}> {
  constructor(
    config: MenuItemConfig,
    public data?: any,
  ) {
    super();
    this.state = fromConfig(config.visible).pipe(
      switchMap(visible => {
        if (visible === false) return of({visible: false, children: undefined});
        if (visible === true)
          return fromConfig(config.children).pipe(
            switchMap(children => {
              if (children !== undefined) return computeMenuElements(children).pipe(map(computed => ({visible: true, children: computed})));
              return of({visible: true, children: undefined});
            }),
          );
        return fromConfig(config.children).pipe(
          switchMap(children => {
            if (children === undefined) {
              return of({visible: true, children: undefined});
            }
            return computeMenuElements(children).pipe(
              switchMap(computed => {
                if (computed.length > 0) return of({visible: true, children: computed});
                return fromConfig(config.hiddenWhenNoChildren).pipe(
                  map(hidden => {
                    if (hidden === false) return {visible: true, children: []};
                    return {visible: false, children: []};
                  })
                );
              }),
            );
          })
        );
      })
    );
    this.disabled = fromConfig(config.disabled).pipe(map(disabled => disabled ?? false));
    this.selected = fromConfig(config.selected);
    this.icon = fromConfig(config.icon);
    this.label = fromConfig(config.label);
    this.subLabels = fromConfigArray(config.subLabels);
    this.backgroundColor = fromConfig(config.backgroundColor);
    this.textColor = fromConfig(config.textColor);
    this.textSize = fromConfig(config.textSize);
    this.spinner = fromConfig(config.spinner);
    this.cssClass = fromConfig(config.cssClass);
    this.badges = fromConfig(config.badges).pipe(map(badges => badges ?? {}));
    this.action = config.action;
  }

  state: Observable<{visible: boolean, children: ComputedMenuElement<any>[] | undefined}>;
  disabled: Observable<boolean>;
  selected: Observable<boolean | undefined>;
  icon: Observable<string | undefined>;
  label: Observable<string | undefined>;
  subLabels: Observable<string[]>;
  backgroundColor: Observable<string | undefined>;
  textColor: Observable<string | undefined>;
  textSize: Observable<string | undefined>;
  spinner: Observable<string | undefined>;
  cssClass: Observable<string | undefined>;
  badges: Observable<Badges>;
  action?: (event: Event) => void;
}

export interface MenuItemConfig {
  visible?: MenuConfigAttribute<boolean | undefined>; // NOSONAR
  children?: MenuConfigAttribute<MenuElement<any>[] | undefined>; // NOSONAR
  hiddenWhenNoChildren?: MenuConfigAttribute<boolean | undefined>; // NOSONAR

  disabled?: MenuConfigAttribute<boolean | undefined>; // NOSONAR
  selected?: MenuConfigAttribute<boolean | undefined>; // NOSONAR

  icon?: MenuConfigAttribute<string | undefined>; // NOSONAR
  label?: MenuConfigAttribute<string | undefined>; // NOSONAR
  subLabels?: MenuConfigAttribute<string | string[] | undefined>; // NOSONAR
  backgroundColor?: MenuConfigAttribute<string | undefined>; // NOSONAR
  textColor?: MenuConfigAttribute<string | undefined>; // NOSONAR
  textSize?: MenuConfigAttribute<string | undefined>; // NOSONAR
  spinner?: MenuConfigAttribute<string | undefined>; // NOSONAR
  cssClass?: MenuConfigAttribute<string | undefined>; // NOSONAR
  badges?: MenuConfigAttribute<Badges | undefined>; // NOSONAR

  action?: (event: Event) => void;
}

export interface Badge {
  text: string;
  color?: string;
  fill?: boolean;
}

export interface Badges {
  topLeft?: Badge;
  topRight?: Badge;
  bottomLeft?: Badge;
  bottomRight?: Badge;
}

export class MenuItemCustom extends MenuElement<{visible: boolean}> {
  constructor(
    config: MenuItemCustomConfig,
  ) {
    super();
    this.contentSelector = config.contentSelector;
    this.state = fromConfig(config.visible).pipe(
      map(visible => ({visible: visible ?? true})),
    );
  }

  state: Observable<{visible: boolean}>;
  contentSelector: string;
}

export interface MenuItemCustomConfig {
  visible?: MenuConfigAttribute<boolean | undefined>; // NOSONAR
  contentSelector: string;
}

function fromConfig<T>(config: MenuConfigAttribute<T>): Observable<T> {
  if (config instanceof Observable) return config;
  return of(config);
}

function fromConfigArray<T>(config: MenuConfigAttribute<T | T[] | undefined>): Observable<T[]> {
  if (!config) return of([]);
  if (!(config instanceof Observable)) config = of(config);
  return config.pipe(map(value => {
    if (Array.isArray(value)) return value;
    if (value === undefined) return [];
    return [value];
  }));
}

export class ComputedMenuElement<T> {
  constructor(
    public readonly element: MenuElement<T>,
    public readonly state: T,
  ) {}
}

export function computeMenuElements(elements: MenuElement<any>[]): Observable<ComputedMenuElement<any>[]> {
  if (elements.length === 0) return of([]);
  return combineLatest(elements.map(element => element.state.pipe(map(state => new ComputedMenuElement(element, state))))).pipe(
    map(items => {
      items = removeNotVisibleItems(items);
      removeConsecutiveSeparators(items);
      removeFirstSeparators(items);
      removeLastSeparators(items);
      return items;
    })
  );
}

function removeNotVisibleItems(items: ComputedMenuElement<any>[]): ComputedMenuElement<any>[] {
  const result: ComputedMenuElement<any>[] = [];
  for (const item of items) {
    if (item.element instanceof MenuSection) {
      if (item.element.getState(item).content.length > 0) result.push(item);
    } else if (item.element instanceof MenuItem) {
      if (item.element.getState(item).visible) result.push(item);
    } else if (item.element instanceof MenuSeparator) {
      result.push(item);
    } else if (item.element instanceof MenuItemCustom) {
      if (item.element.getState(item).visible) result.push(item);
    }
  }
  return result;
}

function removeConsecutiveSeparators(items: ComputedMenuElement<any>[]): void {
  let previous = true;
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];
    if (item.element instanceof MenuSeparator) {
      if (previous) {
        items.splice(i, 1);
        i--;
      } else {
        previous = true;
      }
    } else {
      previous = false;
    }
  }
}

function removeFirstSeparators(items: ComputedMenuElement<any>[]): void {
  let i = 0;
  while (i < items.length && items[i].element instanceof MenuSeparator) ++i;
  if (i > 0) items.splice(0, i);
}

function removeLastSeparators(items: ComputedMenuElement<any>[]): void {
  let i = 0;
  while (i < items.length && items.at(-(i + 1)) instanceof MenuSeparator) ++i;
  if (i > 0) items.splice(items.length - i, i);
}


export type MenuSource$ = Observable<MenuSection | MenuElement<any>[] | ComputedMenuElement<any>[]>;
export type MenuSource = MenuSource$ | MenuSection | MenuElement<any>[] | ComputedMenuElement<any>[];

export function combineMenuSources(sources: MenuSource[]): MenuSource {
  if (sources.length === 0) return [];
  if (sources.length === 1) return sources[0];
  return combineLatest(sources.map(source => source instanceof Observable ? source : of(source))).pipe(
    switchMap(s => {
      const result: Observable<ComputedMenuElement<any>[]>[] = [];
      for (const source of s) {
        if (Array.isArray(source)) {
          if (source.length > 0) {
            if (source[0] instanceof ComputedMenuElement) result.push(of(source as ComputedMenuElement<any>[]));
            else result.push(computeMenuElements(source as MenuElement<any>[]));
          }
        } else {
          result.push(source.state.pipe(map(state => state.content)));
        }
      }
      if (result.length === 0) return of([]);
      if (result.length === 1) return result[0];
      return combineLatest(result).pipe(
        map(list => list.flat()),
      );
    })
  )
}
