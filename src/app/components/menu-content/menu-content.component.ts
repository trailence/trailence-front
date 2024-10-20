import { ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { MenuItem } from 'src/app/utils/menu-item';
import { IonItem, IonIcon, IonLabel, IonPopover, IonContent, IonList, IonListHeader, IonButton } from "@ionic/angular/standalone";
import { CommonModule } from '@angular/common';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { first } from 'rxjs';

@Component({
  selector: 'app-menu-content',
  templateUrl: './menu-content.component.html',
  styleUrls: ['./menu-content.component.scss'],
  standalone: true,
  imports: [IonButton, IonListHeader, IonList, IonContent, IonPopover, IonLabel, IonIcon, IonItem, CommonModule]
})
export class MenuContentComponent implements OnInit {

  @Input() menu?: MenuItem[]

  computed: ComputedItem[] = [];
  parents: {from: ComputedItem, list: ComputedItem[]}[] = [];

  constructor(
    public i18n: I18nService,
    private changesDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.compute(this.menu);
  }

  private compute(items?: MenuItem[]): void {
    const toRemove: ComputedItem[] = [...this.computed];
    for (const item of (items ?? [])) {
      const existingIndex = toRemove.findIndex(c => c.item === item);
      if (existingIndex >= 0) {
        toRemove.splice(existingIndex, 1);
      } else {
        this.computed.push(new ComputedItem(item));
      }
    }
    for (const item of toRemove) {
      const index = this.computed.indexOf(item);
      if (index >= 0) this.computed.splice(index, 1);
    }
  }

  clicked(item: ComputedItem, $event: Event): void {
    if (item.item.action) {
      item.item.action();
    } else {
      $event.preventDefault();
      $event.stopPropagation()
      if (item.children.length > 0) {
        this.parents.push({from: item, list: this.computed});
        this.computed = [];
        this.compute(item.children);
      }
    }
    this.changesDetector.detectChanges();
  }

  back($event: Event): void {
    $event.preventDefault();
    $event.stopPropagation()
    const parent = this.parents.pop();
    this.computed = parent!.list;
    this.changesDetector.detectChanges();
  }
}

class ComputedItem {

  public separator: boolean;
  public clickable: boolean;
  public children: MenuItem[] = [];

  constructor(
    public item: MenuItem,
  ) {
    this.separator = !item.action && !item.icon && !item.label && !item.i18nLabel;
    this.clickable = !!item.action || !!item.children || !!item.childrenProvider;
    item.getChildren$().pipe(first()).subscribe(c => this.children = c);
  }
}
