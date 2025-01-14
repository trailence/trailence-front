export class PageRequest {

  constructor(
    public page: number = 0,
    public size: number = 25,
    public sortBy: string | undefined = undefined,
    public sortAsc: boolean = true,
  ) {}

  public toQueryParams(): string {
    let s = '?page=' + this.page + '&size=' + this.size;
    if (this.sortBy) s += '&sort=' + this.sortBy + ',' + (this.sortAsc ? 'asc' : 'desc');
    return s;
  }

}
