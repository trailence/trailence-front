import { Injector } from '@angular/core';
import { TrailActivity } from '@trailence/model/dto/trail-activity';
import { Trail } from '@trailence/model/trail';
import { TrailService } from '@trailence/services/database/trail.service';
import { TraceRecorderService } from '@trailence/services/trace-recorder/trace-recorder.service';
import { openSelectSinglePopup } from '../select-popup.component';
import { ACTIVITY_POPUP_TITLE_KEY, getActivityItems } from './select-activity';

export async function openActivityDialog(injector: Injector, trails: Trail[], isRecording: boolean = false) {
  let sel: TrailActivity | undefined | 'unspecified' = trails[0].activity ?? 'unspecified';
  for (let i = 1; i < trails.length; ++i)
    if ((trails[i].activity ?? 'unspecified') !== sel) {
      sel = undefined;
      break;
    }

  const loaded = getActivityItems();
  const newSel = await openSelectSinglePopup(injector, loaded.items, loaded.groups, sel, { titleKey: ACTIVITY_POPUP_TITLE_KEY });
  if (newSel === undefined) return;
  const newActivity: TrailActivity | undefined = newSel === 'unspecified' ? undefined : newSel;
  if (isRecording) {
    const trail = injector.get(TraceRecorderService).current?.trail;
    if (trail) trail.activity = newActivity;
  } else {
    const promises: Promise<any>[] = trails.map(trail => new Promise<any>(resolve => injector.get(TrailService).doUpdate(trail, t => t.activity = newActivity, () => resolve(true))));
    await Promise.all(promises);
  }
}
