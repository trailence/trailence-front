import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, ViewChild } from '@angular/core';
import { IonSearchbar, IonPopover, IonList, IonItem, IonLabel, IonSpinner } from "@ionic/angular/standalone";
import { BehaviorSubject, debounceTime, filter, map, switchMap, tap } from 'rxjs';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { Place } from 'src/app/services/geolocation/place';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonSearchbarCustomEvent, SearchbarChangeEventDetail } from '@ionic/core';
import { IdGenerator } from 'src/app/utils/component-utils';

@Component({
  selector: 'app-search-place',
  templateUrl: './search-place.component.html',
  styleUrls: ['./search-place.component.scss'],
  standalone: true,
  imports: [IonSpinner, IonLabel, IonItem, IonList, IonPopover, IonSearchbar, CommonModule]
})
export class SearchPlaceComponent {

  @Output() placeSelected = new EventEmitter<Place>();

  id = IdGenerator.generateId();
  places: Place[] = [];
  searching = false;

  private name$ = new BehaviorSubject<IonSearchbarCustomEvent<SearchbarChangeEventDetail> | undefined>(undefined);

  @ViewChild('searchBar') searchbar!: IonSearchbar;
  @ViewChild('dropdown') dropdown!: IonPopover;

  constructor(
    public i18n: I18nService,
    geo: GeoService,
  ) {
    this.name$.pipe(
      filter(event => !!event),
      tap(() => this.resetPlaces()),
      filter(event => (event?.detail.value || '').trim().length > 2),
      tap(event => this.startSearching(event!)),
      switchMap(event => geo.findPlacesByName(event!.detail.value!)),
    ).subscribe(places => this.setPlaces(places));
  }

  inputChanged(event: IonSearchbarCustomEvent<SearchbarChangeEventDetail>): void {
    this.name$.next(event);
  }

  private resetPlaces(): void {
    this.searching = false;
    this.places = [];
    this.dropdown.dismiss();
  }

  private startSearching(event: IonSearchbarCustomEvent<SearchbarChangeEventDetail>): void {
    this.searching = true;
    this.dropdown.present(event);
  }

  private setPlaces(places: Place[]): void {
    this.places = places;
    this.searching = false;
  }

}
