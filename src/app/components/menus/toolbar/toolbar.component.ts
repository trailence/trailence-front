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
  @Input() textSize = '13px';
  @Input() align: 'left' | 'right' | 'center' | 'fill' = 'fill';
  @Input() itemSpace = '4px';
  @Input() itemPadding = '0';
  @Input() itemMinWidth?: number;
  @Input() itemMaxWidth?: number;
  @Input() itemFixedWidth?: number;
  @Input() maxItems?: number;

  computed = new ComputedMenuItems();
  moreMenu: MenuItem[] = [];
  styles: any = {};

  constructor(
    public readonly i18n: I18nService,
    private readonly changesDetector: ChangeDetectorRef,
    private readonly popoverController: PopoverController,
  ) {}

  ngOnInit(): void {
    this.setMenu(this.items, true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['maxItems']) this.setMenu(this.items, true);
    else if (changes['items']) this.setMenu(this.items, false);
    this.styles = {
      '--item-space': this.itemSpace,
      '--item-padding': this.itemPadding,
      '--item-min-width': this.itemMinWidth ? this.itemMinWidth + 'px' : '',
      '--item-max-width': this.itemMaxWidth ? this.itemMaxWidth + 'px' : '',
      '--item-fixed-width': this.itemFixedWidth ? this.itemFixedWidth + 'px' : '',
    }
  }

  private setMenu(items: MenuItem[] | undefined, forceRefresh: boolean): void {
    this.computed.compute(items, forceRefresh).subscribe(refresh => {
      if (refresh) {
        this.moreMenu = [];
        let itemIndex = 0;
        for (const item of this.computed.items) {
          if (!item.separator) {
            itemIndex++;
          }
          if (this.maxItems && itemIndex > this.maxItems) {
            item.visible = false;
            if (this.moreMenu.length > 0 || !item.separator) {
              this.moreMenu.push(item.item);
            }
          }
        }
        this.changesDetector.detectChanges();
      }
    });
  }

  itemClick(item: ComputedMenuItem, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (item.item.action) {
      item.item.action();
    } else if (item.children.length > 0) {
      import('../menu-content/menu-content.component')
      .then(module => this.popoverController.create({
        component: module.MenuContentComponent,
        componentProps: {
          menu: item.children
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

  showMoreMenu(event: MouseEvent): void {
    import('../menu-content/menu-content.component')
    .then(module => this.popoverController.create({
      component: module.MenuContentComponent,
      componentProps: {
        menu: this.moreMenu
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
