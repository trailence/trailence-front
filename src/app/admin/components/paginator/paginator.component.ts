import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { PageRequest } from './page-request';
import { IonIcon, IonButton, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { PageResult } from './page-result';
import { I18nPipe } from 'src/app/services/i18n/i18n-string';

@Component({
  selector: 'app-paginator',
  templateUrl: './paginator.component.html',
  styleUrl: './paginator.component.scss',
  imports: [
    I18nPipe,
    IonIcon, IonButton, IonSelect, IonSelectOption,
  ]
})
export class PaginatorComponent implements OnChanges {

  @Input() pageRequest: PageRequest = new PageRequest();
  @Output() pageRequestChange = new EventEmitter<PageRequest>();

  @Input() pagingOptions: number[] = [5, 10, 25, 50, 100, 250, 500, 1000];

  @Input() result?: PageResult<any>;

  nbPages?: number;
  firstElement?: number;
  lastElement?: number;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['result']) {
      if (this.result) {
        this.nbPages = Math.floor(this.result.count / this.result.size) + ((this.result.count % this.result.size) > 0 ? 1 : 0);
        this.firstElement = this.pageRequest.page * this.pageRequest.size + 1;
        this.lastElement = this.firstElement + this.result.elements.length - 1;
      } else {
        this.nbPages = undefined;
        this.firstElement = undefined;
        this.lastElement = undefined;
      }
    }
  }

  firstPage(): void {
    this.pageRequest.page = 0;
    this.refresh();
  }

  lastPage(): void {
    if (this.nbPages === undefined || this.nbPages === 0) return;
    this.pageRequest.page = this.nbPages - 1;
    this.refresh();
  }

  previousPage(): void {
    if (this.nbPages === undefined || this.nbPages === 0 || this.pageRequest.page === 0) return;
    this.pageRequest.page--;
    this.refresh();
  }

  nextPage(): void {
    if (this.nbPages === undefined || this.nbPages === 0 || this.pageRequest.page >= this.nbPages - 1) return;
    this.pageRequest.page++;
    this.refresh();
  }

  refresh(): void {
    this.pageRequestChange.emit(this.pageRequest);
  }

  setPageSize(value: any): void {
    if (typeof value !== 'number') return;
    if (this.pageRequest.size === value) return;
    this.pageRequest.size = value;
    this.refresh();
  }

}
