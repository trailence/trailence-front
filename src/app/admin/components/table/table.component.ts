import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { PageResult } from '../paginator/page-result';
import { CommonModule } from '@angular/common';
import { PaginatorComponent } from '../paginator/paginator.component';
import { TableColumn, TableSettings } from './table-settings';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { ErrorService } from 'src/app/services/progress/error.service';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';

@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
  imports: [
    CommonModule,
    PaginatorComponent,
    I18nPipe,
    IonIcon, IonSpinner,
  ]
})
export class TableComponent implements OnInit {

  @Input() settings!: TableSettings;
  @Output() rowClick = new EventEmitter<any>();

  result?: PageResult<any>;
  nbPages?: number;
  pending = false;

  constructor(
    private readonly errorService: ErrorService,
  ) {}

  ngOnInit(): void {
    this.refreshData();
  }

  public refreshData(): void {
    this.pending = true;
    this.settings.dataProvider(this.settings.pageRequest).subscribe({
      next: result => {
        this.result = result;
        this.pending = false;
      },
      error: e => {
        this.errorService.addNetworkError(e, this.settings.dataErrorI18nText, []);
        this.pending = false;
      }
    });
  }

  public sortBy(column: TableColumn) {
    if (!column.sortable) return;
    if (this.settings.pageRequest.sortBy === column.sortable) {
      this.settings.pageRequest.sortAsc = !this.settings.pageRequest.sortAsc;
    } else {
      this.settings.pageRequest.sortBy = column.sortable;
      this.settings.pageRequest.sortAsc = true;
    }
    this.refreshData();
  }

}
