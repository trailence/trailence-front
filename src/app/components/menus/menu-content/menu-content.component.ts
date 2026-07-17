import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { IonItem, IonIcon, IonLabel, IonList, IonListHeader, IonButton, PopoverController } from "@ionic/angular/standalone";
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { ChangesDetection } from 'src/app/utils/angular-helpers';
import { AsyncPipe } from '@angular/common';
import { BrowserService } from 'src/app/services/browser/browser.service';
import { combineLatest, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { Badges, ComputedMenuElement, computeMenuElements, MenuElement, MenuItem, MenuItemCustom, MenuSection, MenuSeparator, MenuSource, MenuSource$ } from '../menu-item';
import { debounceTimeExtended } from 'src/app/utils/rxjs/debounce-time-extended';

type MenuView = ToolbarView | Title | Separator | Item | Custom;

interface ToolbarView {
  type: 'toolbar';
  content: ComputedMenuElement<any>[];
}
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
    selector: 'app-menu-content',
    templateUrl: './menu-content.component.html',
    styleUrls: ['./menu-content.component.scss'],
    imports: [
      IonButton, IonListHeader, IonList, IonLabel, IonIcon, IonItem,
      ToolbarComponent,
      AsyncPipe,
    ]
})
export class MenuContentComponent implements OnInit, OnChanges {

  @Input() menu$?: MenuSource;

  content: MenuView[] = [];
  parents: {source: MenuSource, icon: Observable<string | undefined>, title: Observable<string | undefined>}[] = [];

  private readonly changesDetection: ChangesDetection;
  private source$: MenuSource$ = NO_MENU;
  private subscription?: Subscription;

  constructor(
    changesDetector: ChangeDetectorRef,
    ngZone: NgZone,
    private readonly popoverController: PopoverController,
    private readonly elementRef: ElementRef,
    private readonly browser: BrowserService,
  ) {
    this.changesDetection = new ChangesDetection(ngZone, changesDetector);
  }

  ngOnInit(): void {
    this.setSource(this.menu$ ?? NO_MENU);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['menu$']) this.setSource(this.menu$ ?? NO_MENU);
  }

  private setSource(source$: MenuSource): void {
    if (this.subscription && source$ === this.source$) return;
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
      this.changesDetection.detectChanges(() => setTimeout(() => this.checkHeight(), 10));
    });
  }

  private toContent(items: ComputedMenuElement<any>[], content: Observable<MenuView>[]): void {
    for (const item of items) {
      if (item.element instanceof MenuSection) {
        const subItems = item.element.getState(item).content;
        if (subItems.length >= item.element.showAsToolbarMin && subItems.length <= item.element.showAsToolbarMax) {
          content.push(of({type: 'toolbar', content: subItems}));
        } else {
          content.push(this.titleView(item.element));
          this.toContent(subItems, content);
        }
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


  clicked(item: Item, $event: Event): void {
    if (item.item.action) {
      item.item.action($event);
    } else {
      $event.preventDefault();
      $event.stopPropagation()
      if (item.children?.length) {
        this.parents.push({source: this.source$, icon: item.item.icon ?? of(undefined), title: item.item.label ?? of(undefined)});
        this.setSource(item.item.state.pipe(map(state => state.children as ComputedMenuElement<any>[])));
      }
    }
  }

  back($event: Event): void {
    $event.preventDefault();
    $event.stopPropagation()
    const parent = this.parents.pop();
    this.setSource(parent!.source);
  }

  close(): void {
    this.popoverController.dismiss();
  }

  private checkHeight(): void {
    if (this.elementRef.nativeElement.parentElement?.nodeName?.toLowerCase() === 'ion-popover') {
      const bh = this.browser.height;
      const y = this.elementRef.nativeElement.offsetTop;
      this.elementRef.nativeElement.style.maxHeight = (bh - y - 5) + 'px';
    }
  }
}
