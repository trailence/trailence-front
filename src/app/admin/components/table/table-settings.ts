import { Observable } from 'rxjs';
import { PageRequest } from '../paginator/page-request';
import { PageResult } from '../paginator/page-result';
import { ObjectUtils } from 'src/app/utils/object-utils';

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
    public readonly title: string,
  ) {}

  _valueGetter: (element: any) => string = () => '';
  _sortable?: string;
  _horizontalAlignment: HorizontalAlignment = HorizontalAlignment.LEFT;
  _cellStyleFromRowData: (rowData: any) => any = () => {};
  _cellStyleFromValue: (value: any) => any = () => {};

  public withField(fieldName: string, transform: (value: any, rowData: any) => string = v => '' + v): this {
    this._valueGetter = (element: any) => transform(ObjectUtils.extractField(element, fieldName), element);
    return this;
  }

  public withSort(sortableFieldName: string): this {
    this._sortable = sortableFieldName;
    return this;
  }

  public withSortableField(fieldName: string, transform: (value: any, rowData: any) => string = v => '' + v): this {
    return this.withField(fieldName, transform).withSort(fieldName);
  }

  public hAlign(align: HorizontalAlignment): this {
    this._horizontalAlignment = align;
    return this;
  }

  public styleFromValue(styleProvider: (value: any) => any): this {
    this._cellStyleFromValue = styleProvider;
    return this;
  }

  public styleFromRowData(styleProvider: (rowData: any) => any): this {
    this._cellStyleFromRowData = styleProvider;
    return this;
  }

  _computeCellStyle(element: any, value: any): any {
    return {'text-align': this._horizontalAlignment, ...this._cellStyleFromValue(value), ...this._cellStyleFromRowData(element)};
  }
}
