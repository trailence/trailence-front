/**
 * Points are stored relative to the previous point.
 * This allow to reduce the size of the serialized form.
 *
 * Fields use the following rules:
 * - undefined means same value as the previous point
 * - 0 means absence of value. For example, if the previous point has a time, but this point has no time information, it will be 0
 * - a positive or negative value indicates the difference compared to the previous point
 *
 * The first point of a segment contains always the original values.
 */
export interface PointDto {

    l?: number;
    n?: number;
    e?: number;
    t?: number;
    pa?: number;
    ea?: number;
    h?: number;
    s?: number;

  }
