import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { ComputedMenuItem, ComputedMenuItems, MenuItem } from '../menu-item';
import { IonIcon, IonLabel, PopoverController, IonBadge } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ChangesDetection } from 'src/app/utils/angular-helpers';
import { AsyncPipe, NgClass, NgStyle } from '@angular/common';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  imports: [
    IonBadge, IonLabel, IonIcon,
    NgStyle, NgClass,
    AsyncPipe,
  ]
})
export class ToolbarComponent implements OnInit, OnChanges {

  @Input() items?: MenuItem[];
  @Input() computedItems?: ComputedMenuItem[];

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

  computed = new ComputedMenuItems(this.i18n);
  moreMenu: MenuItem[] = [];
  styles: any = {};
  showItems: ComputedMenuItem[] = [];

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
    if (this.computedItems) {
      this.showItems = this.computedItems;
    } else {
      this.computed.setMoreMenu(this.maxItems);
      this.setMenu(this.items);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['maxItems'] && !this.computedItems) {
      this.computed.setMoreMenu(this.maxItems);
      this.setMenu(this.items);
    }
    else if (changes['items'] && !this.computedItems) this.setMenu(this.items);
    else if (changes['computedItems'] && this.computedItems) this.showItems = this.computedItems;
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

  public refresh(): void {
    this.computed.refresh().subscribe(refresh => this.onRefresh(refresh));
  }

  private setMenu(items: MenuItem[] | undefined): void {
    this.computed.compute(items).subscribe(refresh => this.onRefresh(refresh));
  }

  private onRefresh(refresh: boolean): void {
    this.showItems = this.computedItems ?? this.computed.items;
    if (refresh) {
      this.changesDetection.detectChanges();
    }
  }

  itemClick(item: ComputedMenuItem, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (item.disabled) return;
    if (item.item.action) {
      this.itemSelected.emit();
      item.item.action();
    } else if (item.children.items.length > 0) {
      import('../menu-content/menu-content.component')
      .then(module => this.popoverController.create({
        component: module.MenuContentComponent,
        componentProps: {
          menu: item.children.items,
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
