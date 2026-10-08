import { Injector } from '@angular/core';
import { ShareService } from '@trailence/services/database/share.service';
import { TrailCollectionService } from '@trailence/services/database/trail-collection.service';
import { firstValueFrom, map } from 'rxjs';
import { SelectGroup, SelectItem } from '../select.interface';
import { isPublicationCollection, TrailCollectionType } from '@trailence/model/dto/trail-collection';
import { Share } from '@trailence/model/share';
import { TrailCollection } from '@trailence/model/trail-collection';

export interface CollectionItem {
  uuid: string;
  owner?: string;
  collection?: TrailCollection;
  share?: Share;
}

export async function getCollectionsItems(injector: Injector, includePublicationCollections = false, includeSharesWithMe = false): Promise<{items: SelectItem<CollectionItem>[], groups: SelectGroup[] | undefined}> {
  let collections$ = firstValueFrom(injector.get(TrailCollectionService).getAllCollectionsReady$());
  if (!includePublicationCollections)
    collections$ = collections$.then(list => list.filter(c => !isPublicationCollection(c.type)));
  const shares$ = includeSharesWithMe ? firstValueFrom(injector.get(ShareService).getAllSharesWithMeReady$()) : Promise.resolve([]);
  const [collections, shares] = await Promise.all([collections$, shares$]);
  const collectionsItems = collections.map(c => {
    const item = {groupKey: 'collection', value: {uuid: c.uuid, owner: c.owner, collection: c}} as SelectItem<CollectionItem>;
    if (c.name.length === 0 && c.type === TrailCollectionType.MY_TRAILS)
      item.labelI18n = 'my_trails';
    else
      item.fixedLabel = c.name;
    return item;
  });
  if (shares.length === 0) {
    return {items: collectionsItems, groups: undefined};
  }
  const sharesItems = shares.map(s => ({groupKey: 'share', value: {uuid: s.uuid, owner: s.owner, share: s}, fixedLabel: s.name}) as SelectItem<CollectionItem>);
  return {
    items: [...collectionsItems, ...sharesItems],
    groups: [
      {
        key: 'collection',
        icon: 'collection',
        labelI18n: 'menu.collections'
      }, {
        key: 'share',
        icon: 'share',
        labelI18n: 'menu.shared_with_me'
      }
    ]
  };
}
