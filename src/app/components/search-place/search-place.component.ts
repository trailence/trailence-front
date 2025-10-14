import { Component, EventEmitter, Output, ViewChild } from '@angular/core';
import { IonSearchbar, IonPopover, IonList, IonItem, IonLabel, IonSpinner } from "@ionic/angular/standalone";
import { BehaviorSubject, catchError, debounceTime, filter, map, of, switchMap, tap } from 'rxjs';
import { GeoService } from 'src/app/services/geolocation/geo.service';
import { Place } from 'src/app/services/geolocation/place';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { IonSearchbarCustomEvent, SearchbarChangeEventDetail } from '@ionic/core';
import { IdGenerator } from 'src/app/utils/component-utils';
import { ErrorService } from 'src/app/services/progress/error.service';
import { Console } from 'src/app/utils/console';
import { filterDefined } from 'src/app/utils/rxjs/filter-defined';

@Component({
    selector: 'app-search-place',
    templateUrl: './search-place.component.html',
    styleUrls: ['./search-place.component.scss'],
    imports: [
      IonSpinner, IonLabel, IonItem, IonList, IonPopover, IonSearchbar,
    ]
})
export class SearchPlaceComponent {

  @Output() placeSelected = new EventEmitter<Place>();

  id = IdGenerator.generateId();
  places: Place[] = [];
  searching = false;
  focus = false;

  private readonly name$ = new BehaviorSubject<string | IonSearchbarCustomEvent<SearchbarChangeEventDetail> | undefined | null>(undefined);

  @ViewChild('searchBar') searchbar!: IonSearchbar;
  @ViewChild('dropdown') dropdown!: IonPopover;

  constructor(
    public i18n: I18nService,
    geo: GeoService,
    errorService: ErrorService,
  ) {
    this.name$.pipe(
      filterDefined(),
      tap(() => this.resetPlaces()),
      map(event => {
        if (!event) return undefined;
        if (typeof event === 'string') return {value: event};
        return {event, value: event.detail.value};
      }),
      filter(event => (event?.value ?? '').trim().length > 2),
      debounceTime(10),
      tap(event => this.startSearching(event!.event)),
      switchMap(event => geo.findPlacesByName(event!.value!)), // NOSONAR
      catchError(e => {
        errorService.addTechnicalError(e, 'errors.search_places', []);
        Console.error(e);
        return of([]);
      }),
    ).subscribe(places => this.setPlaces(places));
  }

  inputChanged(event: IonSearchbarCustomEvent<SearchbarChangeEventDetail>): void {
    this.name$.next(event);
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.name$.next(this.searchbar.value);
  }

  private resetPlaces(): void {
    this.searching = false;
    this.places = [];
    this.dropdown.dismiss();
  }

  private startSearching(event?: IonSearchbarCustomEvent<SearchbarChangeEventDetail>): void {
    this.searching = true;
    this.dropdown.present(event);
  }

  private setPlaces(places: Place[]): void {
    this.places = places;
    this.searching = false;
  }

  setFocus(): void {
    this.searchbar.setFocus();
  }

}
