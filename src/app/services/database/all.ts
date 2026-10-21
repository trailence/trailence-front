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
import { combineLatest, filter, first, tap } from 'rxjs';

export const all = (injector: Injector, addProgress: (add: number) => void, progressAmount: number) => {
  let progressDone = 0;
  const setProgress = (nb: number) => {
    let newProgress = Math.floor(nb * progressAmount / 6);
    if (newProgress > progressDone) {
      addProgress(newProgress - progressDone);
      progressDone = newProgress;
    }
  };
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
  setProgress(1);
  return combineLatest([
    collections.storeLoaded$,
    trails.storeLoaded$,
    tracks.storeLoaded$,
    tags.storeLoaded$,
    links.storeLoaded$,
  ]).pipe(
    tap(loaded => {
      let nb = 0;
      for (const l of loaded) if (l) nb++;
      setProgress(nb + 1);
    }),
    filter(loaded => loaded.every(Boolean)),
    first(),
  );
};
