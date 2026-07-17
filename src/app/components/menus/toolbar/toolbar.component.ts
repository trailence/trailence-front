import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { IonIcon, IonLabel, PopoverController, IonBadge, IonSpinner } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ChangesDetection } from 'src/app/utils/angular-helpers';
import { NgStyle } from '@angular/common';
import { Badges, ComputedMenuElement, computeMenuElements, MenuElement, MenuItem, MenuItemCustom, MenuSection, MenuSeparator, MenuSource, MenuSource$ } from '../menu-item';
import { combineLatest, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';

type MenuView = Title | Separator | Item | Custom;

interface Title {
  type: 'title';
  icon?: string;
  title: string;
  backgroundColor?: string;
  textColor?: string;
  textSize?: string;
  cssClass?: string;
}
interface Separator {
  type: 'separator';
}
interface Item {
  type: 'item';
  icon?: string;
  label?: string;
  subLabels: string[];
  backgroundColor?: string;
  textColor?: string;
  textSize?: string;
  cssClass?: string;
  disabled: boolean;
  selected?: boolean;
  spinner?: string;
  badges: Badges;
  children: ComputedMenuElement<any>[] | undefined;
  item: MenuItem;
}
interface Custom {
  type: 'custom';
  contentSelector: string;
}

const NO_MENU: MenuSource$ = of([]);

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  imports: [
    IonBadge, IonLabel, IonIcon, IonSpinner,
    NgStyle,
  ]
})
export class ToolbarComponent implements OnInit, OnChanges {

  @Input() menu$?: MenuSource;

  @Input() direction: 'horizontal' | 'vertical' = 'horizontal';
  @Input() iconSize = 20;
  @Input() iconOnlySize = 24;
  @Input() textSize = '13px';
  @Input() align: 'left' | 'right' | 'center' | 'fill' = 'fill';
  @Input() itemSpace = '4px';
  @Input() separatorSpace?: string;
  @Input() itemPaddingTop = '4px';
  @Input() itemPaddingBottom = '4px';
  @Input() itemPaddingLeft = '4px';
  @Input() itemPaddingRight = '4px';
  @Input() itemMinWidth?: number;
  @Input() itemMaxWidth?: number;
  @Input() itemFixedWidth?: number;
  @Input() maxItems?: number;
  @Input() smallSizeDivider = 2;
  @Input() noScroll = false;
  @Input() defaultIconColor?: string;
  @Output() itemSelected = new EventEmitter();

  content: MenuView[] = [];

  private source$: MenuSource$ = NO_MENU;
  private subscription?: Subscription;
  styles: any = {};
  private readonly changesDetection: ChangesDetection;

  constructor(
    public readonly i18n: I18nService,
    changesDetector: ChangeDetectorRef,
    ngZone: NgZone,
    private readonly popoverController: PopoverController,
  ) {
    this.changesDetection = new ChangesDetection(ngZone, changesDetector);
  }

  ngOnInit(): void {
    this.setSource(this.menu$ ?? NO_MENU, false);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['maxItems']) this.setSource(this.menu$ ?? NO_MENU, true);
    else if (changes['menu$']) this.setSource(this.menu$ ?? NO_MENU, false);
    this.styles = {
      '--item-space': this.itemSpace,
      '--item-padding-top': this.itemPaddingTop,
      '--item-padding-bottom': this.itemPaddingBottom,
      '--item-padding-left': this.itemPaddingLeft,
      '--item-padding-right': this.itemPaddingRight,
      '--item-min-width': this.itemMinWidth ? this.itemMinWidth + 'px' : '',
      '--item-max-width': this.itemMaxWidth ? this.itemMaxWidth + 'px' : '',
      '--item-fixed-width': this.itemFixedWidth ? this.itemFixedWidth + 'px' : '',
      '--separator-space': this.separatorSpace ?? '',
      '--small-size-divider': this.smallSizeDivider,
    }
  }

  private setSource(source$: MenuSource, forceRefresh: boolean): void {
    // TODO handle maxItems with moreMenu
    if (this.subscription && source$ === this.source$ && !forceRefresh) return;
    this.subscription?.unsubscribe();
    this.source$ = source$ instanceof Observable ? source$ : of(source$);
    this.subscription =  this.source$.pipe(
      switchMap(source => {
        if (!Array.isArray(source)) return source.state.pipe(map(state => state.content));
        if (source.length === 0) return of([]);
        if (source[0] instanceof ComputedMenuElement) return of(source as ComputedMenuElement<any>[]);
        return computeMenuElements(source as MenuElement<any>[]);
      }),
      debounceTimeExtended(0, 1),
      switchMap(items => {
        const content: Observable<MenuView>[] = [];
        this.toContent(items, content);
        if (content.length === 0) return of([]);
        return combineLatest(content);
      }),
      debounceTimeExtended(0, 1),
    )
    .subscribe(content => {
      this.content = content;
      this.changesDetection.detectChanges();
    });
  }

  private toContent(items: ComputedMenuElement<any>[], content: Observable<MenuView>[]): void {
    for (const item of items) {
      if (item.element instanceof MenuSection) {
        const subItems = item.element.getState(item).content;
        content.push(this.titleView(item.element));
        this.toContent(subItems, content);
      } else if (item.element instanceof MenuItem) {
        content.push(this.itemView(item.element, item.element.getState(item.state).children));
      } else if (item.element instanceof MenuSeparator) {
        content.push(of({type: 'separator'}));
      } else if (item.element instanceof MenuItemCustom) {
        content.push(of({type: 'custom', contentSelector: item.element.contentSelector}));
      }
    }
  }

  private titleView(section: MenuSection): Observable<Title> {
    return combineLatest([
      section.icon,
      section.label,
      section.backgroundColor,
      section.textColor,
      section.textSize,
      section.cssClass,
    ]).pipe(
      debounceTimeExtended(0, 1),
      map(r => ({
        type: 'title',
        icon: r[0],
        title: r[1] ?? '',
        backgroundColor: r[2],
        textColor: r[3],
        textSize: r[4],
        cssClass: r[5],
      }))
    );
  }

  private itemView(item: MenuItem, children: ComputedMenuElement<any>[] | undefined): Observable<Item> {
    return combineLatest([
      item.icon,
      item.label,
      item.subLabels,
      item.backgroundColor,
      item.textColor,
      item.textSize,
      item.cssClass,
      item.disabled,
      item.selected,
      item.spinner,
      item.badges,
    ]).pipe(
      debounceTimeExtended(0, 1),
      map(r => ({
        type: 'item',
        icon: r[0],
        label: r[1],
        subLabels: r[2],
        backgroundColor: r[3],
        textColor: r[4],
        textSize: r[5],
        cssClass: r[6],
        disabled: r[7],
        selected: r[8],
        spinner: r[9],
        badges: r[10],
        children,
        item,
      })),
    );
  }


  itemClick(item: Item, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (item.disabled) return;
    if (item.item.action) {
      this.itemSelected.emit();
      item.item.action(event);
    } else if (item.children?.length) {
      import('../menu-content/menu-content.component')
      .then(module => this.popoverController.create({
        component: module.MenuContentComponent,
        componentProps: {
          menu$: item.item.state.pipe(map(state => state.children)),
        },
        event: event,
        side: 'bottom',
        alignment: 'center',
        cssClass: 'always-tight-menu',
        dismissOnSelect: true,
        arrow: true,
      }))
      .then(p => p.present());
    }
  }

}
