import { SelectGroup, SelectItem } from './select.interface';

export interface InternalSelectItem {
  item: SelectItem<any>;
  selected: boolean;
}

export interface InternalSelectGroup {
  group?: SelectGroup;
  subGroups: InternalSelectGroup[];
  items: InternalSelectItem[];
}

function buildInternal(groups: SelectGroup[], items: SelectItem<any>[], selected: any[], parentKey: string | undefined, parent: InternalSelectGroup): void {
  for (const group of groups) {
    if (group.parentKey === parentKey) {
      const internal: InternalSelectGroup = { group, subGroups: [], items: [] };
      parent.subGroups.push(internal);
      buildInternal(groups, items, selected, group.key, internal);
    }
  }
  for (const item of items) {
    if (item.groupKey === parentKey) {
      const internal: InternalSelectItem = { item, selected: selected.includes(item.value) };
      parent.items.push(internal);
    }
  }
}

export function buildRoot(groups: SelectGroup[] | undefined, items: SelectItem<any>[] | undefined, selected: any[] | undefined): InternalSelectGroup {
  const root: InternalSelectGroup = { subGroups: [], items: [] };
  buildInternal(groups || [], items || [], selected || [], undefined, root);
  return root;
}
