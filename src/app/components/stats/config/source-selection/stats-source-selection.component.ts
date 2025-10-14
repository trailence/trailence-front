import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';
import { StatsSource, StatsSourceCollection } from '../../stats-config';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { IonSelect, IonSelectOption } from "@ionic/angular/standalone";
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { ShareService } from 'src/app/services/database/share.service';
import { AuthService } from 'src/app/services/auth/auth.service';
import { Share } from 'src/app/model/share';

interface SourceOption {
  value: string;
  name: string;
  source: StatsSource;
}

@Component({
  selector: 'app-stats-source-selection',
  templateUrl: './stats-source-selection.component.html',
  imports: [
    IonSelect, IonSelectOption,
  ]
})
export class StatsSourceSelectionComponent implements OnChanges, OnInit {

  @Input() source?: StatsSource[];
  @Output() sourceChange = new EventEmitter<StatsSource[]>();

  options: SourceOption[] = [];
  selection: string[] = [];
  description = '';

  private readonly source$ = new BehaviorSubject<StatsSource[] | undefined>(undefined);

  constructor(
    public readonly i18n: I18nService,
    private readonly collectionService: TrailCollectionService,
    private readonly shareService: ShareService,
    private readonly authService: AuthService,
  ) {
    this.source$.subscribe(s => {
      if (s) this.sourceChange.emit(s);
    });
  }

  ngOnInit(): void {
    combineLatest([
      this.source$,
      this.collectionService.getAllCollectionsReady$().pipe(map(list => list.filter(col => col.type === TrailCollectionType.MY_TRAILS || col.type === TrailCollectionType.CUSTOM))),
      this.shareService.getAllReady$().pipe(map(list => list.filter(share => share.owner !== this.authService.email))),
      this.i18n.texts$,
      this.i18n.langLoaded$,
    ]).subscribe(([src, collections, shares, texts, lang]) => {
      this.options = [];
      this.buildOptionsFromCollections(collections, src, texts);
      this.buildOptionsFromShares(shares, src, texts, lang);
      this.description = this.buildDescription(src, collections, shares, texts);
    });
  }

  private buildOptionsFromCollections(collections: TrailCollection[], src: StatsSourceCollection[] | undefined, texts: any): void {
    for (const col of this.collectionService.sort(collections)) {
      if (col.type === TrailCollectionType.MY_TRAILS) {
        this.options.push({
          value: 'my_trails',
          name: this.getCollectionName(col, texts),
          source: { type: 'collection', uuid: 'my_trails' },
        });
        if (src?.find(s => s.type === 'collection' && s.uuid === 'my_trails'))
          this.selection.push('my_trails');
      } else {
        this.options.push({
          value: 'collection_' + col.uuid,
          name: col.name,
          source: { type: 'collection', uuid: col.uuid, owner: col.owner },
        });
        if (src?.find(s => s.type === 'collection' && s.uuid === col.uuid && s.owner === col.owner))
          this.selection.push('collection_' + col.uuid);
      }
    }
  }

  private buildOptionsFromShares(shares: Share[], src: StatsSourceCollection[] | undefined, texts: any, lang: string): void {
    for (const share of shares.sort((s1, s2) => s1.name.localeCompare(s2.name, lang))) {
      this.options.push({
        value: 'share_' + share.uuid + '_' + share.owner,
        name: share.name + ' (' + texts.pages.stats.sources.shared_by + ' ' + share.owner + ')',
        source: { type: 'collection', owner: share.owner, uuid: share.uuid }
      });
      if (src?.find(s => s.type === 'collection' && s.uuid === share.uuid && s.owner === share.owner))
        this.selection.push('share_' + share.uuid + '_' + share.owner);
    }
  }

  private buildDescription(src: StatsSourceCollection[] | undefined, collections: TrailCollection[], shares: Share[], texts: any): string {
    if (!src || src.length === 0) return '';
    let result = '';
    const srcCollections =
      src
        .filter(s => s.type === 'collection' && (s.uuid === 'my_trails' || s.owner === this.authService.email))
        .map(s => collections.find(c => (s.uuid === 'my_trails' && c.type === TrailCollectionType.MY_TRAILS) || c.uuid === s.uuid))
        .filter(c => !!c);
    const srcShares =
      src
        .filter(s => s.type === 'collection' && s.owner !== this.authService.email)
        .map(s => shares.find(share => share.uuid === s.uuid && share.owner === s.owner))
        .filter(s => !!s);
    if (srcCollections.length === 1 && srcShares.length === 0)
      result = texts.pages.stats.sources.the_collection + ' ' + this.getCollectionName(srcCollections[0], texts);
    else if (srcShares.length === 1 && srcCollections.length === 0)
      result = texts.pages.stats.sources.the_share + ' ' + srcShares[0].name;
    else {
      if (srcCollections.length > 0) {
        result = srcCollections.length + ' ' + texts.pages.stats.sources[srcCollections.length === 1 ? 'collection_single' : 'collection_plural'];
        if (srcShares.length > 0) result += ', ';
      }
      if (srcShares.length > 0)
        result += srcShares.length + ' ' + texts.pages.stats.sources[srcShares.length === 1 ? 'share_single' : 'share_plural'];
    }
    return result;
  }

  ngOnChanges(): void {
    this.source$.next(this.source);
  }

  getCollectionName(collection: TrailCollection, texts: any): string {
    if (collection.name.length === 0 && collection.type === TrailCollectionType.MY_TRAILS)
      return texts.my_trails;
    return collection.name;
  }

  setSource(value: any): void {
    const newSel = (typeof value === 'string' ? [value] : Array.isArray(value) ? value : [])
      .map(s => this.options.find(o => o.value === s))
      .filter(s => !!s)
      .map(s => s.source);
    this.source = newSel;
    this.source$.next(newSel);
  }

}
