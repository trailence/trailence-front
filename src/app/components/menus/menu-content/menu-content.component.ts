import { ChangeDetectorRef, Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { ComputedMenuItem, ComputedMenuItems, MenuItem } from 'src/app/components/menus/menu-item';
import { IonItem, IonIcon, IonLabel, IonList, IonListHeader, IonButton } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';
import { I18nService } from 'src/app/services/i18n/i18n.service';

@Component({
    selector: 'app-menu-content',
    templateUrl: './menu-content.component.html',
    styleUrls: ['./menu-content.component.scss'],
    imports: [IonButton, IonListHeader, IonList, IonLabel, IonIcon, IonItem, CommonModule]
})
export class MenuContentComponent implements OnInit, OnChanges {

  @Input() menu?: MenuItem[]

  computed = new ComputedMenuItems();
  parents: {from: ComputedMenuItem, list: MenuItem[]}[] = [];

  identify = ComputedMenuItem.identify;

  constructor(
    public i18n: I18nService,
    private readonly changesDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.setMenu(this.menu);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['menu']) this.setMenu(this.menu);
  }

  private setMenu(items?: MenuItem[]): void {
    this.computed.compute(items).subscribe(refresh => {
      if (refresh) this.changesDetector.detectChanges();
    });
  }

  clicked(item: ComputedMenuItem, $event: Event): void {
    if (item.item.action) {
      item.item.action();
    } else {
      $event.preventDefault();
      $event.stopPropagation()
      if (item.children.length > 0) {
        this.parents.push({from: item, list: this.computed.items.map(i => i.item)});
        this.setMenu(item.children);
      }
    }
    this.changesDetector.detectChanges();
  }

  back($event: Event): void {
    $event.preventDefault();
    $event.stopPropagation()
    const parent = this.parents.pop();
    this.setMenu(parent!.list);
  }
}
