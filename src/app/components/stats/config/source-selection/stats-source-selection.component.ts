import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { StatsSource } from '../../stats-config';
import { BehaviorSubject, combineLatest, map, Observable, of } from 'rxjs';
import { IonSelect, IonSelectOption } from "@ionic/angular/standalone";
import { TrailCollectionService } from 'src/app/services/database/trail-collection.service';
import { TrailCollection } from 'src/app/model/trail-collection';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { TrailCollectionType } from 'src/app/model/dto/trail-collection';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stats-source-selection',
  templateUrl: './stats-source-selection.component.html',
  imports: [
    IonSelect, IonSelectOption,
    CommonModule,
  ]
})
export class StatsSourceSelectionComponent implements OnChanges, OnInit {

  @Input() source?: StatsSource;
  @Output() sourceChange = new EventEmitter<StatsSource>();

  allCollections: TrailCollection[] = [];
  myTrails = TrailCollectionType.MY_TRAILS;
  description = '';

  private readonly source$ = new BehaviorSubject<StatsSource | undefined>(undefined);

  constructor(
    public readonly i18n: I18nService,
    private readonly collectionService: TrailCollectionService,
  ) {
    this.source$.subscribe(s => {
      if (s) this.sourceChange.emit(s);
    });
  }

  ngOnInit(): void {
    combineLatest([
      this.source$,
      this.collectionService.getAllCollectionsReady$(),
      this.i18n.texts$,
    ]).subscribe(([src, collections, texts]) => {
      this.allCollections = collections.filter(col => col.type === TrailCollectionType.MY_TRAILS || col.type === TrailCollectionType.CUSTOM);
      if (Array.isArray(src)) {
        if (src.length === 0) this.description = '';
        else if (src.length === 1) this.description = texts.pages.stats.sources.collection_single + ' ' + this.getCollectionName(src[0], collections, texts);
        else this.description = '' + src.length + ' ' + texts.pages.stats.sources.collection_plural;
      } else {
        this.description = '';
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.source$.next(this.source);
  }

  getCollectionName(id: string, collections: TrailCollection[], texts: any): string {
    if (id === 'my_trails') {
      const name = collections.find(c => c.type === TrailCollectionType.MY_TRAILS)?.name;
      if (name && name.length > 0) return name;
      return texts.my_trails;
    }
    return collections.find(c => c.uuid === id)?.name ?? '';
  }

  getCollectionName$(col: TrailCollection): Observable<string> {
    if (col.name.length > 0 || col.type === TrailCollectionType.CUSTOM) return of(col.name);
    return this.i18n.texts$.pipe(map(t => t.my_trails));
  }

  setSource(value: any): void {
    this.source = value;
    this.source$.next(value);
  }

}
