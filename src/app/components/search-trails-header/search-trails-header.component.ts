import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { combineLatest, map, Observable, Subscription } from 'rxjs';
import { IonSpinner, IonSelect, IonSelectOption, IonButton, IonIcon } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FetchSourcePlugin } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';
import { NetworkService } from 'src/app/services/network/network.service';

@Component({
  selector: 'app-search-trails-header',
  templateUrl: './search-trails-header.component.html',
  styleUrl: './search-trails-header.component.scss',
  imports: [
    IonSpinner, IonSelect, IonSelectOption, IonButton, IonIcon,
    CommonModule,
  ]
})
export class SearchTrailsHeaderComponent implements OnInit, OnDestroy {

  @Input() searching!: boolean;
  @Input() searchEnabled!: boolean;
  @Output() search = new EventEmitter<string[]>();
  @Input() clearEnabled!: boolean;
  @Output() clear = new EventEmitter<any>();

  availablePlugins: FetchSourcePlugin[] = [];
  selectedPlugins: string[] = [];
  subscription?: Subscription;

  connected$: Observable<boolean>;

  constructor(
    public readonly i18n: I18nService,
    networkService: NetworkService,
    private readonly fetchSourceService: FetchSourceService,
  ) {
    this.connected$ = combineLatest([networkService.internet$, networkService.server$]).pipe(map(([i,s]) => i && s));
  }

  ngOnInit(): void {
    this.subscription = this.fetchSourceService.getAllowedPlugins$().subscribe(list => this.availablePlugins = list);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  setPlugins(value: string[]): void {
    this.selectedPlugins = value;
  }

  launchSearch(): void {
    this.search.emit(this.selectedPlugins);
  }

  launchClear(): void {
    this.clear.emit(true);
  }

}
