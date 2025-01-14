import { Observable } from 'rxjs';
import { PageRequest } from '../paginator/page-request';
import { PageResult } from '../paginator/page-result';

export class TableSettings {

  public pageRequest: PageRequest = new PageRequest();

  constructor(
    public columns: TableColumn[],
    public dataProvider: (request: PageRequest) => Observable<PageResult<any>>,
    public dataErrorI18nText: string,
    public pagingOptions: number[] = [5, 10, 25, 50, 100, 250, 500, 1000],
  ) {}

}

export enum HorizontalAlignment {
  LEFT = 'left',
  RIGHT = 'right',
  CENTER = 'center'
}

export class TableColumn {

  constructor(
    public title: string,
  ) {}

  public valueGetter: (element: any) => string = () => '';
  public sortable?: string;
  public horizontalAlignment: HorizontalAlignment = HorizontalAlignment.LEFT;

  public withField(fieldName: string, transform: (value: any) => string = v => '' + v): this {
    this.valueGetter = (element: any) => transform(element[fieldName]);
    return this;
  }

  public withSort(sortableFieldName: string): this {
    this.sortable = sortableFieldName;
    return this;
  }

  public withSortableField(fieldName: string, transform: (value: any) => string = v => '' + v): this {
    return this.withField(fieldName, transform).withSort(fieldName);
  }

  public hAlign(align: HorizontalAlignment): this {
    this.horizontalAlignment = align;
    return this;
  }

}
