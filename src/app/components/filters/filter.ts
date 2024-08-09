export interface FilterNumeric {
  from?: number;
  to?: number;
}

export interface FilterEnum<T> {
  selected?: T[]
}
