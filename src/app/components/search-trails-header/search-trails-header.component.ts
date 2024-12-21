import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { IonSpinner, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { I18nService } from 'src/app/services/i18n/i18n.service';
import { FetchSourcePlugin } from 'src/app/services/fetch-source/fetch-source.interfaces';
import { FetchSourceService } from 'src/app/services/fetch-source/fetch-source.service';

@Component({
  selector: 'app-search-trails-header',
  templateUrl: './search-trails-header.component.html',
  styleUrl: './search-trails-header.component.scss',
  imports: [
    IonSpinner, IonSelect, IonSelectOption,
    CommonModule,
  ]
})
export class SearchTrailsHeaderComponent implements OnInit, OnDestroy {

  @Input() plugins$!: BehaviorSubject<string[]>;
  @Input() searching!: boolean;

  availablePlugins: FetchSourcePlugin[] = [];
  subscription?: Subscription;

  constructor(
    public readonly i18n: I18nService,
    private readonly fetchSourceService: FetchSourceService,
  ) {
  }

  ngOnInit(): void {
    this.subscription = this.fetchSourceService.getPlugins$().subscribe(list => this.availablePlugins = list);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  setPlugins(value: string[]): void {
    this.plugins$.next(value);
  }

}
