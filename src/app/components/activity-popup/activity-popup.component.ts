import { Component, Injector, Input, OnInit } from '@angular/core';
import { Trail, TrailActivity } from 'src/app/model/trail';
import { ModalController, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonLabel, IonFooter, IonButtons, IonButton, IonList, IonItem, IonRadio, IonCheckbox, IonRadioGroup } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailService } from 'src/app/services/database/trail.service';

export async function openActivityDialog(injector: Injector, trails: Trail[]) {
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
  modal.onDidDismiss().then(event => {
    if (event.role === 'ok' && event.data !== undefined) {
      for (const trail of trails)
        injector.get(TrailService).doUpdate(trail, t => t.activity = event.data[0]);
    }
  });
  modal.present();
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
  imports: [
    IonRadioGroup, IonCheckbox, IonRadio, IonItem, IonList, IonButton, IonButtons, IonFooter, IonLabel, IonIcon, IonTitle, IonToolbar, IonHeader, IonContent,
  ]
})
export class ActivityPopup implements OnInit {

  @Input() selection: (TrailActivity | undefined)[] = [];
  @Input() multiple = false;

  list: Item[];

  constructor(
    public readonly i18n: I18nService,
    private readonly modalController: ModalController,
    trailService: TrailService,
  ) {
    this.list = Object.keys(TrailActivity).map(k => {
      const activity = (TrailActivity as any)[k];
      return {activity, icon: trailService.getActivityIcon(activity), selected: false};
    });
    this.list.push({activity: undefined, icon: 'question', selected: false});
  }

  ngOnInit(): void {
    this.setSelection(this.selection);
  }

  close(cancel: boolean): void {
    this.modalController.dismiss(cancel ? undefined : this.selection, cancel ? 'cancel' : 'ok');
  }

  setSelection(selected: any[]): void {
    for (const item of this.list) {
      item.selected = selected.findIndex(s => item.activity === s || (item.activity === undefined && s === '')) >= 0;
    }
    this.selection = this.list.filter(item => item.selected).map(item => item.activity);
  }

  setSelected(item: Item, selected: boolean): void {
    item.selected = selected;
    if (!this.multiple)
      this.list.forEach(i => {
        if (i !== item) i.selected = false;
      });
    this.selection = this.list.filter(item => item.selected).map(item => item.activity);
  }

}

interface Item {
  activity: TrailActivity | undefined;
  icon: string;
  selected: boolean;
}
