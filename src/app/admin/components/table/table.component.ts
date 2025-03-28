import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { PageResult } from '../paginator/page-result';
import { CommonModule } from '@angular/common';
import { PaginatorComponent } from '../paginator/paginator.component';
import { TableColumn, TableSettings } from './table-settings';
import { IonIcon, IonSpinner, IonCheckbox } from '@ionic/angular/standalone';
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
    IonIcon, IonSpinner, IonCheckbox,
  ]
})
export class TableComponent implements OnInit, OnChanges {

  @Input() settings!: TableSettings;
  @Output() rowClick = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<any[]>();

  result?: PageResult<any>;
  pending = false;
  selection: any[] = [];

  constructor(
    private readonly errorService: ErrorService,
  ) {}

  ngOnInit(): void {
    this.refreshData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['settings']) {
      if (!changes['settings'].firstChange) {
        this.result = undefined;
        this.refreshData();
      }
    }
  }

  public refreshData(): void {
    this.pending = true;
    if (this.selection.length > 0) this.selectionChange.emit([]);
    this.selection = [];
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
    if (!column._sortable) return;
    if (this.settings.pageRequest.sortBy === column._sortable) {
      this.settings.pageRequest.sortAsc = !this.settings.pageRequest.sortAsc;
    } else {
      this.settings.pageRequest.sortBy = column._sortable;
      this.settings.pageRequest.sortAsc = true;
    }
    this.refreshData();
  }

  selectAll(selected: boolean): void {
    if (!selected || !this.result) this.selection = [];
    else this.selection = this.result.elements.filter(e => this.settings.selectable!(e));
    this.selectionChange.emit(this.selection);
  }

  select(element: any, selected: boolean): void {
    const index = this.selection.indexOf(element);
    if (selected && index < 0) this.selection.push(element);
    else if (!selected && index >= 0) this.selection.splice(index, 1);
    this.selectionChange.emit(this.selection);
  }

}
