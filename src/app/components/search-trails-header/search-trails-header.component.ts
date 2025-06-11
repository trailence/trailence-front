import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { IonSpinner, IonSelect, IonSelectOption, IonButton, IonIcon } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FetchSourcePlugin } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';

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

  availablePlugins: FetchSourcePlugin[] = [];
  selectedPlugins: string[] = [];
  subscription?: Subscription;

  constructor(
    public readonly i18n: I18nService,
    private readonly fetchSourceService: FetchSourceService,
  ) {
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

}
