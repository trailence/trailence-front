import { Injector } from '@angular/core'
import { TrailCollectionService } from './trail-collection.service';
import { TrailService } from './trail.service';
import { TrackService } from './track.service';
import { TagService } from './tag.service';
import { ShareService } from './share.service';
import { PhotoService } from './photo.service';
import { MySelectionService } from './my-selection.service';
import { MyPublicTrailsService } from './my-public-trails.service';
import { TrailLinkService } from './link.service';
import { ExtensionsService } from './extensions.service';
import { combineLatest, filter, first } from 'rxjs';

export const all = (injector: Injector) => {
  const collections = injector.get(TrailCollectionService);
  const trails = injector.get(TrailService);
  const tracks = injector.get(TrackService);
  const tags = injector.get(TagService);
  const links = injector.get(TrailLinkService);
  injector.get(ShareService);
  injector.get(PhotoService);
  injector.get(MySelectionService);
  injector.get(MyPublicTrailsService);
  injector.get(ExtensionsService);
  return combineLatest([
    collections.storeLoaded$,
    trails.storeLoaded$,
    tracks.storeLoaded$,
    tags.storeLoaded$,
    links.storeLoaded$,
  ]).pipe(
    filter(loaded => loaded.every(Boolean)),
    first(),
  );
};
