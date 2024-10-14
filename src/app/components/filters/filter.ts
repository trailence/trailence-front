export interface FilterNumeric {
  from?: number;
  to?: number;
}

export interface FilterEnum<T> {
  selected?: T[]
}

export interface FilterTags {
  tagsUuids: string[];
  exclude: boolean;

  onlyWithoutAnyTag: boolean;
  onlyWithAnyTag: boolean;
}

export interface NumericFilterConfig {
  min: number;
  max: number;
  step: number;
  formatter: (value: number) => string;
}
