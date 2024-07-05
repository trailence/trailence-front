import { TrailenceHttpRequest } from './http-request';

export class TrailenceHttpResponse<T> {
  constructor(
    public request: TrailenceHttpRequest,
    public body: T | null,
    public headers: { [header: string]: string },
    public status: number,
    public statusText: string
  ) {}
}
