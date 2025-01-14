export interface PageResult<T> {

  page: number;
  size: number;
  count: number;
  elements: T[];

}
