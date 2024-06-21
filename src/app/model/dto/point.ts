/**
 * Points are stored relative to the previous point.
 * This allow to reduce the size of the serialized form.
 *
 * Fields l (latitude), n (longitude), e (elevation), t (time) use the following rules:
 * - undefined means same value as the previous point
 * - 0 means absence of value. For example, if the previous point has a time, but this point has no time information, it will be 0
 * - a positive or negative value indicates the difference compared to the previous point
 *
 * The first point of a segment contains always the original values.
 *
 * Fields pa (position accuracy) and ea (elevation accuracy), which are expressed in meters, are stored in cm as integers
 * Field h (heading), expressed in degrees, is stored * 100 as integer
 * Field s (speed), expressed in meters per second, is stored in cm as integer
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
