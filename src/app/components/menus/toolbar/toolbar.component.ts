import { ChangeDetectorRef, Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { ComputedMenuItem, ComputedMenuItems, MenuItem } from '../menu-item';
import { CommonModule } from '@angular/common';
import { IonIcon, IonLabel, PopoverController, IonBadge } from "@ionic/angular/standalone";
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  imports: [IonBadge,
    IonLabel, IonIcon,
    CommonModule,
  ]
})
export class ToolbarComponent implements OnInit, OnChanges {

  @Input() items?: MenuItem[];

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

  computed = new ComputedMenuItems(this.i18n);
  moreMenu: MenuItem[] = [];
  styles: any = {};

  constructor(
    public readonly i18n: I18nService,
    private readonly changesDetector: ChangeDetectorRef,
    private readonly popoverController: PopoverController,
  ) {}

  ngOnInit(): void {
    this.computed.setMoreMenu(this.maxItems);
    this.setMenu(this.items);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['maxItems']) {
      this.computed.setMoreMenu(this.maxItems);
      this.setMenu(this.items);
    }
    else if (changes['items']) this.setMenu(this.items);
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
    if (refresh) {
      this.changesDetector.detectChanges();
    }
  }

  itemClick(item: ComputedMenuItem, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (item.disabled) return;
    if (item.item.action) {
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
