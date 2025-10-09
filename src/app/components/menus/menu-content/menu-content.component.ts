import { ChangeDetectorRef, Component, Input, NgZone, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { ComputedMenuItem, ComputedMenuItems, MenuItem } from 'src/app/components/menus/menu-item';
import { IonItem, IonIcon, IonLabel, IonList, IonListHeader, IonButton, PopoverController } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { ChangesDetection } from 'src/app/utils/angular-helpers';

interface Section {
  type: 'toolbar' | 'menu';
  title?: ComputedMenuItem;
  items: ComputedMenuItem[];
}

@Component({
    selector: 'app-menu-content',
    templateUrl: './menu-content.component.html',
    styleUrls: ['./menu-content.component.scss'],
    imports: [IonButton, IonListHeader, IonList, IonLabel, IonIcon, IonItem, CommonModule, ToolbarComponent]
})
export class MenuContentComponent implements OnInit, OnChanges {

  @Input() menu?: (MenuItem | ComputedMenuItem)[]
  @Input() enableToolbarsForSections = 0;

  private readonly computed = new ComputedMenuItems(this.i18n);
  content: Section[] = [];
  parents: {from: ComputedMenuItem, list: MenuItem[]}[] = [];

  private readonly changesDetection: ChangesDetection;

  constructor(
    private readonly i18n: I18nService,
    changesDetector: ChangeDetectorRef,
    ngZone: NgZone,
    private readonly popoverController: PopoverController,
  ) {
    this.changesDetection = new ChangesDetection(ngZone, changesDetector);
  }

  ngOnInit(): void {
    this.setMenu(this.menu, true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['menu']) this.setMenu(this.menu, false);
  }

  private setMenu(items: (MenuItem | ComputedMenuItem)[] | undefined, forceRefresh: boolean): void {
    this.computed.compute(items).subscribe(refresh => {
      if (refresh || forceRefresh) this.refreshItems();
    });
  }

  private refreshItems(): void {
    const items = [...this.computed.items];
    this.content = [];
    while (this.content.length < this.enableToolbarsForSections && this.parents.length === 0) {
      const tb = this.extractToolbar(items);
      if (!tb) break;
      this.content.push(tb);
    }
    this.content.push({
      type: 'menu',
      items: items,
    })
    this.changesDetection.detectChanges();
  }

  private extractToolbar(items: ComputedMenuItem[]): Section | undefined {
    if (items.length === 0) return undefined;
    let i = items.findIndex((item, index) => item.separator || (index > 0 && item.sectionTitle));
    if (i < 0) return undefined;
    const firstTitle = items[0].sectionTitle;
    let title;
    if (firstTitle) {
      title = items[0];
      items.splice(0, 1);
      i--;
    } else {
      title = undefined;
    }
    const result = items.splice(0, i);
    if (items[0].separator) items.splice(0, 1);
    return {
      type: result.length > 1 && result.length < 6 ? 'toolbar' : 'menu',
      title: title,
      items: result,
    };
  }

  clicked(item: ComputedMenuItem, $event: Event): void {
    if (item.item.action) {
      item.item.action();
    } else {
      $event.preventDefault();
      $event.stopPropagation()
      if (item.children.items.length > 0) {
        this.parents.push({from: item, list: this.computed.items.map(i => i.item)});
        this.content = [];
        this.setMenu(item.children.items, true);
      }
    }
    this.changesDetection.detectChanges();
  }

  back($event: Event): void {
    $event.preventDefault();
    $event.stopPropagation()
    const parent = this.parents.pop();
    this.setMenu(parent!.list, true);
  }

  close(): void {
    this.popoverController.dismiss();
  }
}
