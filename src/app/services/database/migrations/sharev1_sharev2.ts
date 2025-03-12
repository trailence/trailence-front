import { ShareDto, ShareElementType } from 'src/app/model/dto/share';
import { DatabaseService, SHARE_TABLE_NAME } from '../database.service';
import { SimpleStoreItem } from '../simple-store';
import { Console } from 'src/app/utils/console';

export class ShareV1ToShareV2 {

  public static migrate(dbService: DatabaseService): Promise<void> {
    Console.info("Migrate shares from V1 to V2");
    const db = dbService.db?.db;
    if (!db) return Promise.resolve();
    return db.transaction('rw', [SHARE_TABLE_NAME], () => {
      const table = db.table(SHARE_TABLE_NAME);
      return table.toArray().then((items: SimpleStoreItem<ShareV1Dto>[]) => {
        const newItems = items.map(v1 => ShareV1ToShareV2.toV2(v1));
        return table.bulkPut(newItems);
      });
    }).then();
  }

  private static toV2(v1: SimpleStoreItem<ShareV1Dto>): SimpleStoreItem<ShareDto> {
    return {
      key: v1.key,
      createdLocally: v1.createdLocally,
      deletedLocally: v1.deletedLocally,
      updatedLocally: v1.updatedLocally ?? false,
      item: {
        uuid: v1.item.id,
        owner: v1.item.from,
        version: 1,
        createdAt: v1.item.createdAt,
        updatedAt: v1.item.createdAt,
        recipients: [v1.item.to],
        type: v1.item.type,
        name: v1.item.name,
        includePhotos: v1.item.includePhotos,
        elements: v1.item.elements,
        trails: v1.item.trails,
        mailLanguage: v1.item.toLanguage,
      }
    };
  }

}

interface ShareV1Dto {
  id: string;
  name: string;
  from: string;
  to: string;
  type: ShareElementType;
  createdAt: number;
  elements: string[] | null | undefined;
  trails: string[] | null | undefined;
  toLanguage: string | null | undefined;
  includePhotos: boolean | null | undefined;
}