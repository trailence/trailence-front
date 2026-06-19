import { Component, Injector, Input, OnInit } from '@angular/core';
import { Trail } from 'src/app/model/trail';
import { ModalController, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonFooter, IonButtons, IonButton, IonList, IonItem, IonRadio, IonCheckbox, IonRadioGroup } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailService } from 'src/app/services/database/trail.service';
import { TrailActivitiesGroups, TrailActivity, TrailActivityGroup } from 'src/app/model/dto/trail-activity';
import { TraceRecorderService } from 'src/app/services/trace-recorder/trace-recorder.service';

export async function openActivityDialog(injector: Injector, trails: Trail[], isRecording: boolean = false) {
  let sel = [trails[0].activity];
  for (let i = 1; i < trails.length; ++i) {
    if (trails[i].activity !== sel[0]) {
      sel = [];
      break;
    }
  }
  const modal = await injector.get(ModalController).create({
    component: ActivityPopup,
    backdropDismiss: true,
    componentProps: {
      selection: sel,
      multiple: false,
    }
  });
  await modal.present();
  const event = await modal.onDidDismiss();
  if (event.role !== 'ok' || event.data === undefined) return;
  const promises = trails.map(trail => new Promise(resolve => {
    if (isRecording) {
      const trail = injector.get(TraceRecorderService).current?.trail;
      if (trail) trail.activity = event.data[0];
      resolve(true);
    } else {
      injector.get(TrailService).doUpdate(trail, t => t.activity = event.data[0], () => resolve(true));
    }
  }));
  await Promise.all(promises);
}

export async function openActivitiesSelectionPopup(
  injector: Injector,
  selection: (TrailActivity | undefined)[],
  onApplied: (selection: (TrailActivity | undefined)[]) => void
) {
  const modal = await injector.get(ModalController).create({
    component: ActivityPopup,
    backdropDismiss: true,
    componentProps: {
      selection,
      multiple: true,
    }
  });
  modal.onDidDismiss().then(event => {
    if (event.role === 'ok' && event.data !== undefined) {
      onApplied(event.data);
    }
  });
  modal.present();
}

@Component({
  templateUrl: './activity-popup.component.html',
  styleUrl: './activity-popup.component.scss',
  imports: [
    IonRadioGroup, IonCheckbox, IonRadio, IonItem, IonList, IonButton, IonButtons, IonFooter, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, IonContent,
  ]
})
export class ActivityPopup implements OnInit {

  @Input() selection: (TrailActivity | undefined)[] = [];
  @Input() multiple = false;

  groups: Group[];

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    trailService: TrailService,
  ) {
    this.groups = TrailActivitiesGroups.map(group => {
      return {
        group: group.key,
        icon: trailService.getActivityGroupIcon(group.key),
        items: group.activities.map(activity => ({activity, icon: trailService.getActivityIcon(activity), selected: false})),
      }
    });
    this.groups.find(g => g.group === TrailActivityGroup.OTHERS)?.items?.push({activity: undefined, icon: 'question', selected: false});
  }

  ngOnInit(): void {
    this.setSelection(this.selection);
  }

  close(cancel: boolean): void {
    this.modalController.dismiss(cancel ? undefined : this.selection, cancel ? 'cancel' : 'ok');
  }

  setSelection(selected: any[]): void {
    for (const group of this.groups) {
      for (const item of group.items) {
        item.selected = selected.some(s => item.activity === s || (item.activity === undefined && s === ''));
      }
    }
    this.refreshSelection();
  }

  setItemSelected(item: Item, selected: boolean): void {
    item.selected = selected;
    if (!this.multiple) {
      for (const group of this.groups)
        for (const i of group.items)
          if (i !== item) i.selected = false;
    }
    this.refreshSelection();
  }

  isGroupFullySelected(group: Group): boolean {
    return group.items.every(i => i.selected);
  }

  isGroupPartiallySelected(group: Group): boolean {
    return group.items.some(i => i.selected) && !this.isGroupFullySelected(group);
  }

  setGroupSelected(group: Group, selected: boolean) {
    group.items.forEach(i => i.selected = selected);
    this.refreshSelection();
  }

  toggleGroupSelected(group: Group): void {
    this.setGroupSelected(group, !group.items.some(i => i.selected));
  }

  private refreshSelection(): void {
    this.selection = this.groups.flatMap(g => g.items).filter(item => item.selected).map(item => item.activity);
  }

}

interface Group {
  group: TrailActivityGroup;
  icon: string | undefined;
  items: Item[];
}

interface Item {
  activity: TrailActivity | undefined;
  icon: string;
  selected: boolean;
}
