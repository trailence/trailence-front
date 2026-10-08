import { getActivityGroupIcon, getActivityIcon, TrailActivitiesGroups, TrailActivity, TrailActivityGroup } from '@trailence/model/dto/trail-activity';
import { SelectGroup, SelectItem } from '../select.interface';

export const ACTIVITIES_POPUP_TITLE_KEY = 'select.activities.title';
export const ACTIVITY_POPUP_TITLE_KEY = 'metadata.activity';

let _GROUPS: SelectGroup[] | undefined;
let _ITEMS: SelectItem<TrailActivity | 'unspecified'>[] | undefined;

export function getActivityItems(): {groups: SelectGroup[], items: SelectItem<TrailActivity | 'unspecified'>[]} {
  if (_GROUPS && _ITEMS) return {groups: _GROUPS, items: _ITEMS};
  _GROUPS = TrailActivitiesGroups.map(group => ({
    key: group.key,
    icon: getActivityGroupIcon(group.key),
    labelI18n: 'activities_groups.' + group.key,
  }));
  _ITEMS = Object.values(TrailActivity).map(activity => ({
    groupKey: TrailActivitiesGroups.find(g => g.activities.includes(activity))?.key,
    icon: getActivityIcon(activity),
    labelI18n: 'activity.' + activity,
    value: activity,
  }));
  _ITEMS.push({
    groupKey: TrailActivityGroup.OTHERS,
    icon: 'question',
    value: 'unspecified',
    labelI18n: 'activity.unspecified',
  });
  return {groups: _GROUPS, items: _ITEMS};
}
